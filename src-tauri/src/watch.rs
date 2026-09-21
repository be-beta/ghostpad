//! Deteccao de softwares de gravacao e chamada em execucao.
//!
//! Serve a um unico proposito: o usuario esquecer de ligar o modo oculto e o
//! GhostPad aparecer no video. O app avisa; a decisao continua sendo dele, e
//! nada e ativado sozinho.
//!
//! Isto olha apenas nomes de processos em execucao — nao inspeciona janelas,
//! conteudo, nem o que esta sendo gravado.

use serde::Serialize;

#[cfg(target_os = "windows")]
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};

/// Executavel -> nome que o usuario reconhece.
///
/// Comparacao por nome exato e em minusculas. Nomes genericos demais ficam de
/// fora: um alarme falso ensina o usuario a ignorar o aviso.
const KNOWN: &[(&str, &str)] = &[
    ("obs64.exe", "OBS"),
    ("obs32.exe", "OBS"),
    ("streamlabs obs.exe", "Streamlabs"),
    ("zoom.exe", "Zoom"),
    ("ms-teams.exe", "Teams"),
    ("teams.exe", "Teams"),
    ("loom.exe", "Loom"),
    ("camtasiastudio.exe", "Camtasia"),
    ("camtasia.exe", "Camtasia"),
    ("bandicam.exe", "Bandicam"),
    ("nvidia share.exe", "NVIDIA ShadowPlay"),
    ("screenrec.exe", "ScreenRec"),
    ("sharex.exe", "ShareX"),
];

#[derive(Debug, Clone, Serialize)]
pub struct Recorder {
    pub label: String,
}

/// Nomes dos processos em execucao, em minusculas.
///
/// Separado do filtro para poder ser testado: uma falha silenciosa aqui faria o
/// aviso de gravacao nunca aparecer, que e pior do que nao ter o recurso.
pub fn running_process_names() -> Vec<String> {
    #[allow(unused_mut)]
    let mut names: Vec<String> = Vec::new();

    #[cfg(target_os = "windows")]
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return names;
        };

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let end = entry
                    .szExeFile
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(entry.szExeFile.len());
                names.push(String::from_utf16_lossy(&entry.szExeFile[..end]).to_lowercase());

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        let _ = windows::Win32::Foundation::CloseHandle(snapshot);
    }

    names
}

/// Lista os gravadores em execucao, sem repetir o mesmo programa.
#[tauri::command]
pub async fn detect_recorders() -> Vec<Recorder> {
    let running = running_process_names();
    let mut found: Vec<String> = Vec::new();

    for (exe, label) in KNOWN {
        if running.iter().any(|name| name == exe) && !found.iter().any(|f| f == label) {
            found.push((*label).to_string());
        }
    }

    found.into_iter().map(|label| Recorder { label }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A varredura precisa enxergar processos de verdade. Sem esta checagem, um
    /// erro de API devolveria lista vazia e pareceria "nenhum gravador aberto".
    #[test]
    fn enxerga_processos_do_sistema() {
        let names = running_process_names();
        assert!(names.len() > 5, "varredura devolveu poucos processos: {names:?}");
        assert!(
            names.iter().any(|name| name == "explorer.exe"),
            "explorer.exe deveria aparecer entre os processos"
        );
    }
}
