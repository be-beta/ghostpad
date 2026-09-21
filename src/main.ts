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
  rememberSize,
  resizeBy,
  setBackdrop,
  setClickThrough,
  setGlobalShortcut,
  snapHalf,
  type GlobalAction,
  type HalfSide,
  type KeyCombo,
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
import {
  MODULE_LABELS,
  enabledCount,
  renderMetrics,
  type MetricKey,
} from "./ui/metrics";
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
  metrics: document.getElementById("metrics") as HTMLSpanElement,
  chipModules: document.getElementById("chip-modules") as HTMLButtonElement,
  modules: document.getElementById("modules") as HTMLDivElement,
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

/**
 * Troca um atalho global e guarda a escolha. Se o backend recusar (atalho em uso
 * por outro programa), nada muda e o motivo aparece para o usuario.
 */
async function rebindGlobalShortcut(action: GlobalAction, combo: KeyCombo): Promise<void> {
  try {
    const label = await setGlobalShortcut(action, combo);
    effects = {
      ...effects,
      panicShortcut: action === "panic" ? label : effects.panicShortcut,
      summonShortcut: action === "summon" ? label : effects.summonShortcut,
    };
    settings.shortcuts = { ...settings.shortcuts, [action]: combo };
    await saveSettings(settings);
    toast(`Atalho definido: ${label}`);
  } catch (error) {
    toast(String(error));
  }
}

const shortcutsPanel = createShortcutsPanel(el.shortcuts, () => effects, rebindGlobalShortcut);

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

/**
 * Pinta uma opacidade sem mexer na preferencia do usuario.
 *
 * A separacao existe por causa do esmaecimento automatico: ele muda o que esta
 * na tela, mas o valor escolhido pela pessoa continua valendo quando ela volta.
 */
function renderOpacity(value: number, durationMs?: number): void {
  const root = document.documentElement.style;
  if (durationMs === undefined) root.removeProperty("--gp-opacity-duration");
  else root.setProperty("--gp-opacity-duration", `${durationMs}ms`);
  root.setProperty("--gp-opacity", String(value));
}

function applyOpacity(value: number): void {
  settings.opacity = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Number(value.toFixed(2))));
  renderOpacity(settings.opacity);
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
  renderOpacity(OPACITY_MAX, 0);
  window.setTimeout(() => {
    renderOpacity(settings.opacity, 700);
    window.setTimeout(() => renderOpacity(settings.opacity), 750);
  }, 900);
}

// --- Esmaecimento por inatividade -----------------------------------------

const IDLE_AFTER_MS = 45_000;
const IDLE_FACTOR = 0.5;
const IDLE_FLOOR = 0.12;

let idleTimer: number | undefined;
let faded = false;

/**
 * Some aos poucos quando a janela fica parada e sem foco.
 *
 * Nunca esmaece com a janela em foco nem com o mouse em cima: nesses casos a
 * pessoa provavelmente esta lendo, e sumir com o texto seria o oposto do que
 * ela quer. Qualquer sinal de presenca traz a opacidade de volta na hora.
 */
function scheduleIdleFade(): void {
  if (idleTimer) window.clearTimeout(idleTimer);
  if (!settings.idleFade) return;

  idleTimer = window.setTimeout(() => {
    if (document.hasFocus() || el.body.matches(":hover")) {
      scheduleIdleFade();
      return;
    }
    faded = true;
    renderOpacity(Math.max(IDLE_FLOOR, settings.opacity * IDLE_FACTOR), 1200);
  }, IDLE_AFTER_MS);
}

function wakeFromIdle(): void {
  if (faded) {
    faded = false;
    renderOpacity(settings.opacity, 220);
  }
  scheduleIdleFade();
}

function toggleIdleFade(): void {
  settings.idleFade = !settings.idleFade;
  el.metricOpacity.dataset.idle = String(settings.idleFade);
  wakeFromIdle();
  toast(settings.idleFade ? "Esmaece sozinho quando parado" : "Esmaecimento automático desligado");
  void saveSettings(settings);
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

/**
 * Encurta os rotulos quando a barra fica disputada: janela estreita ou tres ou
 * mais metricas ligadas. Antes disso, as metricas invadiam os chips de estado.
 */
function updateMetrics(text: string): void {
  const compact = el.body.dataset.narrow === "true" || enabledCount(settings.statusBar) >= 3;
  el.body.dataset.dense = String(enabledCount(settings.statusBar) >= 4);
  renderMetrics(el.metrics, text, settings.statusBar, compact);
}

// --- Menu de modulos da barra ---------------------------------------------

/**
 * Escolhe o que a barra mostra.
 *
 * Existe porque as metricas uteis mudam com a tarefa: quem escreve prompt olha
 * tokens, quem escreve texto longo olha paginas, e ninguem quer as cinco ao
 * mesmo tempo numa janela estreita.
 */
function renderModulesMenu(): void {
  el.modules.textContent = "";

  for (const [key, label] of Object.entries(MODULE_LABELS) as [MetricKey, string][]) {
    const item = document.createElement("button");
    item.className = "gp-menu__item";
    item.dataset.on = String(settings.statusBar[key]);
    item.dataset.module = key;
    item.innerHTML = `<span class="gp-menu__box"></span>${label}`;
    el.modules.append(item);
  }
}

function toggleModulesMenu(open?: boolean): void {
  const next = open ?? el.modules.hidden;
  if (next) renderModulesMenu();
  el.modules.hidden = !next;
}

const persistDraft = debounceWithCeiling((text: string) => void saveDraft(text), 400, 2000);

function onTextChange(text: string): void {
  updateMetrics(text);
  persistDraft(text);
  wakeFromIdle();
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
const HALF_BY_DIGIT: Record<string, HalfSide> = {
  "6": "left",
  "7": "right",
  "8": "top",
  "9": "bottom",
  "0": "full",
};

/** Passo de redimensionamento por teclado, em pixels logicos. */
const RESIZE_STEP = 40;

const RESIZE_BY_ARROW: Record<string, [number, number]> = {
  ArrowRight: [RESIZE_STEP, 0],
  ArrowLeft: [-RESIZE_STEP, 0],
  ArrowDown: [0, RESIZE_STEP],
  ArrowUp: [0, -RESIZE_STEP],
};

function handleKeydown(event: KeyboardEvent): boolean {
  if (event.key === "Escape" && !el.modules.hidden) {
    toggleModulesMenu(false);
    editor.focus();
    return consume(event);
  }

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
  if (event.altKey && !event.shiftKey) {
    if (CORNER_BY_DIGIT[event.key]) {
      void snapToCorner(CORNER_BY_DIGIT[event.key]);
      return consume(event);
    }
    if (HALF_BY_DIGIT[event.key]) {
      void snapHalf(HALF_BY_DIGIT[event.key]);
      return consume(event);
    }
  }

  // Ctrl+Alt+Shift+setas redimensiona. Evita Ctrl+Alt+setas, que em maquinas com
  // grafico Intel gira a tela inteira.
  if (event.altKey && event.shiftKey && RESIZE_BY_ARROW[event.key]) {
    const [dw, dh] = RESIZE_BY_ARROW[event.key];
    void resizeBy(dw, dh);
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
/**
 * Arrastar a borda e uma escolha de tamanho deliberada, entao o backend precisa
 * saber. O arraste e nativo: o webview nao recebe o mouseup que o encerra. Por
 * isso o fim do gesto e detectado pela pausa nos eventos de redimensionamento.
 */
let resizingByUser = false;
let resizeSettleTimer: number | undefined;

function noteManualResize(): void {
  if (!resizingByUser) return;
  if (resizeSettleTimer) window.clearTimeout(resizeSettleTimer);
  resizeSettleTimer = window.setTimeout(() => {
    resizingByUser = false;
    void rememberSize();
  }, 400);
}

function wireWindowGestures(): void {
  void appWindow.onResized(() => noteManualResize());

  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;

    const resize = target.closest<HTMLElement>("[data-resize]");
    if (resize) {
      event.preventDefault();
      resizingByUser = true;
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

/**
 * A barra de status tem dois lados que crescem em direcoes opostas; numa janela
 * estreita eles se sobrepunham. Aqui a largura vira um atributo no body e o CSS
 * decide o que esconder, da informacao menos importante para a mais.
 */
function watchWidth(): void {
  const apply = (width: number) => {
    const before = el.body.dataset.narrow;
    el.body.dataset.narrow = String(width < 520);
    el.body.dataset.tiny = String(width < 400);
    // O rotulo curto depende da faixa de largura, entao redesenha ao mudar.
    if (before !== el.body.dataset.narrow && editor) updateMetrics(editor.getText());
  };

  apply(window.innerWidth);
  new ResizeObserver((entries) => apply(entries[0].contentRect.width)).observe(document.body);
}

function wireEvents(): void {
  wireWindowGestures();
  watchWidth();

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
  el.chipModules.addEventListener("click", () => toggleModulesMenu());

  el.modules.addEventListener("click", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-module]");
    if (!item) return;
    const key = item.dataset.module as MetricKey;
    settings.statusBar = { ...settings.statusBar, [key]: !settings.statusBar[key] };
    item.dataset.on = String(settings.statusBar[key]);
    updateMetrics(editor.getText());
    void saveSettings(settings);
  });

  // Clique fora fecha o menu, sem engolir o clique que o fechou.
  document.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement;
    if (el.modules.hidden) return;
    if (!el.modules.contains(target) && target !== el.chipModules) toggleModulesMenu(false);
  });
  el.metricOpacity.addEventListener("click", () => toggleIdleFade());

  // Sinais de presenca: qualquer um deles cancela o esmaecimento.
  for (const type of ["mousemove", "mousedown", "keydown", "wheel"] as const) {
    window.addEventListener(type, wakeFromIdle, { passive: true });
  }
  window.addEventListener("focus", wakeFromIdle);

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

  // Atalhos escolhidos pelo usuario, aplicados por cima dos padroes do backend.
  for (const [action, combo] of Object.entries(settings.shortcuts)) {
    if (combo) await rebindGlobalShortcut(action as GlobalAction, combo);
  }

  el.metricOpacity.dataset.idle = String(settings.idleFade);
  scheduleIdleFade();

  wireEvents();
  editor.focus();
}

void boot();
