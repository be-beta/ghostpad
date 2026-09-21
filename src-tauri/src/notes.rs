//! Persistencia do texto do usuario.
//!
//! Cinco espacos fixos, numerados de 1 a 5. Nao ha criar, fechar, nomear nem
//! reordenar: um espaco vazio ja e uma anotacao nova. E o modelo mais simples
//! que atende "varias anotacoes ao mesmo tempo" sem virar gerenciador de
//! arquivos.
//!
//! Escrita direta em arquivo, sem o plugin de store. O plugin guarda uma copia
//! em memoria e regrava tudo ao sair; com mais de uma instancia viva, uma copia
//! desatualizada podia sobrescrever o texto novo. Aqui cada gravacao vai ao
//! disco na hora e nada e regravado implicitamente.
//!
//! Layout em %APPDATA%/com.ghostpad.app/:
//!   notes/note-1.txt        texto do espaco 1
//!   notes/note-1.bak.txt    versao imediatamente anterior
//!   snapshots/1/<ms>.txt    versoes anteriores do espaco 1
//!   draft.txt, draft.json   formato antigo, migrado para o espaco 1
//!
//! Todo comando daqui e `async` de proposito. No Tauri, comando sincrono roda na
//! thread principal, e gravar com `sync_all` a cada pausa de digitacao travava a
//! janela por instantes — o Windows chegava a trocar o cursor do mouse para o de
//! "ocupado" enquanto a pessoa digitava.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// Quantos espacos de anotacao existem. Poucos de proposito: a proposta e
/// anotar agora, nao arquivar.
pub const SLOTS: u8 = 5;

/// Intervalo minimo entre versoes guardadas.
///
/// Curto demais enche o historico de rascunhos quase iguais; longo demais perde
/// o texto de uma hora atras, que e justamente o que a pessoa quer de volta.
const SNAPSHOT_INTERVAL_SECS: u64 = 180;

/// Quantas versoes ficam guardadas por espaco. Sao arquivos de texto pequenos.
const MAX_SNAPSHOTS: usize = 20;

/// Serializa gravacoes. Sem isto, dois saves concorrentes podem terminar fora
/// de ordem e o mais antigo vencer.
#[derive(Default)]
pub struct NotesLock(Mutex<()>);

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn check_slot(slot: u8) -> Result<u8, String> {
    if (1..=SLOTS).contains(&slot) {
        Ok(slot)
    } else {
        Err(format!("Espaço inválido: {slot}"))
    }
}

fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("notes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn note_path(app: &AppHandle, slot: u8) -> Result<PathBuf, String> {
    Ok(notes_dir(app)?.join(format!("note-{slot}.txt")))
}

fn backup_path(app: &AppHandle, slot: u8) -> Result<PathBuf, String> {
    Ok(notes_dir(app)?.join(format!("note-{slot}.bak.txt")))
}

// ---------------------------------------------------------------------------
// Versoes anteriores
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    /// Nome do arquivo sem extensao: o instante em milissegundos.
    pub id: String,
    pub saved_at_ms: u64,
    pub chars: usize,
    /// Comeco do texto, para a pessoa reconhecer a versao sem abri-la.
    pub preview: String,
}

fn snapshots_dir(app: &AppHandle, slot: u8) -> Result<PathBuf, String> {
    let root = data_dir(app)?.join("snapshots");
    let dir = root.join(slot.to_string());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Antes dos espacos, as versoes ficavam soltas em snapshots/. Elas pertencem
    // ao espaco 1, que herdou a anotacao unica; sem isto o historico do usuario
    // sumiria da interface sem nunca ter sido apagado.
    if slot == 1 {
        for entry in fs::read_dir(&root).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().is_some_and(|ext| ext == "txt") {
                if let Some(name) = path.file_name() {
                    let _ = fs::rename(&path, dir.join(name));
                }
            }
        }
    }

    Ok(dir)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Instantes das versoes guardadas, do mais novo para o mais antigo.
fn snapshot_stamps(dir: &PathBuf) -> Vec<u64> {
    let mut stamps: Vec<u64> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            entry
                .path()
                .file_stem()
                .and_then(|stem| stem.to_str())
                .and_then(|stem| stem.parse::<u64>().ok())
        })
        .collect();
    stamps.sort_unstable_by(|a, b| b.cmp(a));
    stamps
}

/// Guarda o texto que esta prestes a ser substituido, no maximo a cada
/// `SNAPSHOT_INTERVAL_SECS`, e descarta as versoes mais antigas.
///
/// Guarda o texto ANTERIOR de proposito: o atual ja esta no arquivo do espaco.
/// O que nao existe em lugar nenhum e o que acabou de ser sobrescrito.
fn snapshot_previous(app: &AppHandle, slot: u8, previous: &str) {
    if previous.trim().is_empty() {
        return;
    }

    let Ok(dir) = snapshots_dir(app, slot) else { return };
    let now = now_ms();
    let stamps = snapshot_stamps(&dir);
    if now.saturating_sub(stamps.first().copied().unwrap_or(0)) < SNAPSHOT_INTERVAL_SECS * 1000 {
        return;
    }

    if fs::write(dir.join(format!("{now}.txt")), previous).is_err() {
        return;
    }

    for stamp in snapshot_stamps(&dir).into_iter().skip(MAX_SNAPSHOTS) {
        let _ = fs::remove_file(dir.join(format!("{stamp}.txt")));
    }
}

#[tauri::command]
pub async fn list_snapshots(app: AppHandle, slot: u8) -> Result<Vec<SnapshotInfo>, String> {
    let dir = snapshots_dir(&app, check_slot(slot)?)?;
    let mut items: Vec<SnapshotInfo> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let id = path.file_stem()?.to_str()?.to_string();
            let saved_at_ms = id.parse::<u64>().ok()?;
            let content = fs::read_to_string(&path).ok()?;
            let preview: String = content
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(80)
                .collect();
            Some(SnapshotInfo { id, saved_at_ms, chars: content.chars().count(), preview })
        })
        .collect();

    items.sort_unstable_by(|a, b| b.saved_at_ms.cmp(&a.saved_at_ms));
    Ok(items)
}

#[tauri::command]
pub async fn read_snapshot(app: AppHandle, slot: u8, id: String) -> Result<String, String> {
    // Nome vem do proprio app, mas e validado: so digitos nunca escapam da pasta.
    if !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Identificador inválido".into());
    }
    let dir = snapshots_dir(&app, check_slot(slot)?)?;
    fs::read_to_string(dir.join(format!("{id}.txt"))).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Arquivos de texto do usuario
// ---------------------------------------------------------------------------

/// Le um arquivo de texto escolhido pelo usuario no dialogo do sistema.
///
/// O caminho vem do dialogo nativo, nao de texto digitado: o usuario escolhe
/// explicitamente o arquivo, arquivo por arquivo.
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Não foi possível abrir: {e}"))
}

/// Grava o texto num arquivo escolhido pelo usuario, de forma atomica.
#[tauri::command]
pub async fn write_text_file(path: String, text: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let tmp = target.with_extension("ghostpad.tmp");

    {
        let mut file =
            fs::File::create(&tmp).map_err(|e| format!("Não foi possível salvar: {e}"))?;
        file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }

    fs::rename(&tmp, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Não foi possível salvar: {e}")
    })
}

// ---------------------------------------------------------------------------
// Espacos de anotacao
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotInfo {
    pub slot: u8,
    pub chars: usize,
}

/// Quanto texto ha em cada espaco, para a barra mostrar quais estao em uso.
#[tauri::command]
pub async fn list_slots(app: AppHandle) -> Result<Vec<SlotInfo>, String> {
    let mut slots = Vec::new();
    for slot in 1..=SLOTS {
        let chars = note_path(&app, slot)
            .ok()
            .and_then(|path| fs::read_to_string(path).ok())
            .map(|text| text.chars().count())
            .unwrap_or(0);
        slots.push(SlotInfo { slot, chars });
    }
    Ok(slots)
}

#[tauri::command]
pub async fn load_note(app: AppHandle, slot: u8) -> Result<String, String> {
    let slot = check_slot(slot)?;

    for path in [note_path(&app, slot)?, backup_path(&app, slot)?] {
        if let Ok(text) = fs::read_to_string(path) {
            return Ok(text);
        }
    }

    // Migracao: antes de existirem espacos havia uma anotacao so. Ela vira a
    // primeira, e os formatos antigos sao lidos uma unica vez.
    if slot == 1 {
        let dir = data_dir(&app)?;
        for name in ["draft.txt", "draft.bak.txt"] {
            if let Ok(text) = fs::read_to_string(dir.join(name)) {
                return Ok(text);
            }
        }
        if let Ok(raw) = fs::read_to_string(dir.join("draft.json")) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
                    return Ok(text.to_string());
                }
            }
        }
    }

    Ok(String::new())
}

/// Grava de forma atomica: escreve num temporario, forca ao disco e so entao
/// substitui o arquivo. Uma queda no meio deixa o arquivo antigo intacto, nunca
/// um arquivo pela metade.
#[tauri::command]
pub async fn save_note(
    app: AppHandle,
    lock: State<'_, NotesLock>,
    slot: u8,
    text: String,
) -> Result<(), String> {
    let slot = check_slot(slot)?;
    let _guard = lock.0.lock().map_err(|_| "lock envenenado".to_string())?;

    let main = note_path(&app, slot)?;
    let tmp = main.with_extension("tmp");

    // Evita girar o backup quando nada mudou (ex.: salvar ao fechar sem editar).
    let previous = fs::read_to_string(&main).unwrap_or_default();
    if previous == text {
        return Ok(());
    }

    snapshot_previous(&app, slot, &previous);

    {
        let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }

    if main.exists() {
        let _ = fs::copy(&main, backup_path(&app, slot)?);
    }
    fs::rename(&tmp, &main).map_err(|e| e.to_string())?;

    Ok(())
}
