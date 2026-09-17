//! Posicao e tamanho da janela entre sessoes.
//!
//! Vive no Rust, nao no frontend, por dois motivos:
//! - a restauracao acontece ANTES de a janela aparecer, sem o salto visual de
//!   abrir centralizada e pular para o lugar salvo;
//! - a janela nunca depende do frontend para ficar visivel. Se o JS falhar, ela
//!   aparece do mesmo jeito.
//!
//! Protecao: se a geometria salva nao cabe em nenhum monitor atual (monitor
//! desconectado, resolucao trocada), ela e descartada e a janela abre centralizada.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime, State, Window, WindowEvent};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Ultima geometria valida vista. Atualizada a cada movimento e gravada em disco
/// so ao fechar, para nao escrever arquivo a cada pixel de arraste.
#[derive(Default)]
pub struct WindowState(Mutex<Option<Geometry>>);

fn state_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("window.json"))
}

/// Uma area de ao menos 80x80 px dentro da area util de algum monitor: o
/// suficiente para o usuario enxergar e agarrar a janela.
pub fn rect_is_reachable(monitors: &[Monitor], rect: Geometry) -> bool {
    const MIN_VISIBLE: i32 = 80;

    let (left, top) = (rect.x, rect.y);
    let (right, bottom) = (rect.x + rect.width as i32, rect.y + rect.height as i32);

    monitors.iter().any(|monitor| {
        let area = monitor.work_area();
        let a_left = area.position.x;
        let a_top = area.position.y;
        let a_right = a_left + area.size.width as i32;
        let a_bottom = a_top + area.size.height as i32;

        right.min(a_right) - left.max(a_left) >= MIN_VISIBLE
            && bottom.min(a_bottom) - top.max(a_top) >= MIN_VISIBLE
    })
}

pub fn current_geometry<R: Runtime>(window: &Window<R>) -> Option<Geometry> {
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    Some(Geometry { x: pos.x, y: pos.y, width: size.width, height: size.height })
}

/// Aplica a geometria salva, se ainda fizer sentido nas telas atuais.
pub fn restore<R: Runtime>(window: &Window<R>) {
    let Some(path) = state_path(window.app_handle()) else { return };
    let Ok(raw) = fs::read_to_string(path) else { return };
    let Ok(saved) = serde_json::from_str::<Geometry>(&raw) else { return };

    let monitors = window.available_monitors().unwrap_or_default();
    if !rect_is_reachable(&monitors, saved) {
        return; // mantem o "center" da configuracao
    }

    let _ = window.set_size(PhysicalSize::new(saved.width, saved.height));
    let _ = window.set_position(PhysicalPosition::new(saved.x, saved.y));
    if let Some(state) = window.try_state::<WindowState>() {
        if let Ok(mut slot) = state.0.lock() {
            *slot = Some(saved);
        }
    }
}

/// Acompanha movimentos e redimensionamentos; grava ao destruir a janela.
pub fn track<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            // Minimizada, o Windows reporta posicoes como (-32000, -32000).
            if window.is_minimized().unwrap_or(false) {
                return;
            }
            let Some(geometry) = current_geometry(window) else { return };
            let monitors = window.available_monitors().unwrap_or_default();
            if !rect_is_reachable(&monitors, geometry) {
                return;
            }
            if let Some(state) = window.try_state::<WindowState>() {
                if let Ok(mut slot) = state.0.lock() {
                    *slot = Some(geometry);
                }
            }
        }
        WindowEvent::Destroyed => persist(window.app_handle()),
        _ => {}
    }
}

pub fn persist<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<WindowState>() else { return };
    let Ok(slot) = state.0.lock() else { return };
    let (Some(geometry), Some(path)) = (*slot, state_path(app)) else { return };
    if let Ok(json) = serde_json::to_string_pretty(&geometry) {
        let _ = fs::write(path, json);
    }
}

/// Chamado pelo frontend antes de fechar, como garantia adicional ao `Destroyed`.
#[tauri::command]
pub fn persist_window_state(app: AppHandle, _state: State<'_, WindowState>) {
    persist(&app);
}
