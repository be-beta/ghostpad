/**
 * Persistencia em %APPDATA%/com.ghostpad.app/.
 *
 * Duas coisas separadas de proposito:
 *   - settings.json  preferencias, via plugin de store
 *   - draft.txt      o texto do usuario, gravado direto pelo Rust (notes.rs)
 *
 * O texto nao usa o plugin: ele mantem copia em memoria e regrava ao sair, e
 * uma instancia com copia desatualizada podia sobrescrever o texto novo.
 *
 * Separar importa: se as preferencias corromperem, o texto sobrevive. Perder a
 * opacidade preferida e um aborrecimento; perder a nota e perder o trabalho.
 */

import { invoke } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { Backdrop, GlobalAction, KeyCombo } from "./bridge";
import { DEFAULT_MODULES, type MetricModules } from "../ui/metrics";

export interface Settings {
  opacity: number;
  alwaysOnTop: boolean;
  excludeFromCapture: boolean;
  backdrop: Backdrop;
  /** Esmaece sozinho quando a janela fica parada e sem foco. */
  idleFade: boolean;
  /** Atalhos globais escolhidos pelo usuario; ausentes = padrao do backend. */
  shortcuts: Partial<Record<GlobalAction, KeyCombo>>;
  /** Metricas visiveis na barra de status. */
  statusBar: MetricModules;
}

export const DEFAULT_SETTINGS: Settings = {
  // Transparente o bastante para mostrar a proposta do app no primeiro uso, e
  // opaco o bastante para o usuario novo ler os controles.
  opacity: 0.9,
  alwaysOnTop: true,
  // Nunca liga sozinho: um usuario que nao pediu isso acharia que o app sumiu.
  excludeFromCapture: false,
  // Transparencia real e o unico fundo que funciona em qualquer maquina e com a
  // janela sem foco. Desfoque nativo fica como escolha explicita do usuario.
  backdrop: "transparent",
  idleFade: true,
  shortcuts: {},
  statusBar: { ...DEFAULT_MODULES },
};

// Modo fantasma fica fora de propósito: iniciar nele deixaria o app sem
// resposta a cliques antes de o usuario entender por que.

let settingsStore: Store | null = null;

export async function initStores(): Promise<void> {
  settingsStore = await load("settings.json", { autoSave: false });
}

export async function loadSettings(): Promise<Settings> {
  if (!settingsStore) return { ...DEFAULT_SETTINGS };
  const saved = await settingsStore.get<Partial<Settings>>("settings");
  // Mescla profunda no que e objeto: modulo novo numa versao futura precisa
  // aparecer para quem ja tem configuracao salva.
  return {
    ...DEFAULT_SETTINGS,
    ...(saved ?? {}),
    statusBar: { ...DEFAULT_SETTINGS.statusBar, ...(saved?.statusBar ?? {}) },
    shortcuts: { ...(saved?.shortcuts ?? {}) },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!settingsStore) return;
  await settingsStore.set("settings", settings);
  await settingsStore.save();
}

export function loadDraft(): Promise<string> {
  return invoke<string>("load_draft");
}

let saveChain: Promise<void> = Promise.resolve();

/**
 * Gravacoes enfileiradas: cada uma so comeca quando a anterior terminou, entao
 * uma gravacao antiga nunca termina depois de uma nova. Falhas nao quebram a
 * fila — a proxima gravacao ainda acontece.
 */
export function saveDraft(text: string): Promise<void> {
  const next = saveChain.then(() => invoke<void>("save_draft", { text }));
  saveChain = next.catch((error) => console.error("[ghostpad] falha ao salvar texto", error));
  return next;
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
