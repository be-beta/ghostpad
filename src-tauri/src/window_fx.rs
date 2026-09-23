//! Efeitos de janela especificos do Windows.
//!
//! Tres responsabilidades, nenhuma possivel via CSS:
//!
//! 1. Fundo da janela (backdrop). O padrao e transparencia real: o WebView2 fica
//!    transparente e uma camada CSS escurece por cima. Desfoque nativo (acrylic
//!    ou blur do DWM) e OPCIONAL, nunca o padrao, porque nao e confiavel:
//!    - o acrylic do Windows 11 vira cor solida quando a janela perde o foco, e
//!      uma sobreposicao passa a maior parte do tempo sem foco;
//!    - em algumas maquinas as APIs retornam sucesso e mesmo assim pintam um
//!      fundo opaco, entao o retorno da chamada nao prova que o efeito aparece.
//!    `backdrop-filter` do CSS nao resolve: so enxerga a propria pagina.
//! 2. Cantos arredondados nativos, para o backdrop acompanhar o border-radius.
//! 3. Display affinity, que esconde a janela de softwares de captura.

use serde::{Deserialize, Serialize};
use tauri::{Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::HWND,
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DEFAULT, DWMWCP_ROUND,
        DWM_WINDOW_CORNER_PREFERENCE,
    },
    UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE},
};

/// Capacidades que conseguimos verificar de fato na maquina do usuario. O
/// frontend desabilita controles de recursos indisponiveis em vez de deixa-los
/// falhar em silencio.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EffectsReport {
    pub rounded_corners: bool,
    pub capture_exclusion_available: bool,
    /// Atalho de resgate efetivamente registrado, ou `None` se todos estavam ocupados.
    pub panic_shortcut: Option<String>,
    /// Atalho de invocacao efetivamente registrado.
    pub summon_shortcut: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Backdrop {
    /// Transparencia real, sem desfoque. Funciona em qualquer maquina.
    Transparent,
    /// Acrylic do Windows 11. Some quando a janela perde o foco.
    Acrylic,
    /// Blur legado do DWM. Mantem-se sem foco, mas pode pesar ao arrastar.
    Blur,
}

/// Desliga os atalhos de navegador do WebView2.
///
/// O WebView2 nasce com eles ligados e intercepta teclas antes do app: `Ctrl+W`
/// (fechar aba) sumia sem fechar nada, e `Ctrl+R`, `F5` e `Ctrl+P` pertencem a
/// um navegador, nao a um bloco de notas.
#[cfg(target_os = "windows")]
fn disable_browser_shortcuts(window: &WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;

    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(settings) = core.Settings() else { return };
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
}

/// Aplica os efeitos iniciais e relata o que foi possivel verificar.
pub fn apply_startup_effects(window: &WebviewWindow) -> EffectsReport {
    #[allow(unused_mut)]
    let mut report = EffectsReport::default();

    #[cfg(target_os = "windows")]
    {
        disable_browser_shortcuts(window);
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

/// Troca o fundo da janela. Sempre limpa os dois efeitos antes, porque aplicar
/// um sobre o outro deixa o DWM num estado indefinido.
#[tauri::command]
pub fn set_backdrop(window: WebviewWindow, kind: Backdrop) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = window_vibrancy::clear_acrylic(&window);
        let _ = window_vibrancy::clear_blur(&window);
        // Tint quase transparente: quem escurece e a camada CSS, que anima sem
        // flicker. O efeito nativo so fornece o desfoque.
        let tint = Some((18, 18, 18, 10));
        match kind {
            Backdrop::Transparent => Ok(()),
            Backdrop::Acrylic => window_vibrancy::apply_acrylic(&window, tint).map_err(|e| e.to_string()),
            Backdrop::Blur => window_vibrancy::apply_blur(&window, tint).map_err(|e| e.to_string()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (&window, kind);
        Ok(())
    }
}

#[tauri::command]
pub fn get_effects_report(report: State<'_, EffectsReport>) -> EffectsReport {
    report.inner().clone()
}

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

// ---------------------------------------------------------------------------
// Tamanho: externo x interno
// ---------------------------------------------------------------------------
//
// `outer_size()` inclui a moldura invisivel da janela (borda de
// redimensionamento e sombra); `set_size()` define a area INTERNA. Misturar os
// dois fazia a diferenca vazar para os dois eixos a cada ajuste: mexer na
// largura empurrava a altura. Todo alvo aqui e tratado como tamanho externo e
// convertido antes de aplicar.

fn frame_padding(window: &WebviewWindow) -> (i32, i32) {
    let (Ok(outer), Ok(inner)) = (window.outer_size(), window.inner_size()) else {
        return (0, 0);
    };
    (
        (outer.width as i32 - inner.width as i32).max(0),
        (outer.height as i32 - inner.height as i32).max(0),
    )
}

fn set_outer_size(window: &WebviewWindow, width: i32, height: i32) -> Result<(), String> {
    let (pad_w, pad_h) = frame_padding(window);
    window
        .set_size(PhysicalSize::new(
            (width - pad_w).max(1) as u32,
            (height - pad_h).max(1) as u32,
        ))
        .map_err(|e| e.to_string())
}

/// Formato inicial para quem ainda nao escolheu um tamanho: uma coluna estreita
/// e alta, que e como um bloco de notas lateral costuma ser usado.
fn default_corner_size(area: &tauri::PhysicalSize<u32>, scale: f64) -> (i32, i32) {
    let width = (area.width as f64 * 0.24).clamp(340.0 * scale, 560.0 * scale);
    let height = (area.height as f64 * 0.46).clamp(280.0 * scale, 720.0 * scale);
    (width.round() as i32, height.round() as i32)
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
    let margin = (margin as f64 * scale).round() as i32;
    let usable_w = area.size.width as i32 - margin * 2;
    let usable_h = area.size.height as i32 - margin * 2;

    // Voltar para um canto devolve a janela ao tamanho de trabalho do usuario.
    // Sem isto, quem tivesse usado "tela cheia" continuaria com a janela enorme.
    let state = window.state::<crate::window_state::WindowState>();
    let (mut width, mut height) = state
        .preferred_size()
        .map(|(w, h)| (w as i32, h as i32))
        .unwrap_or_else(|| default_corner_size(&area.size, scale));

    if width > usable_w || height > usable_h {
        let (default_w, default_h) = default_corner_size(&area.size, scale);
        width = default_w.min(usable_w);
        height = default_h.min(usable_h);
    }

    set_outer_size(&window, width, height)?;

    let min_x = area.position.x + margin;
    let min_y = area.position.y + margin;
    let max_x = area.position.x + area.size.width as i32 - width - margin;
    let max_y = area.position.y + area.size.height as i32 - height - margin;

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
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Redimensiona em passos, ancorando o canto superior esquerdo.
///
/// Respeita o tamanho minimo da janela e nunca ultrapassa a area util do
/// monitor: crescer sem limite jogaria a barra de status para fora da tela.
#[tauri::command]
pub fn resize_by(window: WebviewWindow, dw: i32, dh: i32) -> Result<(), String> {
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let step = |delta: i32| (delta as f64 * scale).round() as i32;

    let (min_w, min_h) = ((280.0 * scale) as i32, (120.0 * scale) as i32);
    let (mut max_w, mut max_h) = (i32::MAX, i32::MAX);
    if let Ok(Some(monitor)) = window.current_monitor() {
        let area = monitor.work_area();
        max_w = area.size.width as i32;
        max_h = area.size.height as i32;
    }

    let width = (outer.width as i32 + step(dw)).clamp(min_w, max_w);
    let height = (outer.height as i32 + step(dh)).clamp(min_h, max_h);

    set_outer_size(&window, width, height)?;
    // Redimensionar de proposito define o tamanho de trabalho.
    window
        .state::<crate::window_state::WindowState>()
        .set_preferred_size((width.max(1) as u32, height.max(1) as u32));
    Ok(())
}

/// Grava o tamanho atual como preferido.
///
/// Chamado pelo frontend quando termina um arraste de borda: e o outro jeito de
/// o usuario escolher um tamanho de proposito.
#[tauri::command]
pub fn remember_size(window: WebviewWindow) -> Result<(), String> {
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    window
        .state::<crate::window_state::WindowState>()
        .set_preferred_size((outer.width, outer.height));
    Ok(())
}

/// Ocupa metade (ou a area util inteira) do monitor atual.
#[tauri::command]
pub fn snap_half(window: WebviewWindow, side: String, margin: u32) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("Nenhum monitor detectado")?;

    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let margin = (margin as f64 * scale).round() as i32;

    let full_w = area.size.width as i32 - margin * 2;
    let full_h = area.size.height as i32 - margin * 2;
    let half_w = (full_w - margin) / 2;
    let half_h = (full_h - margin) / 2;
    let (x0, y0) = (area.position.x + margin, area.position.y + margin);

    let (x, y, w, h) = match side.as_str() {
        "left" => (x0, y0, half_w, full_h),
        "right" => (x0 + half_w + margin, y0, half_w, full_h),
        "top" => (x0, y0, full_w, half_h),
        "bottom" => (x0, y0 + half_h + margin, full_w, half_h),
        "full" => (x0, y0, full_w, full_h),
        other => return Err(format!("Lado desconhecido: {other}")),
    };

    // Nao toca no tamanho preferido: ocupar metade da tela e um estado
    // temporario, nao o tamanho de trabalho que o usuario escolheu.
    set_outer_size(&window, w.max(1), h.max(1))?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Coloca a janela como uma faixa fina no topo central da tela (modo notch).
///
/// Medidas chegam em pixels logicos porque quem as calcula e o frontend, a
/// partir da altura real de uma linha de texto.
#[tauri::command]
pub fn place_top_center(
    window: WebviewWindow,
    width: f64,
    height: f64,
    margin: f64,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("Nenhum monitor detectado")?;

    let scale = monitor.scale_factor();
    let area = monitor.work_area();

    let w = (width * scale).round() as i32;
    let h = (height * scale).round() as i32;
    set_outer_size(&window, w, h)?;

    let x = area.position.x + (area.size.width as i32 - w) / 2;
    let y = area.position.y + (margin * scale).round() as i32;

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Traz a janela de volta ao alcance do usuario.
///
/// Rede de seguranca para quando o Harp ficar em modo fantasma, oculto ou
/// fora da tela. Preserva a posicao escolhida pelo usuario: so recentraliza se a
/// janela estiver de fato fora de qualquer monitor (ex.: monitor desconectado).
#[tauri::command]
pub fn panic_recover(window: WebviewWindow) -> Result<(), String> {
    let _ = window.set_ignore_cursor_events(false);
    #[cfg(target_os = "windows")]
    let _ = set_exclude_from_capture_inner(&window, false);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_always_on_top(true);
    if !is_reachable(&window) {
        let _ = snap_to_corner(window.clone(), "center".into(), 0);
    }
    window.set_focus().map_err(|e| e.to_string())
}

/// Delegado a `window_state`, que usa a mesma regra para validar a posicao salva.
fn is_reachable(window: &WebviewWindow) -> bool {
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return false;
    };
    let monitors = window.available_monitors().unwrap_or_default();
    crate::window_state::rect_is_reachable(
        &monitors,
        crate::window_state::Geometry { x: pos.x, y: pos.y, width: size.width, height: size.height },
    )
}

/// Invocacao global: chama o Harp de qualquer app, pronto para digitar.
///
/// Alterna: se a janela ja esta em foco, minimiza e devolve a tela. Desliga o
/// modo fantasma, porque invocar e sinal de que o usuario quer escrever agora.
pub fn toggle_summon(window: WebviewWindow) {
    use tauri::Emitter;

    let visible = window.is_visible().unwrap_or(false);
    let minimized = window.is_minimized().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && !minimized && focused {
        let _ = window.minimize();
        return;
    }

    let _ = window.set_ignore_cursor_events(false);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.emit("harp://summoned", ());
}
