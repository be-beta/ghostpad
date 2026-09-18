/**
 * GhostPad — orquestracao da janela principal.
 *
 * Liga janela (bridge), persistencia (store), editor (CodeMirror) e interface.
 * Nenhum desses modulos conhece os outros; so este arquivo os conecta.
 */

import "@fontsource-variable/inter";
import { listen } from "@tauri-apps/api/event";

import {
  appWindow,
  getEffectsReport,
  persistWindowState,
  setAlwaysOnTop,
  setBackdrop,
  setClickThrough,
  setExcludeFromCapture,
  snapToCorner,
  type Backdrop,
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
import { createEditor, type GhostEditor } from "./editor/editor";
import { createShortcutsPanel } from "./ui/shortcuts";

const OPACITY_MIN = 0.2;
const OPACITY_MAX = 1;
// 10%: com 5% eram cliques demais para chegar ao nivel desejado.
const OPACITY_STEP = 0.1;
// Salto grande (Ctrl+Shift): dois toques cobrem o intervalo inteiro.
const OPACITY_JUMP = 0.5;

const el = {
  body: document.body,
  controls: document.getElementById("controls") as HTMLDivElement,
  editorHost: document.getElementById("editor") as HTMLDivElement,
  toast: document.getElementById("toast") as HTMLDivElement,
  btnMinimize: document.getElementById("btn-minimize") as HTMLButtonElement,
  btnClose: document.getElementById("btn-close") as HTMLButtonElement,
  chipOnTop: document.getElementById("chip-ontop") as HTMLButtonElement,
  chipGhost: document.getElementById("chip-ghost") as HTMLButtonElement,
  chipStealth: document.getElementById("chip-stealth") as HTMLButtonElement,
  chipBackdrop: document.getElementById("chip-backdrop") as HTMLButtonElement,
  chipHelp: document.getElementById("chip-help") as HTMLButtonElement,
  metricWords: document.getElementById("metric-words") as HTMLSpanElement,
  metricOpacity: document.getElementById("metric-opacity") as HTMLSpanElement,
  shortcuts: document.getElementById("shortcuts") as HTMLDivElement,
};

let settings: Settings = { ...DEFAULT_SETTINGS };
let ghostMode = false;
let editor: GhostEditor;
let effects: EffectsReport = {
  // Assume o pior ate o backend responder: recursos ficam desabilitados em vez
  // de prometer algo que talvez nao funcione.
  roundedCorners: false,
  captureExclusionAvailable: false,
  panicShortcut: null,
  summonShortcut: null,
};

const shortcutsPanel = createShortcutsPanel(el.shortcuts, () => effects);

// --- Feedback --------------------------------------------------------------

let toastTimer: number | undefined;

function toast(message: string): void {
  el.toast.textContent = message;
  el.toast.dataset.visible = "true";
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.toast.dataset.visible = "false";
  }, 2400);
}

// --- Opacidade -------------------------------------------------------------

function applyOpacity(value: number): void {
  settings.opacity = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Number(value.toFixed(2))));
  document.documentElement.style.setProperty("--gp-opacity", String(settings.opacity));
  el.metricOpacity.textContent = `${Math.round(settings.opacity * 100)}%`;
}

/**
 * Ao abrir, a janela aparece opaca e esmaece ate a opacidade salva.
 *
 * Existe porque a posicao e a opacidade sao restauradas: quem fechou com 20%
 * num canto, sobre um fundo parecido, poderia abrir o app e nao encontra-lo.
 * O instante opaco mostra onde ele esta, sem desfazer a preferencia.
 */
function revealOnLaunch(): void {
  if (settings.opacity >= OPACITY_MAX) return;
  const root = document.documentElement.style;
  root.setProperty("--gp-opacity-duration", "0ms");
  root.setProperty("--gp-opacity", String(OPACITY_MAX));

  window.setTimeout(() => {
    root.setProperty("--gp-opacity-duration", "700ms");
    applyOpacity(settings.opacity);
    window.setTimeout(() => root.removeProperty("--gp-opacity-duration"), 750);
  }, 900);
}

function nudgeOpacity(delta: number): void {
  // Arredonda para a grade de 10%: valores salvos fora dela (ex.: 65%) entram
  // no ritmo no primeiro ajuste em vez de ficarem sempre "quebrados".
  applyOpacity(Math.round((settings.opacity + delta) * 10) / 10);
  void saveSettings(settings);
}

// --- Estados de janela -----------------------------------------------------

async function toggleAlwaysOnTop(force?: boolean): Promise<void> {
  const next = force ?? !settings.alwaysOnTop;
  try {
    await setAlwaysOnTop(next);
    settings.alwaysOnTop = next;
    el.chipOnTop.dataset.active = String(next);
    toast(next ? "Sempre visível" : "Comportamento normal de janela");
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
    const exit = effects.panicShortcut
      ? `${effects.panicShortcut} traz de volta`
      : "clique no ícone da barra de tarefas para voltar";
    toast(next ? `Modo fantasma — ${exit}` : "Modo fantasma desligado");
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
    toast(next ? "Oculto em gravações e chamadas" : "Visível em gravações");
    void saveSettings(settings);
  } catch (error) {
    el.chipStealth.dataset.active = "false";
    settings.excludeFromCapture = false;
    toast(`Não foi possível ocultar — você APARECE na gravação (${error})`);
  }
}

// --- Fundo -----------------------------------------------------------------

const BACKDROP_ORDER: Backdrop[] = ["transparent", "blur", "acrylic"];
const BACKDROP_LABEL: Record<Backdrop, string> = {
  transparent: "Transparente",
  blur: "Desfoque",
  acrylic: "Acrylic",
};

async function applyBackdrop(kind: Backdrop, announce: boolean): Promise<void> {
  try {
    await setBackdrop(kind);
    settings.backdrop = kind;
    el.chipBackdrop.textContent = BACKDROP_LABEL[kind];
    if (announce) {
      // O aviso do acrylic existe porque o comportamento surpreende: ele some
      // justamente quando o usuario clica no app de baixo.
      toast(
        kind === "acrylic"
          ? "Acrylic — fica sólido quando a janela perde o foco"
          : `Fundo: ${BACKDROP_LABEL[kind]}`,
      );
      void saveSettings(settings);
    }
  } catch (error) {
    if (announce) toast(`Fundo indisponível: ${error}`);
    if (kind !== "transparent") await applyBackdrop("transparent", false);
  }
}

function cycleBackdrop(): void {
  const next = BACKDROP_ORDER[(BACKDROP_ORDER.indexOf(settings.backdrop) + 1) % BACKDROP_ORDER.length];
  void applyBackdrop(next, true);
}

// --- Texto -----------------------------------------------------------------

function updateMetrics(text: string): void {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  el.metricWords.textContent = words === 1 ? "1 palavra" : `${words} palavras`;
}

const persistDraft = debounceWithCeiling((text: string) => void saveDraft(text), 400, 2000);

function onTextChange(text: string): void {
  updateMetrics(text);
  persistDraft(text);
}

async function copyAll(): Promise<boolean> {
  const text = editor.getText();
  if (!text.trim()) {
    toast("Nada para copiar");
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    toast(`Não foi possível copiar: ${error}`);
    return false;
  }
}

/**
 * O ciclo de quem escreve prompt: redige, copia, cola no destino, recomeca.
 * So limpa se a copia deu certo — nunca apaga texto que nao foi para lugar
 * nenhum. A limpeza e uma transacao do editor, entao Ctrl+Z traz tudo de volta.
 */
async function copyAllAndClear(): Promise<void> {
  if (!(await copyAll())) return;
  editor.replaceAll("");
  void saveDraft("");
  toast("Copiado e limpo — Ctrl+Z desfaz");
}

// --- Atalhos ---------------------------------------------------------------

const CORNER_BY_DIGIT: Record<string, Corner> = {
  "1": "top-left",
  "2": "top-right",
  "3": "bottom-left",
  "4": "bottom-right",
  "5": "top-center",
};

/**
 * Direcao das teclas de colchete, por posicao fisica.
 *
 * Com Shift, o navegador reporta "{" e "}" em vez de "[" e "]", e o simbolo
 * muda conforme o layout do teclado. `event.code` e estavel nos dois casos.
 */
function bracketDirection(event: KeyboardEvent): -1 | 1 | 0 {
  if (event.code === "BracketLeft" || "[{".includes(event.key)) return -1;
  if (event.code === "BracketRight" || "]}".includes(event.key)) return 1;
  return 0;
}

/** Teclados ABNT2 e numericos produzem "/" por teclas fisicas diferentes. */
const isSlash = (event: KeyboardEvent) =>
  event.key === "/" || event.key === "?" || event.code === "Slash" || event.code === "IntlRo" || event.code === "NumpadDivide";

/**
 * Atalhos do app. Retorna true quando tratou a tecla — o editor usa isso para
 * nao processar a mesma tecla em seguida.
 */
function handleKeydown(event: KeyboardEvent): boolean {
  if (event.key === "Escape" && shortcutsPanel.isOpen()) {
    shortcutsPanel.close();
    editor.focus();
    return consume(event);
  }

  const ctrl = event.ctrlKey || event.metaKey;
  if (!ctrl) return false;

  if (isSlash(event)) {
    shortcutsPanel.toggle();
    if (!shortcutsPanel.isOpen()) editor.focus();
    return consume(event);
  }

  // Alt+Setas fica com o editor (mover linhas), por isso o snap usa Ctrl+Alt+digito.
  if (event.altKey && CORNER_BY_DIGIT[event.key]) {
    void snapToCorner(CORNER_BY_DIGIT[event.key]);
    return consume(event);
  }

  const bracket = bracketDirection(event);
  if (bracket !== 0) {
    nudgeOpacity(bracket * (event.shiftKey ? OPACITY_JUMP : OPACITY_STEP));
    return consume(event);
  }

  const key = event.key.toLowerCase();

  if (event.shiftKey) {
    switch (key) {
      case "enter":
        if (!event.repeat) void copyAllAndClear();
        return consume(event);
      case "c":
        void copyAll().then((ok) => ok && toast("Todo o texto foi copiado"));
        return consume(event);
      case "g":
        void toggleGhost();
        return consume(event);
      case "h":
        void toggleStealth();
        return consume(event);
      case "b":
        cycleBackdrop();
        return consume(event);
    }
    return false;
  }

  switch (key) {
    case "p":
      void toggleAlwaysOnTop();
      return consume(event);
    case "q":
      if (!event.repeat) void closeApp();
      return consume(event);
  }
  return false;
}

function consume(event: KeyboardEvent): true {
  event.preventDefault();
  event.stopPropagation();
  return true;
}

// --- Ciclo de vida ---------------------------------------------------------

let closing = false;

async function closeApp(): Promise<void> {
  // Segurar Ctrl+Q repete o keydown e disparava varios fechamentos concorrentes.
  if (closing) return;
  closing = true;
  // Salvar e tentativa; fechar e garantia. Uma falha de disco nao pode deixar o
  // usuario preso numa janela que ignora o botao de fechar.
  try {
    await Promise.all([saveDraft(editor.getText()), saveSettings(settings), persistWindowState()]);
  } catch (error) {
    console.error("[ghostpad] falha ao salvar antes de fechar", error);
  }
  await appWindow.destroy();
}

// --- Mover e redimensionar ------------------------------------------------

type ResizeDirection = Parameters<typeof appWindow.startResizeDragging>[0];

/**
 * Arraste e redimensionamento feitos a mao, sem `data-tauri-drag-region`.
 * O atributo nao funcionava no botao de alca e, com duplo clique, maximizava a
 * janela — o oposto do que um bloco flutuante quer.
 */
function wireWindowGestures(): void {
  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;

    const resize = target.closest<HTMLElement>("[data-resize]");
    if (resize) {
      event.preventDefault();
      void appWindow.startResizeDragging(resize.dataset.resize as ResizeDirection);
      return;
    }

    const drag = target.closest<HTMLElement>("[data-drag]");
    // Botoes dentro de uma zona arrastavel (chips da barra) continuam clicaveis.
    if (drag && !target.closest("button")) {
      event.preventDefault();
      void appWindow.startDragging();
    }
  });
}

function wireEvents(): void {
  wireWindowGestures();

  // Controles aparecem so quando o mouse chega perto do canto superior direito.
  document.addEventListener("mousemove", (event) => {
    const nearTop = event.clientY < 56;
    const nearRight = event.clientX > window.innerWidth - 150;
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
  el.chipBackdrop.addEventListener("click", () => cycleBackdrop());
  el.chipHelp.addEventListener("click", () => shortcutsPanel.toggle());

  // Teclas com o foco fora do editor (painel, chips). Dentro do editor, o
  // proprio CodeMirror chama handleKeydown antes e marca a tecla como tratada.
  window.addEventListener("keydown", (event) => {
    if (!event.defaultPrevented) handleKeydown(event);
  });

  // Voltar para a janela (barra de tarefas, Alt+Tab, resgate) e sinal claro de
  // que o usuario quer interagir com ela. Desliga o modo fantasma de verdade.
  window.addEventListener("focus", () => {
    if (ghostMode) void toggleGhost(false);
  });

  // Invocacao global: a janela ja veio para frente no Rust; aqui so o cursor.
  void listen("ghostpad://summoned", () => {
    shortcutsPanel.close();
    editor.focus();
  });

  void appWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    await closeApp();
  });
}

async function boot(): Promise<void> {
  try {
    effects = await getEffectsReport();
  } catch {
    // Mantem o fallback conservador definido na declaracao.
  }
  if (!effects.captureExclusionAvailable) {
    el.chipStealth.disabled = true;
    el.chipStealth.title = "Indisponível nesta versão do Windows";
  }

  await initStores();
  settings = await loadSettings();

  applyOpacity(settings.opacity);
  revealOnLaunch();
  await applyBackdrop(settings.backdrop, false);

  const initialText = await loadDraft();
  editor = createEditor({
    parent: el.editorHost,
    initialText,
    onChange: onTextChange,
    onAppKeydown: handleKeydown,
  });
  updateMetrics(initialText);

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
      toast("Modo oculto não pôde ser restaurado — você aparece em gravações");
    }
  }

  wireEvents();
  editor.focus();
}

void boot();
