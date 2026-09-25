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
  /** Atalho de invocacao registrado de fato, ou null. */
  summonShortcut: string | null;
  /** Atalho dos rascunhos efetivamente registrado. */
  jotShortcut: string | null;
  /** Atalho do Vidro efetivamente registrado. */
  vidroShortcut: string | null;
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

/** Faixa fina no topo central da tela; medidas em pixels logicos. */
export const placeTopCenter = (width: number, height: number, margin = 6) =>
  invoke<void>("place_top_center", { width, height, margin });

export type HalfSide = "left" | "right" | "top" | "bottom" | "full";

export const snapHalf = (side: HalfSide, margin = 12) =>
  invoke<void>("snap_half", { side, margin });

/** Le um arquivo escolhido pelo usuario no dialogo do sistema. */
export const readTextFile = (path: string) => invoke<string>("read_text_file", { path });

/** Grava o texto num arquivo escolhido pelo usuario. */
export const writeTextFile = (path: string, text: string) =>
  invoke<void>("write_text_file", { path, text });

export interface SnapshotInfo {
  id: string;
  /** Anotacao em que a versao foi gravada. */
  slot: number;
  savedAtMs: number;
  chars: number;
  preview: string;
}

/** Fecha a anotacao: o texto vai para o historico dela antes de sair. */
export const closeNote = (slot: number) => invoke<void>("close_note", { slot });

/** Todas as versoes, de todas as anotacoes. */
export const listSnapshots = () => invoke<SnapshotInfo[]>("list_snapshots");

export const readSnapshot = (slot: number, id: string) =>
  invoke<string>("read_snapshot", { slot, id });

/** Programas de gravacao e chamada em execucao, pelo nome do processo. */
export const detectRecorders = () => invoke<{ label: string }[]>("detect_recorders");

/** Marca o tamanho atual como o tamanho de trabalho do usuario. */
export const rememberSize = () => invoke<void>("remember_size");

/** Passos em pixels logicos; o backend converte pela escala da tela. */
export const resizeBy = (dw: number, dh: number) => invoke<void>("resize_by", { dw, dh });

export type GlobalAction = "panic" | "summon" | "jot" | "vidro";

export interface KeyCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** `event.code`, nao o simbolo: independe do layout do teclado. */
  code: string;
}

/** Devolve o rotulo do atalho registrado, ou erro se estiver em uso. */
export const setGlobalShortcut = (action: GlobalAction, combo: KeyCombo) =>
  invoke<string>("set_global_shortcut", { action, ...combo });

export const setBackdrop = (kind: Backdrop) => invoke<void>("set_backdrop", { kind });

export const persistWindowState = () => invoke<void>("persist_window_state");

export const panicRecover = () => invoke<void>("panic_recover");

/** Consulta o que realmente pegou na maquina. Pode ser chamado a qualquer momento. */
export const getEffectsReport = () => invoke<EffectsReport>("get_effects_report");

// --- Rascunhos -------------------------------------------------------------

/** Um rascunho guardado. So existe em memoria, no processo do Harp. */
export interface Draft {
  id: number;
  text: string;
  /** Milissegundos desde 1970. */
  at: number;
}

export const listDrafts = () => invoke<Draft[]>("jot_list");
export const copyDraft = (id: number) => invoke<void>("jot_copy", { id });
export const deleteDraft = (id: number) => invoke<void>("jot_delete", { id });
export const clearDrafts = () => invoke<void>("jot_clear");
