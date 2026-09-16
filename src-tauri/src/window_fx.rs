//! Efeitos de janela especificos do Windows.
//!
//! Tres coisas acontecem aqui e nenhuma delas e possivel via CSS:
//!
//! 1. Acrylic - o desfoque real do que esta ATRAS da janela. `backdrop-filter`
//!    do WebView2 so enxerga o conteudo da propria pagina, entao o blur precisa
//!    vir do DWM. Mica nao serve: ele borra o wallpaper, nao as janelas de baixo.
//! 2. Cantos arredondados nativos - o backdrop do acrylic e retangular. Sem
//!    isso, um `border-radius` em CSS deixa os cantos do blur aparecendo.
//! 3. Display affinity - esconde a janela de softwares de captura.
//!
//! Tudo aqui degrada em silencio: se um efeito nao existe na versao de Windows
//! do usuario, o app continua funcionando com uma aparencia mais simples.

use serde::Serialize;
use tauri::WebviewWindow;

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::HWND,
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DEFAULT, DWMWCP_ROUND,
        DWM_WINDOW_CORNER_PREFERENCE,
    },
    UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE},
};

/// O que realmente pegou na maquina do usuario. O frontend usa isso para
/// escolher entre o visual translucido e o fallback solido, e para desabilitar
/// controles de recursos indisponiveis em vez de deixa-los falhar em silencio.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EffectsReport {
    pub acrylic: bool,
    pub rounded_corners: bool,
    pub capture_exclusion_available: bool,
}

/// Aplica o conjunto inicial de efeitos e relata o que funcionou.
pub fn apply_startup_effects(window: &WebviewWindow) -> EffectsReport {
    #[allow(unused_mut)]
    let mut report = EffectsReport::default();

    #[cfg(target_os = "windows")]
    {
        // Tint quase transparente de proposito: quem controla o quanto o fundo
        // escurece e uma camada CSS por cima. Reaplicar acrylic a cada ajuste de
        // opacidade causaria flicker; uma camada CSS anima a 60fps sem piscar.
        report.acrylic = window_vibrancy::apply_acrylic(window, Some((18, 18, 18, 10))).is_ok();
        report.rounded_corners = set_rounded_corners(window, true).is_ok();
        // Probe real: liga e desliga para saber se a API responde nesta maquina,
        // em vez de assumir pela versao do Windows.
        report.capture_exclusion_available = set_exclude_from_capture_inner(window, true).is_ok()
            && set_exclude_from_capture_inner(window, false).is_ok();
    }

    report
}

#[cfg(target_os = "windows")]
fn hwnd_of(window: &WebviewWindow) -> Result<HWND, String> {
    window.hwnd().map_err(|e| format!("HWND indisponivel: {e}"))
}

#[cfg(target_os = "windows")]
fn set_rounded_corners(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    let hwnd = hwnd_of(window)?;
    let preference: DWM_WINDOW_CORNER_PREFERENCE =
        if enabled { DWMWCP_ROUND } else { DWMWCP_DEFAULT };

    // Falha esperada no Windows 10: o atributo so existe no 11. Nao e fatal.
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &preference as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        )
    }
    .map_err(|e| format!("DwmSetWindowAttribute falhou: {e}"))
}

#[cfg(target_os = "windows")]
fn set_exclude_from_capture_inner(window: &WebviewWindow, enable: bool) -> Result<(), String> {
    let hwnd = hwnd_of(window)?;
    let affinity = if enable { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };

    unsafe { SetWindowDisplayAffinity(hwnd, affinity) }
        .map_err(|e| format!("SetWindowDisplayAffinity falhou: {e}"))
}

// ---------------------------------------------------------------------------
// Comandos expostos ao frontend
// ---------------------------------------------------------------------------

/// Invisibilidade em gravacoes (OBS, Zoom, Teams, Meet).
///
/// Retorna erro em vez de falhar calado: o usuario PRECISA saber se nao pegou,
/// senao acha que esta escondido e aparece na gravacao.
#[tauri::command]
pub fn set_exclude_from_capture(window: WebviewWindow, enable: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        set_exclude_from_capture_inner(&window, enable)?;
        Ok(enable)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (&window, enable);
        Err("Disponivel apenas no Windows".into())
    }
}

/// Modo fantasma: o mouse atravessa a janela.
///
/// Atencao de design: com isto ligado a janela tambem perde o foco de teclado
/// assim que o usuario clica em qualquer app de baixo. Toda a navegacao nesse
/// estado tem que passar por atalhos GLOBAIS. Ditado de voz nao funciona aqui.
#[tauri::command]
pub fn set_click_through(window: WebviewWindow, enable: bool) -> Result<bool, String> {
    window
        .set_ignore_cursor_events(enable)
        .map_err(|e| e.to_string())?;
    Ok(enable)
}

#[tauri::command]
pub fn set_always_on_top(window: WebviewWindow, enable: bool) -> Result<bool, String> {
    window.set_always_on_top(enable).map_err(|e| e.to_string())?;
    Ok(enable)
}

/// Encaixa a janela num dos cantos do monitor ATUAL (nao do primario).
///
/// Usa a work area, entao respeita a barra de tarefas onde quer que ela esteja,
/// e trabalha em pixels fisicos para nao escorregar em telas com escala != 100%.
#[tauri::command]
pub fn snap_to_corner(window: WebviewWindow, corner: String, margin: u32) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("Nenhum monitor detectado")?;

    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let margin = (margin as f64 * scale).round() as i32;

    let min_x = area.position.x + margin;
    let min_y = area.position.y + margin;
    let max_x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let max_y = area.position.y + area.size.height as i32 - size.height as i32 - margin;

    let (x, y) = match corner.as_str() {
        "top-left" => (min_x, min_y),
        "top-right" => (max_x, min_y),
        "bottom-left" => (min_x, max_y),
        "bottom-right" => (max_x, max_y),
        "top-center" => ((min_x + max_x) / 2, min_y),
        "center" => ((min_x + max_x) / 2, (min_y + max_y) / 2),
        other => return Err(format!("Canto desconhecido: {other}")),
    };

    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Traz a janela de volta ao alcance do usuario.
///
/// Rede de seguranca para quando o GhostPad ficar invisivel, fora da tela ou em
/// modo fantasma e o usuario nao souber mais como recupera-lo.
#[tauri::command]
pub fn panic_recover(window: WebviewWindow) -> Result<(), String> {
    let _ = window.set_ignore_cursor_events(false);
    #[cfg(target_os = "windows")]
    let _ = set_exclude_from_capture_inner(&window, false);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_always_on_top(true);
    let _ = snap_to_corner(window.clone(), "center".into(), 0);
    window.set_focus().map_err(|e| e.to_string())
}
