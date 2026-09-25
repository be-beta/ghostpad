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

/// Conteudo de `window.json`.
///
/// O tamanho preferido fica separado da geometria: a janela pode ser fechada
/// ocupando metade da tela, e isso nao pode virar o tamanho de trabalho da
/// proxima sessao. Campos ausentes mantem arquivos antigos validos.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Persisted {
    #[serde(flatten)]
    pub geometry: Geometry,
    #[serde(default)]
    pub preferred_width: Option<u32>,
    #[serde(default)]
    pub preferred_height: Option<u32>,
}

/// Estado de janela mantido em memoria.
///
/// - `geometry`: ultima posicao/tamanho validos, gravados em disco ao fechar.
/// - `preferred_size`: o tamanho que o USUARIO escolheu, para o encaixe nos
///   cantos poder devolver a janela ao formato de trabalho dela.
///
/// `preferred_size` so muda por acao deliberada do usuario: arrastar a borda ou
/// usar o atalho de redimensionar. Inferir isso do evento de redimensionamento
/// nao funciona: o Windows dispara o evento mais de uma vez por mudanca, e os
/// encaixes do proprio app acabavam virando preferencia.
#[derive(Default)]
pub struct WindowState {
    geometry: Mutex<Option<Geometry>>,
    preferred_size: Mutex<Option<(u32, u32)>>,
}

impl WindowState {

    pub fn preferred_size(&self) -> Option<(u32, u32)> {
        self.preferred_size.lock().ok().and_then(|slot| *slot)
    }

    pub fn set_preferred_size(&self, size: (u32, u32)) {
        if let Ok(mut slot) = self.preferred_size.lock() {
            *slot = Some(size);
        }
    }
}

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
    let Ok(saved) = serde_json::from_str::<Persisted>(&raw) else { return };
    let geometry = saved.geometry;

    let monitors = window.available_monitors().unwrap_or_default();
    if !rect_is_reachable(&monitors, geometry) {
        return; // mantem o "center" da configuracao
    }

    let _ = window.set_size(PhysicalSize::new(geometry.width, geometry.height));
    let _ = window.set_position(PhysicalPosition::new(geometry.x, geometry.y));

    if let Some(state) = window.try_state::<WindowState>() {
        if let Ok(mut slot) = state.geometry.lock() {
            *slot = Some(geometry);
        }
        // Arquivo antigo nao tem tamanho preferido; nele, o tamanho com que a
        // sessao terminou e a melhor aproximacao disponivel.
        let preferred = saved
            .preferred_width
            .zip(saved.preferred_height)
            .unwrap_or((geometry.width, geometry.height));
        state.set_preferred_size(preferred);
    }
}

/// Acompanha movimentos e redimensionamentos; grava ao destruir a janela.
pub fn track<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    // So a janela principal tem lugar guardado. Rascunho e Vidro aparecem onde
    // o mouse estiver; se entrassem aqui, a proxima abertura do Harp iria para
    // o canto da tela onde o ultimo rascunho foi escrito.
    if window.label() != "main" {
        return;
    }
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
                if let Ok(mut slot) = state.geometry.lock() {
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
    let Ok(slot) = state.geometry.lock() else { return };
    let (Some(geometry), Some(path)) = (*slot, state_path(app)) else { return };
    let preferred = state.preferred_size();
    let persisted = Persisted {
        geometry,
        preferred_width: preferred.map(|(w, _)| w),
        preferred_height: preferred.map(|(_, h)| h),
    };
    if let Ok(json) = serde_json::to_string_pretty(&persisted) {
        let _ = fs::write(path, json);
    }
}

/// Chamado pelo frontend antes de fechar, como garantia adicional ao `Destroyed`.
#[tauri::command]
pub fn persist_window_state(app: AppHandle, _state: State<'_, WindowState>) {
    persist(&app);
}
