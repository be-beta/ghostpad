//! Icone na bandeja do sistema.
//!
//! Existe para o Harp poder ficar rodando sem janela: iniciado com o Windows,
//! ele abre escondido, so aqui, com os atalhos globais ja valendo. Clicar no
//! icone traz a janela; o menu da acesso ao que os atalhos fazem, para quem nao
//! os decorou.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

const ID: &str = "harp";

/// Textos do menu. Chegam da janela principal, no idioma escolhido; ate la,
/// vale o portugues.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Labels {
    pub show: String,
    pub jot: String,
    pub vidro: String,
    pub quit: String,
}

impl Default for Labels {
    fn default() -> Self {
        Self {
            show: "Mostrar o Harp".into(),
            jot: "Rascunho".into(),
            vidro: "Vidro".into(),
            quit: "Sair".into(),
        }
    }
}

fn menu<R: Runtime>(app: &AppHandle<R>, labels: &Labels) -> tauri::Result<Menu<R>> {
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "show", &labels.show, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "jot", &labels.jot, true, None::<&str>)?,
            &MenuItem::with_id(app, "vidro", &labels.vidro, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?,
        ],
    )
}

/// Traz a janela principal, pronta para escrever.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("harp://summoned", ());
    }
}

/// Sair pela bandeja passa pela janela principal, que grava o texto antes de
/// fechar. Se ela nao responder em alguns segundos, o processo sai assim mesmo:
/// "Sair" que nao sai seria pior que o texto dos ultimos dois segundos.
fn quit<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit_to("main", "harp://quit", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        app.exit(0);
    });
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(ID)
        .tooltip("Harp")
        .menu(&menu(app, &Labels::default())?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "jot" => crate::jot::toggle(app),
            "vidro" => crate::vidro::toggle(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Troca os textos do menu, quando o idioma chega ou muda.
#[tauri::command]
pub fn set_tray_labels(app: AppHandle, labels: Labels) -> Result<(), String> {
    let tray = app.tray_by_id(ID).ok_or("bandeja indisponivel")?;
    let novo = menu(&app, &labels).map_err(|e| e.to_string())?;
    tray.set_menu(Some(novo)).map_err(|e| e.to_string())
}
