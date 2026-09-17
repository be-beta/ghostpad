mod window_fx;

use tauri::{Emitter, Manager};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

/// Atalho de resgate, registrado globalmente no backend em vez de no frontend.
///
/// Motivo: o GhostPad pode estar em modo fantasma, escondido de captura ou fora
/// da area visivel. Nesses estados o frontend pode estar inalcancavel, entao a
/// unica saida confiavel precisa viver fora dele.
#[cfg(desktop)]
fn panic_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyG)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    {
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &panic_shortcut() {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window_fx::panic_recover(window);
                        }
                    }
                })
                .build(),
        );
    }

    builder
        .invoke_handler(tauri::generate_handler![
            window_fx::set_exclude_from_capture,
            window_fx::set_click_through,
            window_fx::set_always_on_top,
            window_fx::snap_to_corner,
            window_fx::panic_recover,
        ])
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("janela 'main' nao encontrada");

            let report = window_fx::apply_startup_effects(&window);

            // O frontend precisa saber o que pegou antes de decidir como pintar.
            // Se o acrylic falhou, ele cai para um fundo solido legivel em vez de
            // mostrar texto sobre uma janela transparente e ilegivel.
            let _ = window.emit("ghostpad://effects-report", report.clone());
            app.manage(report);

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                // Falha aqui e tolerada: outro app pode ja ter tomado o atalho.
                if let Err(e) = app.global_shortcut().register(panic_shortcut()) {
                    eprintln!("[ghostpad] atalho de resgate indisponivel: {e}");
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o GhostPad");
}
