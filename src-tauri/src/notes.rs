//! Persistencia do texto do usuario.
//!
//! Escrita direta em arquivo, sem o plugin de store. O plugin guarda uma copia
//! em memoria e regrava tudo ao sair; com mais de uma instancia viva, uma copia
//! desatualizada podia sobrescrever o texto novo. Aqui cada gravacao vai ao
//! disco na hora e nada e regravado implicitamente.
//!
//! Layout em %APPDATA%/com.ghostpad.app/:
//!   draft.txt       texto atual
//!   draft.bak.txt   versao imediatamente anterior
//!   draft.json      formato antigo, lido uma unica vez para migrar

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// Intervalo minimo entre versoes guardadas.
///
/// Curto demais enche o historico de rascunhos quase iguais; longo demais perde
/// o texto de uma hora atras, que e justamente o que a pessoa quer de volta.
const SNAPSHOT_INTERVAL_SECS: u64 = 180;

/// Quantas versoes ficam guardadas. Sao arquivos de texto pequenos.
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

fn snapshots_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("snapshots");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Instante da versao mais recente guardada.
fn last_snapshot_ms(dir: &PathBuf) -> u64 {
    fs::read_dir(dir)
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
        .max()
        .unwrap_or(0)
}

/// Guarda o texto que esta prestes a ser substituido, no maximo a cada
/// `SNAPSHOT_INTERVAL_SECS`, e descarta as versoes mais antigas.
///
/// Guarda o texto ANTERIOR de proposito: o atual ja esta em draft.txt. O que
/// nao existe em lugar nenhum e o que acabou de ser sobrescrito.
fn snapshot_previous(app: &AppHandle, previous: &str) {
    if previous.trim().is_empty() {
        return;
    }

    let Ok(dir) = snapshots_dir(app) else { return };
    let now = now_ms();
    if now.saturating_sub(last_snapshot_ms(&dir)) < SNAPSHOT_INTERVAL_SECS * 1000 {
        return;
    }

    if fs::write(dir.join(format!("{now}.txt")), previous).is_err() {
        return;
    }

    // Poda: mantem as mais recentes.
    let mut stamps: Vec<u64> = fs::read_dir(&dir)
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
    for stamp in stamps.into_iter().skip(MAX_SNAPSHOTS) {
        let _ = fs::remove_file(dir.join(format!("{stamp}.txt")));
    }
}

#[tauri::command]
pub fn list_snapshots(app: AppHandle) -> Result<Vec<SnapshotInfo>, String> {
    let dir = snapshots_dir(&app)?;
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
pub fn read_snapshot(app: AppHandle, id: String) -> Result<String, String> {
    // Nome vem do proprio app, mas e validado: so digitos nunca escapam da pasta.
    if !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Identificador invalido".into());
    }
    fs::read_to_string(snapshots_dir(&app)?.join(format!("{id}.txt"))).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_draft(app: AppHandle) -> Result<String, String> {
    let dir = data_dir(&app)?;

    for name in ["draft.txt", "draft.bak.txt"] {
        if let Ok(text) = fs::read_to_string(dir.join(name)) {
            return Ok(text);
        }
    }

    // Migracao do formato do plugin de store.
    if let Ok(raw) = fs::read_to_string(dir.join("draft.json")) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
                return Ok(text.to_string());
            }
        }
    }

    Ok(String::new())
}

/// Grava de forma atomica: escreve num temporario, forca ao disco e so entao
/// substitui o arquivo. Uma queda no meio deixa o arquivo antigo intacto, nunca
/// um arquivo pela metade.
#[tauri::command]
pub fn save_draft(app: AppHandle, lock: State<'_, NotesLock>, text: String) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|_| "lock envenenado".to_string())?;
    let dir = data_dir(&app)?;
    let main = dir.join("draft.txt");
    let tmp = dir.join("draft.txt.tmp");

    // Evita girar o backup quando nada mudou (ex.: salvar ao fechar sem editar).
    let previous = fs::read_to_string(&main).unwrap_or_default();
    if previous == text {
        return Ok(());
    }

    snapshot_previous(&app, &previous);

    {
        let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }

    if main.exists() {
        let _ = fs::copy(&main, dir.join("draft.bak.txt"));
    }
    fs::rename(&tmp, &main).map_err(|e| e.to_string())?;

    Ok(())
}
