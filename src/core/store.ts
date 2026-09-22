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
import { DEFAULT_FONT, DEFAULT_FONT_SIZE, type FontId } from "./fonts";
import { detectLang, type Lang } from "./i18n";
import { DEFAULT_CONTROLS, DEFAULT_MODULES, type BarControls, type MetricModules } from "../ui/metrics";

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
  /** Controles visiveis na barra de status. */
  barControls: BarControls;
  /** Largura da faixa do teleprompter, em pixels logicos. */
  notchWidth: number;
  lang: Lang;
  font: FontId;
  fontSize: number;
  openNotes: number[];
  activeNote: number;
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
  // Linha curta e mais facil de ler descendo: o olho pega a frase inteira.
  notchWidth: 620,
  // Comeca no idioma do sistema, entre os tres que o app fala.
  lang: detectLang(),
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  /** Anotacoes abertas, na ordem das abas. Comeca com uma so. */
  openNotes: [1],
  /** Anotacao aberta por ultimo. */
  activeNote: 1,
  shortcuts: {},
  statusBar: { ...DEFAULT_MODULES },
  barControls: { ...DEFAULT_CONTROLS },
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
    barControls: { ...DEFAULT_SETTINGS.barControls, ...(saved?.barControls ?? {}) },
    // Uma aba precisa existir sempre: lista vazia deixaria o app sem texto.
    openNotes: saved?.openNotes?.length ? [...saved.openNotes] : [...DEFAULT_SETTINGS.openNotes],
    shortcuts: { ...(saved?.shortcuts ?? {}) },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!settingsStore) return;
  await settingsStore.set("settings", settings);
  await settingsStore.save();
}

export function loadNote(slot: number): Promise<string> {
  return invoke<string>("load_note", { slot });
}

let saveChain: Promise<void> = Promise.resolve();

/**
 * Gravacoes enfileiradas: cada uma so comeca quando a anterior terminou, entao
 * uma gravacao antiga nunca termina depois de uma nova. Falhas nao quebram a
 * fila — a proxima gravacao ainda acontece.
 */
export function saveNote(slot: number, text: string): Promise<void> {
  const next = saveChain.then(() => invoke<void>("save_note", { slot, text }));
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
