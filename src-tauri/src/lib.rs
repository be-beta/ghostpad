mod notes;
mod window_fx;
mod window_state;

use tauri::Manager;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

/// Atalhos de resgate, em ordem de preferencia.
///
/// Registrados globalmente no backend: o GhostPad pode estar em modo fantasma,
/// oculto de captura ou fora da area visivel, e nesses estados o frontend fica
/// inalcancavel. Ha alternativas porque atalhos globais sao disputados — o
/// Google Drive, por exemplo, usa Ctrl+Alt+G. Vale o primeiro que estiver livre.
#[cfg(desktop)]
fn panic_candidates() -> [(Shortcut, &'static str); 3] {
    [
        (Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyG), "Ctrl+Alt+G"),
        (
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT), Code::KeyG),
            "Ctrl+Alt+Shift+G",
        ),
        (
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT), Code::F12),
            "Ctrl+Alt+Shift+F12",
        ),
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Precisa ser o primeiro plugin. Uma segunda execucao nao abre outra janela:
    // traz a existente para frente. Duas instancias gravando o mesmo arquivo de
    // texto era uma das formas de perder o que o usuario acabou de escrever.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder = builder
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
                    if panic_candidates().iter().any(|(c, _)| c == shortcut) {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window_fx::panic_recover(window);
                        }
                    }
                })
                .build(),
        );
    }

    builder
        .manage(notes::NotesLock::default())
        .manage(window_state::WindowState::default())
        .on_window_event(window_state::track)
        .invoke_handler(tauri::generate_handler![
            notes::load_draft,
            notes::save_draft,
            window_state::persist_window_state,
            window_fx::get_effects_report,
            window_fx::set_backdrop,
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

            // A janela nasce invisivel (tauri.conf.json) e so aparece depois de ir
            // para o lugar salvo — sem o salto de abrir no centro e pular.
            window_state::restore(&window.as_ref().window());
            let _ = window.show();

            #[allow(unused_mut)]
            let mut report = window_fx::apply_startup_effects(&window);

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                report.panic_shortcut = panic_candidates().into_iter().find_map(|(shortcut, label)| {
                    app.global_shortcut().register(shortcut).ok().map(|_| label.to_string())
                });
            }

            eprintln!("[ghostpad] efeitos: {report:?}");

            // Guardado como estado, nao emitido como evento: o setup roda antes de
            // o frontend montar, e um evento emitido aqui se perderia.
            app.manage(report);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o GhostPad");
}
