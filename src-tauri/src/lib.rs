mod notes;
mod shortcuts;
mod watch;
mod window_fx;
mod window_state;

use tauri::Manager;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::ShortcutState;

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    {
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let (Some(window), Some(registry)) =
                        (app.get_webview_window("main"), app.try_state::<shortcuts::Registry>())
                    else {
                        return;
                    };
                    match registry.action_for(shortcut) {
                        Some(shortcuts::Action::Panic) => {
                            let _ = window_fx::panic_recover(window);
                        }
                        Some(shortcuts::Action::Summon) => window_fx::toggle_summon(window),
                        None => {}
                    }
                })
                .build(),
        );
    }

    builder
        .manage(notes::NotesLock::default())
        .manage(shortcuts::Registry::default())
        .manage(window_state::WindowState::default())
        .on_window_event(window_state::track)
        .invoke_handler(tauri::generate_handler![
            notes::load_note,
            notes::save_note,
            notes::list_slots,
            notes::list_snapshots,
            notes::read_text_file,
            notes::write_text_file,
            notes::read_snapshot,
            watch::detect_recorders,
            window_state::persist_window_state,
            shortcuts::set_global_shortcut,
            window_fx::get_effects_report,
            window_fx::set_backdrop,
            window_fx::set_exclude_from_capture,
            window_fx::set_click_through,
            window_fx::set_always_on_top,
            window_fx::snap_to_corner,
            window_fx::snap_half,
            window_fx::resize_by,
            window_fx::remember_size,
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
                let registry = app.state::<shortcuts::Registry>();
                shortcuts::register_defaults(app.handle(), &registry);
                report.panic_shortcut = registry.label(shortcuts::Action::Panic);
                report.summon_shortcut = registry.label(shortcuts::Action::Summon);
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
