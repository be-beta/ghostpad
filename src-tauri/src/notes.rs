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

use tauri::{AppHandle, Manager, State};

/// Serializa gravacoes. Sem isto, dois saves concorrentes podem terminar fora
/// de ordem e o mais antigo vencer.
#[derive(Default)]
pub struct NotesLock(Mutex<()>);

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
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
    if fs::read_to_string(&main).map(|old| old == text).unwrap_or(false) {
        return Ok(());
    }

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
