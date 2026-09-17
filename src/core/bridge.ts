/**
 * Ponte tipada para os comandos Rust.
 *
 * Todo comando daqui pode falhar de verdade — APIs Win32 dependem da versao do
 * Windows. Por isso nada aqui engole erro: quem chama decide o que mostrar.
 */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type Corner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "center";

export type Backdrop = "transparent" | "acrylic" | "blur";

export interface EffectsReport {
  roundedCorners: boolean;
  captureExclusionAvailable: boolean;
  /** Atalho de resgate registrado de fato, ou null se todos estavam ocupados. */
  panicShortcut: string | null;
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

export const setBackdrop = (kind: Backdrop) => invoke<void>("set_backdrop", { kind });

export const persistWindowState = () => invoke<void>("persist_window_state");

export const panicRecover = () => invoke<void>("panic_recover");

/** Consulta o que realmente pegou na maquina. Pode ser chamado a qualquer momento. */
export const getEffectsReport = () => invoke<EffectsReport>("get_effects_report");
