/**
 * Ponte tipada para os comandos Rust.
 *
 * Todo comando daqui pode falhar de verdade — APIs Win32 dependem da versao do
 * Windows. Por isso nada aqui engole erro: quem chama decide o que mostrar.
 */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

export type Corner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "center";

export interface EffectsReport {
  acrylic: boolean;
  roundedCorners: boolean;
  captureExclusionAvailable: boolean;
}

export const appWindow = getCurrentWindow();

export const setAlwaysOnTop = (enable: boolean) =>
  invoke<boolean>("set_always_on_top", { enable });

export const setClickThrough = (enable: boolean) =>
  invoke<boolean>("set_click_through", { enable });

export const setExcludeFromCapture = (enable: boolean) =>
  invoke<boolean>("set_exclude_from_capture", { enable });

export const snapToCorner = (corner: Corner, margin = 12) =>
  invoke<void>("snap_to_corner", { corner, margin });

export const panicRecover = () => invoke<void>("panic_recover");

/**
 * O backend emite o relatorio no setup, que pode acontecer antes do frontend
 * montar. O `listen` sozinho perderia esse evento, entao o chamador trata o
 * caso de nunca receber nada assumindo o fallback conservador.
 */
export const onEffectsReport = (handler: (report: EffectsReport) => void) =>
  listen<EffectsReport>("ghostpad://effects-report", (event) => handler(event.payload));
