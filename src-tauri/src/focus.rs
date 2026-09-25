//! Devolver o foco a quem estava antes.
//!
//! Rascunhos e Vidro aparecem por cima do que a pessoa esta fazendo e somem em
//! seguida. Sumir e metade do trabalho: a outra metade e o cursor voltar para o
//! aplicativo de onde ela saiu, pronto para colar. Sem isso, cada captura
//! terminaria com um clique a mais para achar onde estava.

use std::sync::Mutex;

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsWindow, SetForegroundWindow};

/// A janela que estava em primeiro plano quando uma superficie abriu.
///
/// Guardada como numero, e nao como `HWND`: o ponteiro nao atravessa threads,
/// e o estado do Tauri precisa atravessar.
#[derive(Default)]
pub struct Previous(Mutex<Option<isize>>);

impl Previous {
    /// Anota quem esta em primeiro plano agora, a menos que seja `own` — abrir
    /// de novo uma superficie que ja estava aberta nao pode apagar o destino.
    pub fn remember(&self, own: Option<HWND>) {
        let atual = unsafe { GetForegroundWindow() };
        if atual.is_invalid() || Some(atual) == own {
            return;
        }
        if let Ok(mut slot) = self.0.lock() {
            *slot = Some(atual.0 as isize);
        }
    }

    /// Devolve o primeiro plano, se a janela ainda existir.
    ///
    /// O Windows so permite trocar o primeiro plano a quem esta nele. Chamado
    /// logo depois de esconder a propria superficie, o Harp ainda esta — e e
    /// por isso que a ordem importa em quem chama.
    pub fn restore(&self) {
        let alvo = self.0.lock().ok().and_then(|mut slot| slot.take());
        if let Some(alvo) = alvo {
            let hwnd = HWND(alvo as *mut core::ffi::c_void);
            unsafe {
                if IsWindow(Some(hwnd)).as_bool() {
                    let _ = SetForegroundWindow(hwnd);
                }
            }
        }
    }
}
