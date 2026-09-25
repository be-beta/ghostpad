//! Vidro: anotar sobre a tela e copiar o resultado como imagem.
//!
//! Uma janela transparente cobre o monitor onde esta o mouse; a pessoa escreve,
//! aponta e circula por cima do que esta vendo; Ctrl+Shift+Enter copia tela e
//! anotacoes numa imagem so e devolve o foco. Nao e editor de screenshot: nao
//! salva, nao exporta, nao guarda historico. Anotar, copiar, sair.
//!
//! A imagem final nao e uma foto da janela do Vidro. Sao duas camadas:
//!
//! 1. a tela, capturada depois de o Vidro sumir — entao nenhuma alca, barra ou
//!    selecao tem como aparecer nela;
//! 2. as anotacoes, desenhadas pela propria janela num PNG transparente, a
//!    partir do modelo de objetos, e nao do que esta na tela.
//!
//! O Rust junta as duas e poe no clipboard.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State};

use crate::focus::Previous;

/// Retangulo do monitor coberto, em pixels fisicos.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

#[derive(Default)]
pub struct Vidro {
    area: Mutex<Option<Area>>,
    /// A janela principal estava visivel ao entrar? Ela sai de cena durante o
    /// Vidro e volta no fim so se estava la.
    main_visible: Mutex<bool>,
    previous: Previous,
}

/// Monitor onde esta o mouse: e para ele que a pessoa esta olhando.
fn area_under_cursor(app: &AppHandle) -> Option<Area> {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let pos = monitor.position();
    let size = monitor.size();
    Some(Area {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        scale: monitor.scale_factor(),
    })
}

/// Atalho do Vidro: entra, ou sai sem capturar se ja estiver dentro.
pub fn toggle(app: &AppHandle) {
    let (Some(window), Some(state)) = (app.get_webview_window("vidro"), app.try_state::<Vidro>())
    else {
        return;
    };

    if window.is_visible().unwrap_or(false) {
        leave(app, &state);
        return;
    }

    let Some(area) = area_under_cursor(app) else { return };
    state.previous.remember(window.hwnd().ok());
    if let Ok(mut slot) = state.area.lock() {
        *slot = Some(area);
    }

    // A janela principal sai de cena: o Vidro e sobre o que a pessoa esta
    // olhando, e o Harp por cima disso seria mais uma coisa no caminho — e
    // apareceria na captura.
    let main_visible = app
        .get_webview_window("main")
        .map(|main| main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(false))
        .unwrap_or(false);
    if let Ok(mut slot) = state.main_visible.lock() {
        *slot = main_visible;
    }
    if main_visible {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
    }

    // Posicao antes do tamanho: mudar de monitor pode mudar a escala, e o
    // tamanho precisa ser aplicado ja na escala certa.
    let _ = window.set_position(PhysicalPosition::new(area.x, area.y));
    let _ = window.set_size(PhysicalSize::new(area.width, area.height));
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("harp://vidro-open", area);
}

/// Sai do Vidro e devolve tudo como estava: janela principal e foco.
///
/// A principal volta sem ser ativada: mostrar do jeito comum a poria em
/// primeiro plano, e o foco precisa ir para o aplicativo onde a pessoa estava.
fn leave(app: &AppHandle, state: &Vidro) {
    if let Some(window) = app.get_webview_window("vidro") {
        let _ = window.hide();
    }
    let main_visible = state.main_visible.lock().map(|slot| *slot).unwrap_or(false);
    if main_visible {
        if let Some(main) = app.get_webview_window("main") {
            show_without_focus(&main);
        }
    }
    state.previous.restore();
}

#[cfg(target_os = "windows")]
fn show_without_focus(window: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
    match window.hwnd() {
        Ok(hwnd) => unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        },
        Err(_) => {
            let _ = window.show();
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn show_without_focus(window: &tauri::WebviewWindow) {
    let _ = window.show();
}

/// Esc: sai sem capturar.
#[tauri::command]
pub fn vidro_cancel(app: AppHandle, state: State<'_, Vidro>) {
    leave(&app, &state);
}

/// Raio dos cantos da imagem copiada, em pixels logicos: o mesmo das janelas
/// do Harp, para a captura sair com a cara do app.
const RAIO_CANTOS: f64 = 12.0;

/// Ctrl+Shift+Enter: recebe as anotacoes em PNG, captura a tela, junta e copia.
///
/// O PNG chega como corpo bruto da chamada, e nao como JSON: um vetor de bytes
/// serializado como lista de numeros seria varias vezes maior.
///
/// A ordem e o que importa aqui. So o que precisa da tela acontece antes de
/// devolver o foco: esconder, esperar o compositor, fotografar — dezenas de
/// milissegundos. Juntar as camadas e gravar no clipboard (que codifica um PNG
/// do tamanho do monitor) leva bem mais, e vai para outra thread. Antes, o foco
/// so voltava no fim de tudo, e quem ja tinha trocado de janela era puxado de
/// volta um segundo depois.
#[tauri::command]
pub fn vidro_finish(
    app: AppHandle,
    state: State<'_, Vidro>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let capturado = capture_screen(&app, &state, &request);
    leave(&app, &state);

    let (tela, anotacoes, area) = match capturado {
        Ok(partes) => partes,
        Err(error) => {
            // A janela do Vidro ja sumiu; quem avisa e a principal.
            let _ = app.emit_to("main", "harp://vidro-failed", error.clone());
            return Err(error);
        }
    };

    std::thread::spawn(move || {
        if let Err(error) = compose_and_copy(tela, &anotacoes, area) {
            let _ = app.emit_to("main", "harp://vidro-failed", error);
        }
    });
    Ok(())
}

/// Esconde o Vidro e fotografa a tela. Devolve a tela, o PNG das anotacoes e
/// a area, para o resto acontecer fora da thread principal.
fn capture_screen(
    app: &AppHandle,
    state: &Vidro,
    request: &tauri::ipc::Request<'_>,
) -> Result<(Vec<u8>, Vec<u8>, Area), String> {
    let tauri::ipc::InvokeBody::Raw(png) = request.body() else {
        return Err("anotacoes nao chegaram como imagem".into());
    };
    let area = state
        .area
        .lock()
        .ok()
        .and_then(|slot| *slot)
        .ok_or("area do Vidro desconhecida")?;

    // Primeiro some, depois fotografa. Esperar o DWM terminar de compor e o que
    // garante que a janela ja nao esta na tela quando a captura acontece.
    if let Some(window) = app.get_webview_window("vidro") {
        let _ = window.hide();
    }
    capture::wait_for_composition();

    let tela = capture::screen(area)?;
    Ok((tela, png.clone(), area))
}

fn compose_and_copy(mut tela: Vec<u8>, png: &[u8], area: Area) -> Result<(), String> {
    let (largura, altura, anotacoes) = decode_png(png)?;
    if largura != area.width || altura != area.height {
        return Err(format!(
            "anotacoes com {largura}x{altura}, tela com {}x{}",
            area.width, area.height
        ));
    }
    compose(&mut tela, &anotacoes);
    round_corners(&mut tela, area.width, area.height, RAIO_CANTOS * area.scale);

    arboard::Clipboard::new()
        .and_then(|mut clipboard| {
            clipboard.set_image(arboard::ImageData {
                width: area.width as usize,
                height: area.height as usize,
                bytes: std::borrow::Cow::Owned(tela),
            })
        })
        .map_err(|e| format!("clipboard: {e}"))
}

/// Recorta os quatro cantos em arco, com borda suave.
///
/// Os cantos ficam transparentes. Aplicativos que leem o PNG do clipboard (a
/// maioria dos navegadores, chats e editores) mostram o recorte; os que so leem
/// o formato antigo de bitmap podem pintar esses cantos de preto ou branco.
fn round_corners(rgba: &mut [u8], w: u32, h: u32, raio: f64) {
    let r = raio.max(0.0).min(w.min(h) as f64 / 2.0);
    let lado = r.ceil() as u32;
    if lado == 0 {
        return;
    }
    for cy in 0..lado {
        for cx in 0..lado {
            // Distancia do centro do pixel ao centro do arco do canto.
            let dx = r - (cx as f64 + 0.5);
            let dy = r - (cy as f64 + 0.5);
            let fora = (dx * dx + dy * dy).sqrt() - r;
            let cobertura = (0.5 - fora).clamp(0.0, 1.0);
            if cobertura >= 1.0 {
                continue;
            }
            for (x, y) in [(cx, cy), (w - 1 - cx, cy), (cx, h - 1 - cy), (w - 1 - cx, h - 1 - cy)] {
                let i = ((y * w + x) * 4 + 3) as usize;
                rgba[i] = (rgba[i] as f64 * cobertura).round() as u8;
            }
        }
    }
}

/// PNG para RGBA de 8 bits por canal, sem alfa pre-multiplicado.
fn decode_png(bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), String> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let mut buf = vec![0; reader.output_buffer_size().ok_or("PNG grande demais")?];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(info.buffer_size());

    let rgba = match info.color_type {
        png::ColorType::Rgba => buf,
        png::ColorType::Rgb => buf.chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        outro => return Err(format!("PNG em formato inesperado: {outro:?}")),
    };
    Ok((info.width, info.height, rgba))
}

/// Anotacoes por cima da tela, com a transparencia de cada pixel.
fn compose(tela: &mut [u8], anotacoes: &[u8]) {
    for (fundo, cima) in tela.chunks_exact_mut(4).zip(anotacoes.chunks_exact(4)) {
        let a = cima[3] as u32;
        if a == 0 {
            continue;
        }
        for c in 0..3 {
            fundo[c] = ((cima[c] as u32 * a + fundo[c] as u32 * (255 - a) + 127) / 255) as u8;
        }
        fundo[3] = 255;
    }
}

#[cfg(target_os = "windows")]
mod capture {
    use super::Area;
    use windows::Win32::Graphics::Dwm::DwmFlush;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
        DIB_RGB_COLORS, SRCCOPY,
    };

    /// Duas passadas do compositor: uma para esconder a janela, outra de folga.
    pub fn wait_for_composition() {
        unsafe {
            let _ = DwmFlush();
            let _ = DwmFlush();
        }
    }

    /// A area do monitor, em RGBA.
    pub fn screen(area: Area) -> Result<Vec<u8>, String> {
        let (w, h) = (area.width as i32, area.height as i32);
        unsafe {
            let tela = GetDC(None);
            if tela.is_invalid() {
                return Err("sem acesso a tela".into());
            }
            let memoria = CreateCompatibleDC(Some(tela));
            let bitmap = CreateCompatibleBitmap(tela, w, h);
            let anterior = SelectObject(memoria, bitmap.into());

            let copiou = BitBlt(memoria, 0, 0, w, h, Some(tela), area.x, area.y, SRCCOPY | CAPTUREBLT);

            let mut info = BITMAPINFO::default();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                // Negativo: linhas de cima para baixo, como a imagem final.
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            };
            let mut pixels = vec![0u8; (w * h * 4) as usize];
            let linhas = GetDIBits(
                memoria,
                bitmap,
                0,
                h as u32,
                Some(pixels.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            );

            SelectObject(memoria, anterior);
            let _ = DeleteObject(bitmap.into());
            let _ = DeleteDC(memoria);
            ReleaseDC(None, tela);

            copiou.map_err(|e| format!("captura: {e}"))?;
            if linhas == 0 {
                return Err("captura vazia".into());
            }

            // GDI entrega BGRA com alfa indefinido; o clipboard quer RGBA opaco.
            for pixel in pixels.chunks_exact_mut(4) {
                pixel.swap(0, 2);
                pixel[3] = 255;
            }
            Ok(pixels)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anotacao_opaca_substitui_e_transparente_preserva() {
        let mut tela = vec![10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255];
        let anotacoes = vec![
            200, 100, 50, 255, // opaca: vira a cor da anotacao
            200, 100, 50, 0, // transparente: a tela fica
            255, 255, 255, 128, // meio a meio
        ];
        compose(&mut tela, &anotacoes);
        assert_eq!(&tela[0..4], &[200, 100, 50, 255]);
        assert_eq!(&tela[4..8], &[10, 20, 30, 255]);
        assert_eq!(&tela[8..11], &[133, 138, 143]);
    }

    #[test]
    fn cantos_ficam_transparentes_e_o_meio_intacto() {
        let (w, h) = (40u32, 30u32);
        let mut img = vec![255u8; (w * h * 4) as usize];
        round_corners(&mut img, w, h, 10.0);
        let alfa = |x: u32, y: u32| img[((y * w + x) * 4 + 3) as usize];
        for (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] {
            assert_eq!(alfa(x, y), 0, "canto ({x}, {y}) recortado");
        }
        assert_eq!(alfa(w / 2, h / 2), 255, "o meio nao muda");
        assert_eq!(alfa(w / 2, 0), 255, "a borda reta nao muda");
        assert_eq!(alfa(0, h / 2), 255, "a borda reta nao muda");
    }

    #[test]
    fn captura_a_tela_de_verdade() {
        // Um retangulo pequeno do canto: prova que a chamada funciona nesta
        // maquina, sem depender do que esta aberto.
        let area = Area { x: 0, y: 0, width: 8, height: 8, scale: 1.0 };
        let pixels = capture::screen(area).expect("captura");
        assert_eq!(pixels.len(), 8 * 8 * 4);
        assert!(pixels.chunks_exact(4).all(|p| p[3] == 255));
    }
}
