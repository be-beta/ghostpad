//! Rascunhos (Jot, por dentro): captura de texto em dois segundos.
//!
//! Win+J abre uma janela pequena sobre o que estiver na tela, a pessoa escreve,
//! Enter guarda, copia e devolve o foco. E memoria curta de proposito:
//!
//! - no maximo dez, o mais antigo sai quando chega o decimo primeiro;
//! - so em memoria, neste processo. Esconder o Harp nao apaga; encerrar apaga,
//!   e nao por uma limpeza que poderia falhar — simplesmente nunca foram para
//!   o disco.
//!
//! Sem busca, sem titulo, sem pasta. Quem quiser guardar, cola numa aba.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State};

use crate::focus::Previous;

/// Quantos rascunhos cabem. Passou disso, e anotacao, e anotacao tem aba.
pub const MAX_DRAFTS: usize = 10;

/// Distancia da janela ate o canto da area util, em pixels logicos.
const MARGEM: f64 = 16.0;

#[derive(Debug, Clone, Serialize)]
pub struct Draft {
    pub id: u64,
    pub text: String,
    /// Milissegundos desde 1970, para a interface mostrar a hora.
    pub at: u64,
}

#[derive(Default)]
pub struct Drafts {
    list: Mutex<VecDeque<Draft>>,
    next: AtomicU64,
    previous: Previous,
}

impl Drafts {
    fn snapshot(&self) -> Vec<Draft> {
        self.list.lock().map(|list| list.iter().cloned().collect()).unwrap_or_default()
    }

    fn push(&self, text: String) {
        let draft = Draft {
            id: self.next.fetch_add(1, Ordering::Relaxed),
            text,
            at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        };
        if let Ok(mut list) = self.list.lock() {
            list.push_front(draft);
            list.truncate(MAX_DRAFTS);
        }
    }
}

/// Avisa a janela principal, que mostra a lista e a contagem.
fn changed(app: &AppHandle, drafts: &Drafts) {
    let _ = app.emit_to("main", "harp://drafts", drafts.snapshot());
}

/// Texto no clipboard do sistema, pelo Rust.
///
/// Nao pelo navegador: a janela de rascunho esta sumindo no mesmo instante, e o
/// clipboard do WebView exige documento em foco.
pub fn copy_text(text: &str) -> Result<(), String> {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.set_text(text.to_owned()))
        .map_err(|e| e.to_string())
}

/// Canto inferior direito da area util do monitor onde esta o mouse.
///
/// O monitor do mouse, e nao o da janela principal: a pessoa esta olhando para
/// onde esta trabalhando, e o Harp pode estar escondido em outra tela.
fn place(app: &AppHandle, window: &tauri::WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) else {
        return;
    };

    let area = monitor.work_area();
    let margem = (MARGEM * monitor.scale_factor()).round() as i32;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - margem;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margem;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn hide_and_return(app: &AppHandle, drafts: &Drafts) {
    if let Some(window) = app.get_webview_window("jot") {
        let _ = window.hide();
    }
    drafts.previous.restore();
}

/// Win+J: abre, ou fecha se ja estiver aberto e em foco.
pub fn toggle(app: &AppHandle) {
    let (Some(window), Some(drafts)) = (app.get_webview_window("jot"), app.try_state::<Drafts>())
    else {
        return;
    };

    if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
        hide_and_return(app, &drafts);
        return;
    }

    drafts.previous.remember(window.hwnd().ok());
    place(app, &window);
    let _ = window.show();
    let _ = window.set_focus();
    // A janela limpa o campo e pega o cursor ao receber isto.
    let _ = window.emit("harp://jot-open", ());
}

/// Enter: guarda, copia e devolve o foco. Texto vazio so fecha.
#[tauri::command]
pub fn jot_commit(app: AppHandle, drafts: State<'_, Drafts>, text: String) -> Result<(), String> {
    // Primeiro sai da frente e devolve o foco; guardar e copiar vem depois. Se
    // alguma coisa demorar, a pessoa ja esta de volta onde estava — e nao e
    // puxada para la depois de ter ido para outro lugar.
    hide_and_return(&app, &drafts);
    if text.trim().is_empty() {
        return Ok(());
    }
    drafts.push(text.clone());
    changed(&app, &drafts);
    copy_text(&text)
}

/// Ajusta a altura da janela ao texto, mantendo o canto de baixo no lugar.
///
/// `height` vem em pixels logicos, da propria janela. A borda invisivel do
/// Windows entra na conta: `set_size` mexe no tamanho interno, e a posicao e do
/// lado de fora.
#[tauri::command]
pub fn jot_fit(app: AppHandle, height: f64) {
    let Some(window) = app.get_webview_window("jot") else { return };
    let (Ok(scale), Ok(pos), Ok(fora), Ok(dentro)) = (
        window.scale_factor(),
        window.outer_position(),
        window.outer_size(),
        window.inner_size(),
    ) else {
        return;
    };

    let altura = (height * scale).round().max(1.0) as u32;
    if altura == dentro.height {
        return;
    }
    let moldura = fora.height.saturating_sub(dentro.height) as i32;
    let base = pos.y + fora.height as i32;
    let _ = window.set_size(tauri::PhysicalSize::new(dentro.width, altura));
    let _ = window.set_position(PhysicalPosition::new(pos.x, base - altura as i32 - moldura));
}

/// Esc: fecha sem guardar nada.
#[tauri::command]
pub fn jot_cancel(app: AppHandle, drafts: State<'_, Drafts>) {
    hide_and_return(&app, &drafts);
}

#[tauri::command]
pub fn jot_list(drafts: State<'_, Drafts>) -> Vec<Draft> {
    drafts.snapshot()
}

#[tauri::command]
pub fn jot_copy(drafts: State<'_, Drafts>, id: u64) -> Result<(), String> {
    let text = drafts
        .snapshot()
        .into_iter()
        .find(|draft| draft.id == id)
        .map(|draft| draft.text)
        .ok_or("rascunho nao encontrado")?;
    copy_text(&text)
}

#[tauri::command]
pub fn jot_delete(app: AppHandle, drafts: State<'_, Drafts>, id: u64) {
    if let Ok(mut list) = drafts.list.lock() {
        list.retain(|draft| draft.id != id);
    }
    changed(&app, &drafts);
}

#[tauri::command]
pub fn jot_clear(app: AppHandle, drafts: State<'_, Drafts>) {
    if let Ok(mut list) = drafts.list.lock() {
        list.clear();
    }
    changed(&app, &drafts);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guarda_no_maximo_dez_e_o_mais_antigo_sai() {
        let drafts = Drafts::default();
        for i in 1..=11 {
            drafts.push(format!("rascunho {i}"));
        }
        let lista = drafts.snapshot();
        assert_eq!(lista.len(), MAX_DRAFTS);
        assert_eq!(lista[0].text, "rascunho 11", "o mais novo vem primeiro");
        assert!(
            lista.iter().all(|d| d.text != "rascunho 1"),
            "o primeiro saiu quando chegou o decimo primeiro"
        );
    }
}
