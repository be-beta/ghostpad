//! Atalhos globais: registro, alternativas e troca pelo usuario.
//!
//! Atalhos globais sao disputados — no teste real, `Ctrl+Alt+G` era do Google
//! Drive e `Ctrl+Alt+Space` de outro programa. Por isso:
//!
//! - cada acao tem uma lista de candidatos e vale o primeiro livre;
//! - o rotulo do que foi registrado de fato vai para a interface, para ela
//!   nunca ensinar um atalho que nao funciona;
//! - o usuario pode trocar, e a troca so vale se o novo atalho for aceito. Se
//!   nao for, o anterior volta e nada se perde.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    /// Desfaz fantasma e oculto e traz a janela de volta.
    Panic,
    /// Chama o app para a frente, pronto para digitar.
    Summon,
    /// Abre um rascunho sobre o que estiver na tela.
    Jot,
    /// Entra no Vidro: anotar sobre a tela e copiar a imagem.
    Vidro,
}

/// Todas as acoes com atalho global, na ordem em que sao registradas.
pub const ACTIONS: [Action; 4] = [Action::Panic, Action::Summon, Action::Jot, Action::Vidro];

#[derive(Debug, Clone, Serialize)]
pub struct Binding {
    pub label: String,
    #[serde(skip)]
    pub shortcut: Shortcut,
}

#[derive(Default)]
pub struct Registry {
    panic: Mutex<Option<Binding>>,
    summon: Mutex<Option<Binding>>,
    jot: Mutex<Option<Binding>>,
    vidro: Mutex<Option<Binding>>,
}

impl Registry {
    fn slot(&self, action: Action) -> &Mutex<Option<Binding>> {
        match action {
            Action::Panic => &self.panic,
            Action::Summon => &self.summon,
            Action::Jot => &self.jot,
            Action::Vidro => &self.vidro,
        }
    }

    pub fn label(&self, action: Action) -> Option<String> {
        self.slot(action)
            .lock()
            .ok()
            .and_then(|slot| slot.as_ref().map(|binding| binding.label.clone()))
    }

    /// Qual acao corresponde ao atalho disparado.
    pub fn action_for(&self, shortcut: &Shortcut) -> Option<Action> {
        for action in ACTIONS {
            let matches = self
                .slot(action)
                .lock()
                .ok()
                .and_then(|slot| slot.as_ref().map(|binding| binding.shortcut == *shortcut))
                .unwrap_or(false);
            if matches {
                return Some(action);
            }
        }
        None
    }
}

/// Atalho do Vidro, e as alternativas se ele estiver ocupado.
///
/// Win+Alt+V: o V de Vidro, vizinho do Win+V do historico do clipboard — o
/// Vidro tambem termina no clipboard — sem colidir com ele. Win+Shift+V estava
/// ocupado pelo proprio Windows na maquina de teste; Ctrl+Alt+V ficou de fora
/// porque e "colar especial" no Office e, em teclados ABNT2, Ctrl+Alt e AltGr.
/// Conferido com uma sonda de `RegisterHotKey` antes de escolher.
///
/// Trocar o atalho do Vidro e trocar esta lista, e nada mais.
pub const VIDRO_SHORTCUTS: [(Modifiers, Code); 2] = [
    (Modifiers::META.union(Modifiers::ALT), Code::KeyV),
    (Modifiers::CONTROL.union(Modifiers::ALT).union(Modifiers::SHIFT), Code::KeyV),
];

/// Candidatos em ordem de preferencia. O primeiro livre vence.
fn candidates(action: Action) -> Vec<(Modifiers, Code)> {
    let ctrl_alt = Modifiers::CONTROL | Modifiers::ALT;
    let ctrl_shift = Modifiers::CONTROL | Modifiers::SHIFT;
    let ctrl_alt_shift = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT;

    match action {
        Action::Panic => vec![
            (ctrl_alt, Code::KeyG),
            (ctrl_alt_shift, Code::KeyG),
            (ctrl_alt_shift, Code::F12),
        ],
        Action::Summon => vec![
            (ctrl_alt, Code::Space),
            (ctrl_shift, Code::Space),
            (ctrl_alt_shift, Code::Space),
        ],
        // Win+J, como pedido. As alternativas mantem o J para a memoria nao
        // precisar de outra letra.
        Action::Jot => vec![
            (Modifiers::META, Code::KeyJ),
            (Modifiers::META | Modifiers::ALT, Code::KeyJ),
            (ctrl_alt, Code::KeyJ),
        ],
        Action::Vidro => VIDRO_SHORTCUTS.to_vec(),
    }
}

/// Rotulo legivel, na ordem em que as pessoas leem e escrevem atalhos.
fn label_for(mods: Modifiers, code: Code) -> String {
    let mut parts = Vec::new();
    if mods.contains(Modifiers::CONTROL) {
        parts.push("Ctrl".to_string());
    }
    if mods.contains(Modifiers::ALT) {
        parts.push("Alt".to_string());
    }
    if mods.contains(Modifiers::SHIFT) {
        parts.push("Shift".to_string());
    }
    if mods.contains(Modifiers::META) {
        parts.push("Win".to_string());
    }

    let key = format!("{code:?}");
    parts.push(
        key.strip_prefix("Key")
            .or_else(|| key.strip_prefix("Digit"))
            .or_else(|| key.strip_prefix("Arrow"))
            .unwrap_or(&key)
            .to_string(),
    );
    parts.join("+")
}

fn apply<R: Runtime>(
    app: &AppHandle<R>,
    registry: &Registry,
    action: Action,
    mods: Modifiers,
    code: Code,
) -> Result<String, String> {
    let shortcut = Shortcut::new(Some(mods), code);
    app.global_shortcut()
        .register(shortcut)
        .map_err(|e| e.to_string())?;

    let label = label_for(mods, code);
    let previous = registry
        .slot(action)
        .lock()
        .map_err(|_| "registro travado".to_string())?
        .replace(Binding { label: label.clone(), shortcut });

    // So libera o anterior depois que o novo entrou: em nenhum instante a acao
    // fica sem atalho.
    if let Some(previous) = previous {
        let _ = app.global_shortcut().unregister(previous.shortcut);
    }
    Ok(label)
}

/// Registra o primeiro candidato livre de cada acao, no start do app.
pub fn register_defaults<R: Runtime>(app: &AppHandle<R>, registry: &Registry) {
    for action in ACTIONS {
        for (mods, code) in candidates(action) {
            if apply(app, registry, action, mods, code).is_ok() {
                break;
            }
        }
    }
}

/// Troca o atalho de uma acao. Em caso de falha, nada muda.
#[tauri::command]
pub fn set_global_shortcut(
    app: AppHandle,
    registry: State<'_, Registry>,
    action: Action,
    ctrl: bool,
    alt: bool,
    shift: bool,
    meta: bool,
    code: String,
) -> Result<String, String> {
    let mut mods = Modifiers::empty();
    if ctrl {
        mods |= Modifiers::CONTROL;
    }
    if alt {
        mods |= Modifiers::ALT;
    }
    if shift {
        mods |= Modifiers::SHIFT;
    }
    if meta {
        mods |= Modifiers::META;
    }

    // Sem modificador, o atalho global roubaria a tecla de todos os outros apps.
    if mods.is_empty() {
        return Err("Use ao menos um modificador (Ctrl, Alt ou Shift)".into());
    }

    let code: Code = code.parse().map_err(|_| format!("Tecla desconhecida: {code}"))?;
    apply(&app, &registry, action, mods, code)
        .map_err(|_| "Esse atalho já está em uso por outro programa".to_string())
}
