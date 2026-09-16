/**
 * GhostPad — orquestracao da janela principal.
 *
 * Fase 0/0.5: comportamento de janela (acrylic, topo, fantasma, invisibilidade
 * em gravacao, snap) mais um editor provisorio com persistencia. O CodeMirror
 * entra na Fase 1 e substitui apenas o <textarea>, sem mexer no resto.
 */

import {
  appWindow,
  onEffectsReport,
  panicRecover,
  setAlwaysOnTop,
  setClickThrough,
  setExcludeFromCapture,
  snapToCorner,
  type Corner,
  type EffectsReport,
} from "./core/bridge";
import {
  DEFAULT_SETTINGS,
  debounceWithCeiling,
  initStores,
  loadDraft,
  loadSettings,
  saveDraft,
  saveSettings,
  type Settings,
} from "./core/store";

const OPACITY_MIN = 0.15;
const OPACITY_MAX = 1;
const OPACITY_STEP = 0.05;

const el = {
  body: document.body,
  backdrop: document.getElementById("backdrop") as HTMLDivElement,
  controls: document.getElementById("controls") as HTMLDivElement,
  editor: document.getElementById("editor") as HTMLTextAreaElement,
  toast: document.getElementById("toast") as HTMLDivElement,
  btnMinimize: document.getElementById("btn-minimize") as HTMLButtonElement,
  btnClose: document.getElementById("btn-close") as HTMLButtonElement,
  chipOnTop: document.getElementById("chip-ontop") as HTMLButtonElement,
  chipGhost: document.getElementById("chip-ghost") as HTMLButtonElement,
  chipStealth: document.getElementById("chip-stealth") as HTMLButtonElement,
  metricWords: document.getElementById("metric-words") as HTMLSpanElement,
  metricOpacity: document.getElementById("metric-opacity") as HTMLSpanElement,
};

let settings: Settings = { ...DEFAULT_SETTINGS };
let ghostMode = false;
let effects: EffectsReport = {
  // Assume o pior ate o backend dizer o contrario: se o relatorio nunca chegar,
  // o app fica legivel (fundo solido) em vez de transparente e ilegivel.
  acrylic: false,
  roundedCorners: false,
  captureExclusionAvailable: false,
};

// --- Feedback --------------------------------------------------------------

let toastTimer: number | undefined;

function toast(message: string): void {
  el.toast.textContent = message;
  el.toast.dataset.visible = "true";
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.toast.dataset.visible = "false";
  }, 2200);
}

// --- Opacidade -------------------------------------------------------------

function applyOpacity(value: number): void {
  settings.opacity = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Number(value.toFixed(2))));
  document.documentElement.style.setProperty("--gp-opacity", String(settings.opacity));
  el.metricOpacity.textContent = `${Math.round(settings.opacity * 100)}%`;
}

function nudgeOpacity(delta: number): void {
  applyOpacity(settings.opacity + delta);
  void saveSettings(settings);
}

// --- Estados de janela -----------------------------------------------------

async function toggleAlwaysOnTop(force?: boolean): Promise<void> {
  const next = force ?? !settings.alwaysOnTop;
  try {
    await setAlwaysOnTop(next);
    settings.alwaysOnTop = next;
    el.chipOnTop.dataset.active = String(next);
    toast(next ? "Sempre visivel" : "Comportamento normal de janela");
    void saveSettings(settings);
  } catch (error) {
    toast(`Falhou: ${error}`);
  }
}

/**
 * Modo fantasma.
 *
 * O aviso nao e decorativo: neste estado a janela para de receber cliques E
 * perde o foco de teclado assim que o usuario clica no app de baixo. Sem
 * lembrar do atalho global de saida, o usuario fica sem caminho de volta.
 */
async function toggleGhost(force?: boolean): Promise<void> {
  const next = force ?? !ghostMode;
  try {
    await setClickThrough(next);
    ghostMode = next;
    el.chipGhost.dataset.active = String(next);
    el.body.dataset.ghost = String(next);
    toast(next ? "Modo fantasma — Ctrl+Alt+G traz de volta" : "Modo fantasma desligado");
  } catch (error) {
    toast(`Falhou: ${error}`);
  }
}

/**
 * Invisibilidade em gravacoes.
 *
 * Erro aqui e barulhento de proposito. Se o usuario acredita estar escondido e
 * nao esta, ele so descobre depois de publicar o video.
 */
async function toggleStealth(force?: boolean): Promise<void> {
  const next = force ?? !settings.excludeFromCapture;
  try {
    await setExcludeFromCapture(next);
    settings.excludeFromCapture = next;
    el.chipStealth.dataset.active = String(next);
    toast(next ? "Oculto em gravacoes e chamadas" : "Visivel em gravacoes");
    void saveSettings(settings);
  } catch (error) {
    el.chipStealth.dataset.active = "false";
    settings.excludeFromCapture = false;
    toast(`Nao foi possivel ocultar — voce APARECE na gravacao (${error})`);
  }
}

// --- Metricas --------------------------------------------------------------

function updateMetrics(): void {
  const text = el.editor.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  el.metricWords.textContent = words === 1 ? "1 palavra" : `${words} palavras`;
}

// --- Atalhos ---------------------------------------------------------------

const CORNER_BY_DIGIT: Record<string, Corner> = {
  "1": "top-left",
  "2": "top-right",
  "3": "bottom-left",
  "4": "bottom-right",
  "5": "top-center",
};

function handleKeydown(event: KeyboardEvent): void {
  const ctrl = event.ctrlKey || event.metaKey;
  if (!ctrl) return;

  // Alt+Setas fica reservado para mover linhas no CodeMirror (Fase 1), por isso
  // o snap usa Ctrl+Alt+digito em vez das setas previstas no rascunho inicial.
  if (event.altKey && CORNER_BY_DIGIT[event.key]) {
    event.preventDefault();
    void snapToCorner(CORNER_BY_DIGIT[event.key]);
    return;
  }

  switch (event.key) {
    case "[":
      event.preventDefault();
      nudgeOpacity(-OPACITY_STEP);
      break;
    case "]":
      event.preventDefault();
      nudgeOpacity(OPACITY_STEP);
      break;
    case "p":
    case "P":
      if (!event.shiftKey) {
        event.preventDefault();
        void toggleAlwaysOnTop();
      }
      break;
    case "g":
    case "G":
      if (event.shiftKey) {
        event.preventDefault();
        void toggleGhost();
      }
      break;
    case "h":
    case "H":
      if (event.shiftKey) {
        event.preventDefault();
        void toggleStealth();
      }
      break;
    case "q":
    case "Q":
      event.preventDefault();
      void closeApp();
      break;
  }
}

// --- Ciclo de vida ---------------------------------------------------------

async function closeApp(): Promise<void> {
  await saveDraft(el.editor.value);
  await saveSettings(settings);
  await appWindow.destroy();
}

const persistDraft = debounceWithCeiling(
  (text: string) => void saveDraft(text),
  600,
  4000,
);

function wireEvents(): void {
  el.editor.addEventListener("input", () => {
    updateMetrics();
    persistDraft(el.editor.value);
  });

  // Controles aparecem so quando o mouse chega perto do canto superior direito.
  document.addEventListener("mousemove", (event) => {
    const nearTop = event.clientY < 56;
    const nearRight = event.clientX > window.innerWidth - 140;
    el.controls.dataset.visible = String(nearTop && nearRight);
  });
  document.addEventListener("mouseleave", () => {
    el.controls.dataset.visible = "false";
  });

  el.btnMinimize.addEventListener("click", () => void appWindow.minimize());
  el.btnClose.addEventListener("click", () => void closeApp());
  el.chipOnTop.addEventListener("click", () => void toggleAlwaysOnTop());
  el.chipGhost.addEventListener("click", () => void toggleGhost());
  el.chipStealth.addEventListener("click", () => void toggleStealth());

  window.addEventListener("keydown", handleKeydown);

  // Rede de seguranca do frontend: o backend ja desfaz os estados no resgate,
  // mas a UI precisa refletir isso ou os chips ficam mentindo.
  window.addEventListener("focus", () => {
    if (ghostMode) {
      ghostMode = false;
      el.chipGhost.dataset.active = "false";
      el.body.dataset.ghost = "false";
    }
  });

  void appWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    await closeApp();
  });
}

async function boot(): Promise<void> {
  void onEffectsReport((report) => {
    effects = report;
    el.body.dataset.acrylic = String(report.acrylic);
    if (!report.captureExclusionAvailable) {
      el.chipStealth.disabled = true;
      el.chipStealth.title = "Indisponivel nesta versao do Windows";
    }
  });

  await initStores();
  settings = await loadSettings();

  applyOpacity(settings.opacity);
  el.editor.value = await loadDraft();
  updateMetrics();

  // Restaura o estado salvo sem passar pelos toggles: no boot os toasts seriam
  // ruido anunciando algo que o usuario ja configurou antes.
  el.chipOnTop.dataset.active = String(settings.alwaysOnTop);
  await setAlwaysOnTop(settings.alwaysOnTop).catch(() => {});

  if (settings.excludeFromCapture) {
    try {
      await setExcludeFromCapture(true);
      el.chipStealth.dataset.active = "true";
    } catch {
      settings.excludeFromCapture = false;
      toast("Modo oculto nao pode ser restaurado — voce aparece em gravacoes");
    }
  }

  wireEvents();
  el.editor.focus();

  // Silencia o aviso de variavel nao lida ate a Fase 1 usar o relatorio inteiro.
  void effects;
  void panicRecover;
}

void boot();
