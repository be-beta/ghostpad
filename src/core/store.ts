/**
 * Persistencia em %APPDATA%/com.ghostpad.app/.
 *
 * Duas coisas separadas de proposito:
 *   - settings.json  preferencias (opacidade, estados de janela)
 *   - draft.json     o texto do usuario
 *
 * Separar importa: se as preferencias corromperem, o texto sobrevive. Perder a
 * opacidade preferida e um aborrecimento; perder a nota e perder o trabalho.
 */

import { load, type Store } from "@tauri-apps/plugin-store";

export interface Settings {
  opacity: number;
  alwaysOnTop: boolean;
  excludeFromCapture: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  opacity: 0.85,
  alwaysOnTop: true,
  // Nunca liga sozinho: um usuario que nao pediu isso acharia que o app sumiu.
  excludeFromCapture: false,
};

// Modo fantasma fica fora de propósito: iniciar nele deixaria o app sem
// resposta a cliques antes de o usuario entender por que.

let settingsStore: Store | null = null;
let draftStore: Store | null = null;

export async function initStores(): Promise<void> {
  settingsStore = await load("settings.json", { autoSave: false });
  draftStore = await load("draft.json", { autoSave: false });
}

export async function loadSettings(): Promise<Settings> {
  if (!settingsStore) return { ...DEFAULT_SETTINGS };
  const saved = await settingsStore.get<Partial<Settings>>("settings");
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!settingsStore) return;
  await settingsStore.set("settings", settings);
  await settingsStore.save();
}

export async function loadDraft(): Promise<string> {
  if (!draftStore) return "";
  return (await draftStore.get<string>("text")) ?? "";
}

export async function saveDraft(text: string): Promise<void> {
  if (!draftStore) return;
  await draftStore.set("text", text);
  await draftStore.save();
}

/**
 * Agrupa gravacoes para nao escrever em disco a cada tecla, mas com teto: sem
 * o `maxWait`, digitacao continua (ditado de voz, por exemplo) adiaria o save
 * indefinidamente e uma queda levaria tudo junto.
 */
export function debounceWithCeiling<T extends unknown[]>(
  fn: (...args: T) => void,
  wait: number,
  maxWait: number,
): (...args: T) => void {
  let timer: number | undefined;
  let firstCallAt: number | null = null;

  return (...args: T) => {
    const now = Date.now();
    if (firstCallAt === null) firstCallAt = now;

    const run = () => {
      if (timer) window.clearTimeout(timer);
      timer = undefined;
      firstCallAt = null;
      fn(...args);
    };

    if (now - firstCallAt >= maxWait) {
      run();
      return;
    }

    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(run, wait);
  };
}
