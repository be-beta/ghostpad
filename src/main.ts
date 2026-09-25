/**
 * Harp — orquestracao da janela principal.
 *
 * Liga janela (bridge), persistencia (store), editor (CodeMirror) e interface.
 * Nenhum desses modulos conhece os outros; so este arquivo os conecta.
 */

import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";

import {
  appWindow,
  closeNote,
  detectRecorders,
  getEffectsReport,
  listDrafts,
  persistWindowState,
  placeTopCenter,
  readTextFile,
  setAlwaysOnTop,
  rememberSize,
  resizeBy,
  setBackdrop,
  setClickThrough,
  setGlobalShortcut,
  snapHalf,
  writeTextFile,
  type Draft,
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
  loadNote,
  loadSettings,
  saveNote,
  saveSettings,
  type Settings,
} from "./core/store";
import {
  applyFont,
  applyFontSize,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type FontId,
} from "./core/fonts";
import { applyStaticTranslations, setLang, t, type Lang } from "./core/i18n";
import { watchForUpdates, type UpdateWatcher } from "./core/updater";
import {
  applyAccent,
  applyTheme,
  effectiveTheme,
  watchSystemTheme,
  type AccentId,
  type Theme,
} from "./core/theme";
import { createEditor, type EditorSession, type GhostEditor } from "./editor/editor";
import { createPrompter, type Prompter } from "./editor/prompter";
import {
  CONTROL_KEYS,
  MODE_KEYS,
  controlLabel,
  enabledCount,
  moduleLabel,
  renderMetrics,
  type ControlKey,
  type MetricKey,
} from "./ui/metrics";
import { createHistoryPanel } from "./ui/history";
import { createSettingsPanel } from "./ui/settings";
import { createDraftsPanel } from "./ui/drafts";
import glifoRascunho from "heroicons/16/solid/pencil-square.svg?raw";
import { createIconPicker, iconLabel } from "./ui/icon-picker";
import { iconSvg } from "./ui/tab-icons";
import type { IconId } from "./ui/icon-catalog";
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
  updateDot: document.getElementById("update-dot") as HTMLSpanElement,
  chipHelp: document.getElementById("chip-help") as HTMLButtonElement,
  metrics: document.getElementById("metrics") as HTMLSpanElement,
  chipModules: document.getElementById("chip-modules") as HTMLButtonElement,
  modules: document.getElementById("modules") as HTMLDivElement,
  drafts: document.getElementById("drafts") as HTMLDivElement,
  chipDrafts: document.getElementById("chip-drafts") as HTMLButtonElement,
  draftsCount: document.getElementById("drafts-count") as HTMLSpanElement,
  iconPicker: document.getElementById("icon-picker") as HTMLDivElement,
  metricOpacity: document.getElementById("metric-opacity") as HTMLSpanElement,
  shortcuts: document.getElementById("shortcuts") as HTMLDivElement,
  settings: document.getElementById("settings") as HTMLDivElement,
  chipSettings: document.getElementById("chip-settings") as HTMLButtonElement,
  fontSize: document.getElementById("fontsize") as HTMLSpanElement,
  barPrompter: document.getElementById("bar-prompter") as HTMLSpanElement,
  barPrompterSpeed: document.getElementById("bar-prompter-speed") as HTMLSpanElement,
  fontSmaller: document.getElementById("font-smaller") as HTMLButtonElement,
  fontBigger: document.getElementById("font-bigger") as HTMLButtonElement,
  fontSizeValue: document.getElementById("font-size-value") as HTMLSpanElement,
  prompter: document.getElementById("prompter") as HTMLDivElement,
  prompterPlay: document.getElementById("prompter-play") as HTMLSpanElement,
  prompterSpeed: document.getElementById("prompter-speed") as HTMLSpanElement,
  history: document.getElementById("history") as HTMLDivElement,
  tabs: document.getElementById("tabs") as HTMLSpanElement,
};

/** Teto de anotacoes abertas. Poucas de proposito: anotar agora, nao arquivar. */
const MAX_NOTES = 10;

let settings: Settings = { ...DEFAULT_SETTINGS };
/** Anotacoes abertas, na ordem das abas. */
let openNotes: number[] = [1];
/** Anotacao aberta. */
let activeNote = 1;
/**
 * Sessao de cada anotacao: texto, cursor e historico de desfazer.
 *
 * Guardar a sessao inteira e o que permite `Ctrl+Z` continuar funcionando
 * depois de ir e voltar de aba. Vale enquanto o app estiver aberto; o texto em
 * si vive no disco.
 */
const sessions = new Map<number, EditorSession>();
/**
 * Arquivo associado a cada espaco.
 *
 * Por espaco, e nao global: a anotacao 2 nao pode salvar por cima do arquivo
 * aberto na anotacao 1.
 */
const fileBySlot = new Map<number, string>();
let ghostMode = false;
let editor: GhostEditor;
let effects: EffectsReport = {
  // Assume o pior ate o backend responder: recursos ficam desabilitados em vez
  // de prometer algo que talvez nao funcione.
  roundedCorners: false,
  captureExclusionAvailable: false,
  panicShortcut: null,
  summonShortcut: null,
  jotShortcut: null,
  vidroShortcut: null,
};

/**
 * Troca um atalho global e guarda a escolha. Se o backend recusar (atalho em uso
 * por outro programa), nada muda e o motivo aparece para o usuario.
 */
async function rebindGlobalShortcut(action: GlobalAction, combo: KeyCombo): Promise<void> {
  try {
    const label = await setGlobalShortcut(action, combo);
    const campo = {
      panic: "panicShortcut",
      summon: "summonShortcut",
      jot: "jotShortcut",
      vidro: "vidroShortcut",
    } as const;
    effects = { ...effects, [campo[action]]: label };
    settings.shortcuts = { ...settings.shortcuts, [action]: combo };
    await saveSettings(settings);
    toast(t("toast.shortcut.set", { label }));
  } catch (error) {
    toast(String(error));
  }
}

const shortcutsPanel = createShortcutsPanel(el.shortcuts, () => effects, rebindGlobalShortcut);

const draftsPanel = createDraftsPanel(el.drafts, {
  shortcut: () => effects.jotShortcut,
  onCopied: () => toast(t("drafts.copied")),
  onError: (message) => toast(message),
  onClose: () => editor.focus(),
});

/**
 * A contagem aparece na barra so quando existe rascunho.
 *
 * Sem rascunhos nao ha o que acessar, e um botao para uma lista vazia seria
 * interface ocupando espaco a toa. `Ctrl+J` continua abrindo a lista, vazia,
 * para quem quiser lembrar como se cria um.
 */
function renderDrafts(drafts: Draft[]): void {
  el.chipDrafts.hidden = drafts.length === 0;
  el.draftsCount.textContent = String(drafts.length);
  draftsPanel.update(drafts);
}

const settingsPanel = createSettingsPanel(el.settings, {
  values: () => ({
    lang: settings.lang,
    font: settings.font,
    fontSize: settings.fontSize,
    idleFade: settings.idleFade,
    theme: settings.theme,
    accent: settings.accent,
    update: {
      current: appVersion,
      available: updates?.pending() ?? null,
      progress: updateProgress,
    },
  }),
  onLang: changeLang,
  onFont: changeFont,
  onFontSize: changeFontSize,
  // Tambem vive aqui porque o atalho dele e clicar na opacidade — e a opacidade
  // pode estar escondida da barra.
  onIdleFade: (value) => {
    if (value !== settings.idleFade) toggleIdleFade();
  },
  onTheme: (theme: Theme) => changeTheme(theme),
  onAccent: (accent: AccentId) => {
    settings.accent = accent;
    applyAccent(accent, settings.theme);
    void saveSettings(settings);
  },
  onUpdate: () => void installUpdate(),
});

/** Os icones mais escolhidos, com o mais recente desempatando. */
function recentIcons(): IconId[] {
  return (Object.entries(settings.iconUsage) as [IconId, { count: number; last: number }][])
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .map(([id]) => id);
}

const iconPicker = createIconPicker(el.iconPicker, {
  textFor: async (slot) => {
    if (slot === activeNote) return editor.getText();
    const sessao = sessions.get(slot);
    return sessao ? sessao.doc.toString() : loadNote(slot).catch(() => "");
  },
  current: (slot) => settings.tabIcons[String(slot)],
  recents: recentIcons,
  onPick: (slot, icon) => {
    if (icon) {
      settings.tabIcons[String(slot)] = icon;
      const uso = settings.iconUsage[icon] ?? { count: 0, last: 0 };
      settings.iconUsage[icon] = { count: uso.count + 1, last: Date.now() };
    } else {
      delete settings.tabIcons[String(slot)];
    }
    void saveSettings(settings);
    renderTabs();
  },
  onClose: () => editor.focus(),
});

/** Aba limpa nao herda o icone da anotacao que ocupava o espaco antes. */
function forgetTabIcon(slot: number): void {
  if (!settings.tabIcons[String(slot)]) return;
  delete settings.tabIcons[String(slot)];
  void saveSettings(settings);
}

/**
 * Como a versao guardada aparece no historico.
 *
 * Mostra a POSICAO atual da aba, nao o numero interno do espaco: as posicoes
 * mudam quando uma aba e fechada, e o numero interno nao diria nada ao usuario.
 */
function describeSlot(slot: number): string {
  const index = openNotes.indexOf(slot);
  return index === -1 ? t("history.tabClosed") : t("history.tab", { n: index + 1 });
}

const historyPanel = createHistoryPanel(
  el.history,
  describeSlot,
  (restored) => {
    // Entra como edicao normal: Ctrl+Z desfaz a restauracao.
    editor.replaceAll(restored);
    void saveNote(activeNote, restored);
    toast(t("toast.version.restored"));
  },
  (message) => toast(message),
);

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
  toast(t(settings.idleFade ? "toast.idle.on" : "toast.idle.off"));
  void saveSettings(settings);
}

function nudgeOpacity(delta: number): void {
  // Arredonda para a grade de 10%: valores salvos fora dela (ex.: 65%) entram
  // no ritmo no primeiro ajuste em vez de ficarem sempre "quebrados".
  applyOpacity(Math.round((settings.opacity + delta) * 10) / 10);
  void saveSettings(settings);
}

// --- Tipografia e idioma ---------------------------------------------------

function renderFontSize(): void {
  el.fontSizeValue.textContent = String(settings.fontSize);
  el.fontSmaller.disabled = settings.fontSize <= FONT_SIZE_MIN;
  el.fontBigger.disabled = settings.fontSize >= FONT_SIZE_MAX;
}

let updates: UpdateWatcher | undefined;
let updateProgress: number | null = null;
let appVersion = "";

/**
 * Mostra que existe versao nova.
 *
 * Um ponto na engrenagem, e nada mais. O que mudou, o botao e o aviso do
 * reinicio ficam dentro das configuracoes: quem esta escrevendo nao precisa
 * decidir nada agora, e nada aqui insiste.
 */
function renderUpdate(): void {
  const nova = updates?.pending();
  el.updateDot.hidden = !nova;
  el.chipSettings.title = nova
    ? t("update.title", { v: nova.version })
    : t("chip.settings.title");
  settingsPanel.refreshUpdate();
}

/** Baixa e instala. O app reinicia sozinho no fim; daqui so volta se falhar. */
async function installUpdate(): Promise<void> {
  if (updateProgress !== null) return;

  updateProgress = 0;
  settingsPanel.refreshUpdate();

  try {
    await updates?.install((fracao) => {
      updateProgress = fracao;
      settingsPanel.refreshUpdate();
    });
  } catch (error) {
    console.error("[harp] falha ao instalar atualizacao", error);
    toast(t("update.failed"));
    updateProgress = null;
    settingsPanel.refreshUpdate();
  }
}

function changeFontSize(size: number): void {
  // Um valor invalido aqui virava "NaNpx" no CSS: o navegador ignora e o texto
  // parece nao responder. Melhor ficar onde esta do que sumir sem explicacao.
  if (!Number.isFinite(size)) {
    toast("Tamanho de texto inválido");
    return;
  }

  settings.fontSize = applyFontSize(size);
  renderFontSize();
  editor?.setTypography(settings.fontSize);
  // A folga do teleprompter depende da altura da linha, que acabou de mudar.
  if (prompter?.state().active) applyReadingPadding(true);
  void saveSettings(settings);
}

function changeFont(font: FontId): void {
  settings.font = font;
  void applyFont(font).then(() => {
    // Mesmo tamanho, tema novo: o que mudou foi a familia, e o editor precisa
    // medir a largura do caractere de novo.
    editor?.setTypography(settings.fontSize);
    if (prompter?.state().active) applyReadingPadding(true);
  });
  void saveSettings(settings);
}

/**
 * Troca o idioma e redesenha tudo que ja estava na tela.
 *
 * Textos criados uma vez (abas, chips, menus abertos) nao mudam sozinhos: sem
 * este redesenho, metade da interface ficaria no idioma anterior ate a proxima
 * abertura.
 */
function changeLang(lang: Lang): void {
  settings.lang = lang;
  setLang(lang);
  applyStaticTranslations();

  el.chipBackdrop.textContent = backdropLabel(settings.backdrop);
  el.chipStealth.title = effects.captureExclusionAvailable
    ? t("chip.stealth.title")
    : t("chip.stealth.unavailable");

  updateMetrics(editor.getText());
  renderTabs();
  renderUpdate();
  if (!el.modules.hidden) renderModulesMenu();
  settingsPanel.refresh();

  void saveSettings(settings);
}

// --- Estados de janela -----------------------------------------------------

async function toggleAlwaysOnTop(force?: boolean): Promise<void> {
  const next = force ?? !settings.alwaysOnTop;
  try {
    await setAlwaysOnTop(next);
    settings.alwaysOnTop = next;
    el.chipOnTop.dataset.active = String(next);
    toast(t(next ? "toast.onTop.on" : "toast.onTop.off"));
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
      ? t("toast.ghost.exitShortcut", { shortcut: effects.panicShortcut })
      : t("toast.ghost.exitTaskbar");
    toast(next ? t("toast.ghost.on", { exit }) : t("toast.ghost.off"));
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
    toast(t(next ? "toast.stealth.on" : "toast.stealth.off"));
    void saveSettings(settings);
  } catch (error) {
    el.chipStealth.dataset.active = "false";
    settings.excludeFromCapture = false;
    toast(t("toast.stealth.failed", { error: String(error) }));
  }
}

// --- Fundo -----------------------------------------------------------------

const BACKDROP_ORDER: Backdrop[] = ["transparent", "blur", "acrylic"];
const backdropLabel = (kind: Backdrop) => t(`backdrop.${kind}` as "backdrop.transparent");

async function applyBackdrop(kind: Backdrop, announce: boolean): Promise<void> {
  try {
    await setBackdrop(kind);
    settings.backdrop = kind;
    el.chipBackdrop.textContent = backdropLabel(kind);
    if (announce) {
      // O aviso do acrylic existe porque o comportamento surpreende: ele some
      // justamente quando o usuario clica no app de baixo.
      toast(
        kind === "acrylic"
          ? t("toast.backdrop.acrylic")
          : t("toast.backdrop.set", { name: backdropLabel(kind) }),
      );
      void saveSettings(settings);
    }
  } catch (error) {
    if (announce) toast(t("toast.backdrop.failed", { error: String(error) }));
    if (kind !== "transparent") await applyBackdrop("transparent", false);
  }
}

function changeTheme(theme: Theme): void {
  settings.theme = theme;
  applyTheme(theme);
  // O tom do destaque depende do tema, entao acompanha a troca.
  applyAccent(settings.accent, theme);
  void saveSettings(settings);
}

/**
 * Ctrl+Shift+B: claro e escuro, sem passar pelas configuracoes.
 *
 * O atalho era do fundo da janela, mas o desfoque nativo nao funciona na maior
 * parte das maquinas, e ciclar entre um fundo que funciona e dois que nao
 * funcionam nao ajudava ninguem. O fundo continua acessivel pela barra.
 *
 * Alterna a partir do tema *visivel*: em "sistema" com o Windows escuro, o
 * atalho vai para o claro, e nao para um escuro explicito que nao muda nada.
 */
function toggleTheme(): void {
  const next = effectiveTheme(settings.theme) === "light" ? "dark" : "light";
  changeTheme(next);
  settingsPanel.refresh();
  toast(t(next === "light" ? "toast.theme.light" : "toast.theme.dark"));
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

  const grupo = (titulo: string) => {
    const header = document.createElement("h3");
    header.className = "gp-menu__group";
    header.textContent = titulo;
    el.modules.append(header);
  };

  const item = (key: string, tipo: "module" | "control", label: string, ligado: boolean) => {
    const button = document.createElement("button");
    button.className = "gp-menu__item";
    button.dataset.on = String(ligado);
    button.dataset[tipo] = key;
    button.innerHTML = `<span class="gp-menu__box"></span>${label}`;
    el.modules.append(button);
  };

  grupo(t("menu.metrics"));
  const keys: MetricKey[] = ["words", "chars", "lines", "tokens", "pages"];
  for (const key of keys) item(key, "module", moduleLabel(key), settings.statusBar[key]);

  grupo(t("menu.controls"));
  for (const key of CONTROL_KEYS) {
    item(key, "control", controlLabel(key), settings.barControls[key]);
  }

  grupo(t("menu.modes"));
  for (const key of MODE_KEYS) {
    item(key, "control", controlLabel(key), settings.barControls[key]);
  }
}

/** Mostra ou esconde os controles da barra conforme a escolha do usuario. */
function applyBarControls(): void {
  const mostrar = settings.barControls;
  el.fontSize.hidden = !mostrar.fontSize;
  el.metricOpacity.hidden = !mostrar.opacity;
  el.chipBackdrop.hidden = !mostrar.backdrop;
  el.chipOnTop.hidden = !mostrar.onTop;
  el.chipGhost.hidden = !mostrar.ghost;
  el.chipStealth.hidden = !mostrar.stealth;
  el.barPrompter.hidden = !mostrar.prompter;
}

/** Reflete o estado do teleprompter nos botões da barra. */
function renderBarPrompter(): void {
  const estado = prompter?.state();
  const botao = el.barPrompter.querySelector<HTMLElement>('[data-bar-prompter="play"]');
  if (botao) botao.textContent = estado?.active && !estado.paused ? "❚❚" : "▶";

  el.barPrompterSpeed.textContent = String(estado?.speed ?? 10);

  const marcar = (acao: string, ligado: boolean) => {
    const node = el.barPrompter.querySelector<HTMLElement>(`[data-bar-prompter="${acao}"]`);
    if (node) node.dataset.on = String(ligado);
  };
  marcar("notch", isNotch());
  marcar("stage", beforeStage !== null);
}

function toggleModulesMenu(open?: boolean): void {
  const next = open ?? el.modules.hidden;
  if (next) renderModulesMenu();
  el.modules.hidden = !next;
}

const persistNote = debounceWithCeiling(
  (slot: number, text: string) => void saveNote(slot, text),
  400,
  2000,
);

function onTextChange(text: string): void {
  updateMetrics(text);
  persistNote(activeNote, text);

  wakeFromIdle();
}

async function copyAll(): Promise<boolean> {
  const text = editor.getText();
  if (!text.trim()) {
    toast(t("toast.copy.empty"));
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    toast(t("toast.copy.failed", { error: String(error) }));
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
  void saveNote(activeNote, "");
  // Texto limpo e uma anotacao nova: salvar depois nao pode sobrescrever o
  // arquivo da anotacao anterior sem avisar.
  fileBySlot.delete(activeNote);
  toast(t("toast.copy.cleared"));
}

// --- Anotacoes e abas ------------------------------------------------------

/**
 * Depois de um tempo sem trocar de aba, as abas viram pontinhos.
 *
 * Elas passam a maior parte do tempo sem uso, e quem esta escrevendo nao precisa
 * ver a lista inteira o tempo todo — basta saber onde esta. O mouse por perto
 * traz tudo de volta, inclusive o botao de nova aba.
 */
const TABS_COLLAPSE_MS = 15_000;

let tabsTimer: number | undefined;

function scheduleTabsCollapse(): void {
  if (tabsTimer) window.clearTimeout(tabsTimer);
  el.body.dataset.tabs = "open";
  tabsTimer = window.setTimeout(() => {
    // Recolher com o seletor de icone aberto deixaria o popover apontando
    // para uma aba que encolheu. Espera ele fechar.
    if (iconPicker.isOpen()) return scheduleTabsCollapse();
    el.body.dataset.tabs = "collapsed";
  }, TABS_COLLAPSE_MS);
}

/** Tecla da aba pela posicao: 1 a 9, e a decima no 0, como nos navegadores. */
function tabDigit(index: number): string {
  return index === 9 ? "0" : String(index + 1);
}

function renderTabs(): void {
  el.tabs.textContent = "";

  for (const [index, slot] of openNotes.entries()) {
    const tab = document.createElement("button");
    tab.className = "gp-tab";
    tab.dataset.note = String(slot);
    tab.dataset.active = String(slot === activeNote);
    tab.title = `${t("history.tab", { n: index + 1 })} (Ctrl+${tabDigit(index)})`;

    // O icone e opcional. Sem ele, o lugar existe mas so aparece na aba ativa
    // ou sob o mouse, como o X — nao vale pedir atencao em todas as abas.
    const icone = settings.tabIcons[String(slot)];
    tab.dataset.hasIcon = String(Boolean(icone));
    const pick = document.createElement("span");
    pick.className = "gp-tab__icon";
    pick.dataset.iconPick = String(slot);
    pick.dataset.empty = String(!icone);
    pick.title = icone ? `${iconLabel(icone)} — ${t("icons.choose")}` : t("icons.choose");
    if (icone) pick.innerHTML = iconSvg(icone);
    tab.append(pick);

    const numero = document.createElement("span");
    numero.className = "gp-tab__num";
    numero.textContent = String(index + 1);
    tab.append(numero);

    const close = document.createElement("span");
    close.className = "gp-tab__close";
    close.dataset.close = String(slot);
    close.textContent = "×";
    close.title = t("shortcuts.tabs");
    tab.append(close);

    el.tabs.append(tab);
  }

  if (openNotes.length < MAX_NOTES) {
    const add = document.createElement("button");
    add.className = "gp-tabs__add";
    add.dataset.add = "true";
    add.textContent = "+";
    add.title = t("shortcuts.tabs");
    el.tabs.append(add);
  }
}

/**
 * Troca de anotacao.
 *
 * Grava o texto atual antes de sair — sem esperar o autosave, que tem folga de
 * ate 2 segundos — e guarda a sessao, para o desfazer daquela anotacao
 * continuar de onde parou quando ela voltar.
 */
async function switchNote(slot: number): Promise<void> {
  if (slot === activeNote || !openNotes.includes(slot)) return;

  try {
    await saveNote(activeNote, editor.getText());
  } catch (error) {
    // Avisa, mas nao prende: ficar preso numa aba por causa de um erro de
    // gravacao seria pior que o erro. A sessao guardada preserva o texto.
    toast(t("toast.note.saveFailed", { error: String(error) }));
  }
  sessions.set(activeNote, editor.captureSession());

  activeNote = slot;
  settings.activeNote = slot;
  void saveSettings(settings);

  await openSession(slot);
  renderTabs();
  scheduleTabsCollapse();
}

/** Poe uma anotacao na tela, com a sessao guardada se houver. */
async function openSession(slot: number): Promise<void> {
  const saved = sessions.get(slot);
  if (saved) {
    editor.restoreSession(saved);
  } else {
    // Sessao nova: historico comeca limpo, sem herdar o de outra anotacao.
    editor.newSession(await loadNote(slot));
  }

  updateMetrics(editor.getText());
  editor.focus();
}

async function newNote(): Promise<void> {
  if (openNotes.length >= MAX_NOTES) {
    toast(t("toast.note.limit", { count: MAX_NOTES }));
    return;
  }

  const free = Array.from({ length: MAX_NOTES }, (_, i) => i + 1).find(
    (slot) => !openNotes.includes(slot),
  );
  if (!free) return;

  // Aba nova comeca sempre limpa. Um espaco reaproveitado podia trazer texto de
  // uma anotacao antiga, o que confundia: o usuario pedia uma aba nova e
  // recebia um texto que nao esperava. O conteudo anterior, se houver, vai para
  // o historico antes de sair.
  await closeNote(free);
  sessions.delete(free);
  fileBySlot.delete(free);
  forgetTabIcon(free);

  openNotes = [...openNotes, free];
  settings.openNotes = openNotes;
  await saveSettings(settings);
  renderTabs();
  await switchNote(free);
}

/**
 * Fecha uma anotacao.
 *
 * O texto vai para o historico daquela anotacao antes de sair, entao fechar por
 * engano tem volta. A ultima aba nao some: ela e esvaziada, porque uma janela
 * sem nenhuma anotacao nao teria onde escrever.
 */
async function closeActiveNote(slot = activeNote): Promise<void> {
  const recovery = t("toast.note.recovery");

  if (openNotes.length === 1) {
    await closeNote(slot);
    sessions.delete(slot);
    forgetTabIcon(slot);
    renderTabs();
    editor.newSession("");
    updateMetrics("");
    fileBySlot.delete(slot);
    toast(t("toast.note.cleared", { recovery }));
    return;
  }

  const index = openNotes.indexOf(slot);
  if (index === -1) return;

  await closeNote(slot);
  sessions.delete(slot);
  fileBySlot.delete(slot);
  forgetTabIcon(slot);

  openNotes = openNotes.filter((item) => item !== slot);
  settings.openNotes = openNotes;
  await saveSettings(settings);

  if (slot === activeNote) {
    // Vizinha da esquerda, ou a primeira: o foco precisa cair em algum lugar.
    // Feito aqui, e nao por `switchNote`, porque a anotacao que sairia de cena
    // ja nao existe mais — nao ha o que gravar nem sessao para guardar.
    activeNote = openNotes[Math.max(0, index - 1)];
    settings.activeNote = activeNote;
    await saveSettings(settings);
    await openSession(activeNote);
  }

  renderTabs();

  toast(t("toast.note.closed", { recovery }));
}

// --- Teleprompter ----------------------------------------------------------

let prompter: Prompter;
/** Geometria de antes do modo faixa, para a janela voltar ao que era. */
let beforeNotch: { x: number; y: number; width: number; height: number } | null = null;

const isNotch = () => beforeNotch !== null;

/**
 * Folga de meia tela acima e abaixo do texto, enquanto o teleprompter roda.
 *
 * Sem ela a primeira linha comeca colada no topo e a ultima nunca chega ao
 * centro — ou seja, o inicio e o fim do roteiro ficavam fora do ponto de
 * leitura, que e justamente onde os olhos estao.
 */
function applyReadingPadding(active: boolean): void {
  const content = editor.content();

  if (!active) {
    content.style.paddingTop = "";
    content.style.paddingBottom = "";
    return;
  }

  const folga = Math.max(0, (editor.scroller().clientHeight - editor.lineHeight()) / 2);
  content.style.paddingTop = `${folga}px`;
  content.style.paddingBottom = `${folga}px`;
}

/**
 * Liga e desliga o teleprompter.
 *
 * Em rolagem o texto fica somente leitura. Isso protege o roteiro de uma tecla
 * acidental durante a gravacao e, de quebra, libera as teclas simples (espaço,
 * setas) para controlar a rolagem sem competir com a digitacao.
 */
function togglePrompter(): void {
  if (prompter.state().active) {
    void exitPrompter();
    return;
  }

  applyReadingPadding(true);
  // Comeca do zero: com a folga aplicada, a primeira linha nasce no centro.
  editor.scroller().scrollTop = 0;

  // Parado: ligar o teleprompter e se preparar para ler. O espaco (ou o botao
  // no canto) da a partida quando a pessoa estiver pronta.
  prompter.start();
  if (!isNotch()) toast(t("toast.prompter.ready"));
}

/**
 * Sai do teleprompter e devolve a janela ao lugar de onde ela veio.
 *
 * A faixa existe PARA o teleprompter, entao sair de um e sair do outro: parar a
 * rolagem e continuar preso numa tira de tres linhas no topo da tela nao ajuda
 * ninguem.
 */
async function exitPrompter(): Promise<void> {
  prompter.stop();
  if (beforeStage) await toggleStage();
  if (isNotch()) await toggleNotch();
}

/** Reage ao motor: somente leitura, linha de foco e aviso de pausa. */
function onPrompterChange(state: { active: boolean; paused: boolean; speed: number }): void {
  el.body.dataset.prompter = String(state.active);
  editor.setEditable(!state.active);

  // Visível também no modo faixa mesmo com a rolagem parada: lá a barra de
  // status some, e sem isto não haveria como sair sem saber o atalho.
  el.prompter.hidden = !state.active && !isNotch();
  renderBarPrompter();
  el.prompterPlay.textContent = state.paused ? "▶" : "❚❚";
  el.prompterSpeed.textContent = String(state.speed);

  if (!state.active) {
    applyReadingPadding(false);
    editor.focus();
  }
}

/**
 * Modo faixa: tres linhas no topo da tela, logo abaixo da webcam.
 *
 * A altura sai da altura real de uma linha do editor, e nao de um numero fixo:
 * quem muda o tamanho da fonte espera que a faixa acompanhe.
 */
/** Geometria e tamanho de texto de antes da tela cheia. */
let beforeStage: { x: number; y: number; width: number; height: number; fontSize: number } | null =
  null;

/**
 * Teleprompter em tela cheia: a janela ocupa a area util e o texto cresce.
 *
 * Serve para quem le de longe, com o monitor inteiro virando teleprompter. O
 * tamanho do texto sobe junto porque uma fonte de leitura de perto fica pequena
 * demais a dois metros de distancia; o valor anterior volta na saida.
 */
async function toggleStage(): Promise<void> {
  if (beforeStage) {
    const { x, y, width, height, fontSize } = beforeStage;
    beforeStage = null;
    el.body.dataset.stage = "false";
    changeFontSize(fontSize);
    await appWindow.setSize(new PhysicalSize(width, height));
    await appWindow.setPosition(new PhysicalPosition(x, y));
    toast(t("toast.stage.off"));
    renderBarPrompter();
    return;
  }

  if (isNotch()) await toggleNotch();

  const position = await appWindow.outerPosition();
  const size = await appWindow.outerSize();
  beforeStage = {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    fontSize: settings.fontSize,
  };

  el.body.dataset.stage = "true";
  await snapHalf("full");
  changeFontSize(Math.min(FONT_SIZE_MAX, Math.round(settings.fontSize * 1.8)));

  if (!prompter.state().active) togglePrompter();
  else applyReadingPadding(true);

  toast(t("toast.stage.on"));
  renderBarPrompter();
}

/** Altura da faixa: tres linhas do editor mais uma folga pequena. */
function notchHeight(): number {
  const lineHeight =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gp-font-size")) *
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gp-line-height"));
  return Math.round(lineHeight * 3 + 20);
}

/**
 * Reaplica a faixa: recentraliza e devolve a altura de tres linhas.
 *
 * Chamado tambem depois de o usuario arrastar a borda, porque nesse caso a
 * janela saia do centro e crescia em altura — perdendo justamente as duas
 * caracteristicas do modo.
 */
async function applyNotch(): Promise<void> {
  await placeTopCenter(settings.notchWidth, notchHeight());
  applyReadingPadding(prompter?.state().active ?? false);
}

async function toggleNotch(): Promise<void> {
  if (beforeNotch) {
    applyReadingPadding(false);
    const { x, y, width, height } = beforeNotch;
    beforeNotch = null;
    el.body.dataset.notch = "false";
    el.prompter.hidden = !prompter?.state().active;
    await appWindow.setSize(new PhysicalSize(width, height));
    await appWindow.setPosition(new PhysicalPosition(x, y));
    applyReadingPadding(prompter?.state().active ?? false);
    toast(t("toast.notch.off"));
    return;
  }

  const position = await appWindow.outerPosition();
  const size = await appWindow.outerSize();
  beforeNotch = { x: position.x, y: position.y, width: size.width, height: size.height };

  el.body.dataset.notch = "true";
  el.prompter.hidden = false;
  await applyNotch();
  toast(t("toast.notch.on"));
}

// --- Arquivos do usuario ---------------------------------------------------

/**
 * Arquivo aberto ou salvo nesta sessao, se houver.
 *
 * O texto continua sendo salvo sozinho no rascunho interno; o arquivo do
 * usuario so muda quando ele manda salvar. Gravar sozinho por cima de um
 * arquivo dele seria assumir uma responsabilidade que ele nao delegou.
 */

/** Sugere um nome a partir da primeira linha com conteudo. */
function suggestedFileName(text: string): string {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return `${t("file.default")}.txt`;

  const clean = firstLine
    .replace(/^#+\s*/, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .slice(0, 40)
    .trim();

  return `${clean || t("file.default")}.txt`;
}

async function saveToFile(forceDialog = false): Promise<void> {
  const text = editor.getText();
  let target = fileBySlot.get(activeNote) ?? null;

  if (!target || forceDialog) {
    target = await saveDialog({
      title: t("dialog.save"),
      defaultPath: suggestedFileName(text),
      // Filtros separados: assim o tipo do arquivo e escolhido na propria
      // janela do Windows, sem mais um passo dentro do app.
      filters: [
        { name: t("dialog.filter.text"), extensions: ["txt"] },
        { name: t("dialog.filter.markdown"), extensions: ["md"] },
        { name: t("dialog.filter.all"), extensions: ["*"] },
      ],
    });
    if (!target) return; // cancelado
  }

  try {
    await writeTextFile(target, text);
    fileBySlot.set(activeNote, target);
    toast(t("toast.file.saved", { file: String(target.split(/[\\/]/).pop()) }));
  } catch (error) {
    toast(String(error));
  }
}

async function openFromFile(): Promise<void> {
  const chosen = await openDialog({
    title: t("dialog.open"),
    multiple: false,
    filters: [
      { name: t("dialog.filter.textMarkdown"), extensions: ["txt", "md"] },
      { name: t("dialog.filter.all"), extensions: ["*"] },
    ],
  });
  if (typeof chosen !== "string") return;

  try {
    const content = await readTextFile(chosen);
    // Troca como edicao normal: Ctrl+Z traz de volta o texto que estava aberto.
    editor.replaceAll(content);
    void saveNote(activeNote, content);
    fileBySlot.set(activeNote, chosen);
    toast(t("toast.file.opened", { file: String(chosen.split(/[\\/]/).pop()) }));
  } catch (error) {
    toast(String(error));
  }
}

// --- Aviso de gravacao -----------------------------------------------------

const RECORDER_POLL_MS = 25_000;
/** Ja avisado nesta sessao; o alerta nao pode virar insistencia. */
const warnedRecorders = new Set<string>();

/**
 * Avisa quando um gravador esta aberto e o Harp ainda apareceria no video.
 *
 * Nunca liga o modo oculto sozinho: sumir da tela sem o usuario pedir seria
 * pior que o problema. Um aviso por programa por sessao.
 */
async function checkRecorders(): Promise<void> {
  if (settings.excludeFromCapture) return;

  try {
    const running = await detectRecorders();
    const novos = running.map((r) => r.label).filter((label) => !warnedRecorders.has(label));
    if (!novos.length) return;

    for (const label of novos) warnedRecorders.add(label);
    toast(t("toast.recorder", { apps: novos.join(" + "), shortcut: "Ctrl+Shift+H" }));
  } catch {
    // Deteccao e conveniencia: falhar aqui nao pode atrapalhar a escrita.
  }
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
  if (event.key === "Escape" && settingsPanel.isOpen()) {
    settingsPanel.close();
    editor.focus();
    return consume(event);
  }

  if (event.key === "Escape" && historyPanel.isOpen()) {
    historyPanel.close();
    editor.focus();
    return consume(event);
  }

  if (event.key === "Escape" && !el.modules.hidden) {
    toggleModulesMenu(false);
    editor.focus();
    return consume(event);
  }

  if (event.key === "Escape" && draftsPanel.isOpen()) {
    draftsPanel.close();
    return consume(event);
  }

  if (event.key === "Escape" && shortcutsPanel.isOpen()) {
    shortcutsPanel.close();
    editor.focus();
    return consume(event);
  }

  // Teclas simples valem enquanto o teleprompter rola: o texto esta somente
  // leitura, entao elas nao competem com a digitacao.
  if (prompter?.state().active && !event.ctrlKey && !event.altKey) {
    switch (event.key) {
      // Sem avisos no centro: o indicador do canto ja mostra o estado, e
      // durante a leitura o meio da tela pertence ao texto.
      case " ":
        prompter.togglePause();
        return consume(event);
      case "ArrowUp":
        prompter.nudgeSpeed(1);
        return consume(event);
      case "ArrowDown":
        prompter.nudgeSpeed(-1);
        return consume(event);
      case "Escape":
        void exitPrompter();
        return consume(event);
    }
  }

  const ctrl = event.ctrlKey || event.metaKey;
  if (!ctrl) return false;

  if (event.key === ",") {
    settingsPanel.toggle();
    if (!settingsPanel.isOpen()) editor.focus();
    return consume(event);
  }

  // Ctrl+= e Ctrl+−, a convenção de zoom. Antes era Ctrl+Alt, mas no Windows
  // Ctrl+Alt equivale a AltGr, que em teclados ABNT2 produz outro caractere: a
  // tecla chegava aqui como "§". `event.code` é a posição física, que não muda
  // com o layout.
  if (!event.altKey) {
    const maior = event.code === "Equal" || event.code === "NumpadAdd";
    const menor = event.code === "Minus" || event.code === "NumpadSubtract";
    if (maior || menor) {
      changeFontSize(settings.fontSize + (maior ? 1 : -1));
      return consume(event);
    }
  }

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

  if (event.altKey && !event.shiftKey) {
    if (event.key === "p" || event.key === "P") {
      togglePrompter();
      return consume(event);
    }
    if (event.key === "n" || event.key === "N") {
      void toggleNotch().then(renderBarPrompter);
      return consume(event);
    }
    if (event.key === "f" || event.key === "F") {
      void toggleStage();
      return consume(event);
    }
  }

  // Ctrl+Alt+Shift+setas redimensiona. Evita Ctrl+Alt+setas, que em maquinas com
  // grafico Intel gira a tela inteira.
  if (event.altKey && event.shiftKey && RESIZE_BY_ARROW[event.key]) {
    const [dw, dh] = RESIZE_BY_ARROW[event.key];

    // Na faixa, so a largura muda: a altura e sempre tres linhas, e a janela
    // precisa continuar centralizada na tela.
    if (isNotch()) {
      if (dw !== 0) {
        settings.notchWidth = Math.min(1400, Math.max(260, settings.notchWidth + dw));
        void saveSettings(settings);
        void applyNotch();
      }
      return consume(event);
    }

    void resizeBy(dw, dh);
    return consume(event);
  }

  // Ctrl+digito troca de aba pela posicao dela, com o 0 valendo a decima; com
  // Alt, o mesmo digito move a janela. `event.code` e a posicao fisica: com
  // Shift ou em outro layout, `event.key` pode nao ser o digito.
  const digito = /^Digit(\d)$/.exec(event.code)?.[1];
  if (!event.altKey && !event.shiftKey && digito !== undefined) {
    const slot = openNotes[digito === "0" ? 9 : Number(digito) - 1];
    if (slot) void switchNote(slot);
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
        void copyAll().then((ok) => ok && toast(t("toast.copy.done")));
        return consume(event);
      case "s":
        if (!event.repeat) void saveToFile(true);
        return consume(event);
      case "v":
        void historyPanel.toggle();
        return consume(event);
      case "g":
        void toggleGhost();
        return consume(event);
      case "h":
        void toggleStealth();
        return consume(event);
      case "b":
        toggleTheme();
        return consume(event);
    }
    return false;
  }

  switch (key) {
    case "j":
      draftsPanel.toggle();
      return consume(event);
    case "p":
      void toggleAlwaysOnTop();
      return consume(event);
    case "s":
      if (!event.repeat) void saveToFile();
      return consume(event);
    case "o":
      if (!event.repeat) void openFromFile();
      return consume(event);
    case "t":
      if (!event.repeat) void newNote();
      return consume(event);
    case "w":
      if (!event.repeat) void closeActiveNote();
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
    await Promise.all([
      saveNote(activeNote, editor.getText()),
      saveSettings(settings),
      persistWindowState(),
    ]);
  } catch (error) {
    console.error("[harp] falha ao salvar antes de fechar", error);
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
  resizeSettleTimer = window.setTimeout(async () => {
    resizingByUser = false;

    // Arrastar a borda dentro da faixa vira ajuste de largura: a janela volta
    // ao centro e a altura volta a ser de tres linhas.
    if (isNotch()) {
      const size = await appWindow.outerSize();
      const scale = await appWindow.scaleFactor();
      settings.notchWidth = Math.round(size.width / scale);
      void saveSettings(settings);
      void applyNotch();
      return;
    }

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

    // A folga de leitura e metade da altura visivel: muda com a janela.
    if (editor && prompter?.state().active) applyReadingPadding(true);
  };

  apply(window.innerWidth);
  new ResizeObserver((entries) => apply(entries[0].contentRect.width)).observe(document.body);
}

function wireEvents(): void {
  wireWindowGestures();

  // Um erro solto deixava a interface parada sem dizer por que — o usuario
  // clicava e "nada acontecia". Agora ele aparece e pode ser relatado.
  window.addEventListener("error", (event) => {
    toast(`Erro: ${event.message}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    toast(`Erro: ${String(event.reason)}`);
  });
  watchWidth();

  // Controles aparecem so quando o mouse chega perto do canto superior direito.
  document.addEventListener("mousemove", (event) => {
    const nearTop = event.clientY < 56;
    const nearRight = event.clientX > window.innerWidth - 150;
    el.controls.dataset.visible = String(nearTop && nearRight);

    // O indicador do teleprompter ja esta no canto; perto dele, ele se destaca
    // e mostra os controles extras.
    const nearCorner =
      event.clientY > window.innerHeight - 70 && event.clientX > window.innerWidth - 220;
    el.prompter.dataset.visible = String(prompter?.state().active === true && nearCorner);
  });

  el.prompter.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-prompter]")?.dataset
      .prompter;

    if (action === "pause") prompter.togglePause();
    else if (action === "faster") prompter.nudgeSpeed(1);
    else if (action === "slower") prompter.nudgeSpeed(-1);
    else if (action === "exit") void exitPrompter();
  });
  document.addEventListener("mouseleave", () => {
    el.controls.dataset.visible = "false";
    el.prompter.dataset.visible = "false";
  });

  el.btnMinimize.addEventListener("click", () => void appWindow.minimize());
  el.btnClose.addEventListener("click", () => void closeApp());
  el.chipOnTop.addEventListener("click", () => void toggleAlwaysOnTop());
  el.chipGhost.addEventListener("click", () => void toggleGhost());
  el.chipStealth.addEventListener("click", () => void toggleStealth());
  el.chipBackdrop.addEventListener("click", () => cycleBackdrop());
  el.chipDrafts.addEventListener("click", () => draftsPanel.toggle());

  // Os rascunhos moram no Rust; a janela so mostra. Chega aqui a cada mudanca,
  // inclusive as feitas pela janela de rascunho.
  void listen<Draft[]>("harp://drafts", (event) => renderDrafts(event.payload));

  // A janela do Vidro ja sumiu quando a captura falha; quem avisa e esta.
  void listen<string>("harp://vidro-failed", (event) =>
    toast(t("toast.vidro.failed", { error: event.payload })),
  );
  el.chipHelp.addEventListener("click", () => shortcutsPanel.toggle());
  el.chipSettings.addEventListener("click", () => settingsPanel.toggle());
  el.fontSmaller.addEventListener("click", () => changeFontSize(settings.fontSize - 1));
  el.fontBigger.addEventListener("click", () => changeFontSize(settings.fontSize + 1));

  el.barPrompter.addEventListener("click", (event) => {
    const acao = (event.target as HTMLElement).closest<HTMLElement>("[data-bar-prompter]")?.dataset
      .barPrompter;
    if (!acao) return;

    // O play liga o teleprompter se ele estiver desligado: quem clica em play
    // quer ler, nao descobrir que precisava ligar o modo antes.
    if (acao === "play") {
      if (!prompter.state().active) togglePrompter();
      else prompter.togglePause();
    } else if (acao === "faster") {
      prompter.nudgeSpeed(1);
    } else if (acao === "slower") {
      prompter.nudgeSpeed(-1);
    } else if (acao === "notch") {
      void toggleNotch().then(renderBarPrompter);
    } else if (acao === "stage") {
      void toggleStage();
    }

    renderBarPrompter();
  });
  el.chipModules.addEventListener("click", () => toggleModulesMenu());

  el.modules.addEventListener("click", (event) => {
    const alvo = (event.target as HTMLElement).closest<HTMLElement>("[data-module], [data-control]");
    if (!alvo) return;

    const metrica = alvo.dataset.module as MetricKey | undefined;
    if (metrica) {
      settings.statusBar = { ...settings.statusBar, [metrica]: !settings.statusBar[metrica] };
      alvo.dataset.on = String(settings.statusBar[metrica]);
      updateMetrics(editor.getText());
    }

    const controle = alvo.dataset.control as ControlKey | undefined;
    if (controle) {
      settings.barControls = {
        ...settings.barControls,
        [controle]: !settings.barControls[controle],
      };
      alvo.dataset.on = String(settings.barControls[controle]);
      applyBarControls();
    }

    void saveSettings(settings);
  });

  // Clique fora fecha o menu, sem engolir o clique que o fechou.
  document.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement;
    if (el.modules.hidden) return;
    if (!el.modules.contains(target) && target !== el.chipModules) toggleModulesMenu(false);
  });
  el.metricOpacity.addEventListener("click", () => toggleIdleFade());

  // O mouse por perto abre as abas; sair recomeca a contagem.
  el.tabs.addEventListener("mouseenter", scheduleTabsCollapse);
  el.tabs.addEventListener("mouseleave", scheduleTabsCollapse);

  el.tabs.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const close = target.closest<HTMLElement>("[data-close]");
    if (close) {
      event.stopPropagation();
      void closeActiveNote(Number(close.dataset.close));
      return;
    }

    // O icone abre o seletor daquela aba sem trocar para ela: escolher o icone
    // de outra aba nao precisa tirar a pessoa do texto em que esta.
    const pick = target.closest<HTMLElement>("[data-icon-pick]");
    if (pick) {
      event.stopPropagation();
      const slot = Number(pick.dataset.iconPick);
      if (iconPicker.isOpenFor(slot)) iconPicker.close();
      else void iconPicker.open(pick, slot);
      // Com o seletor aberto, as abas nao podem se recolher debaixo dele.
      scheduleTabsCollapse();
      return;
    }

    if (target.closest("[data-add]")) {
      void newNote();
      return;
    }

    const tab = target.closest<HTMLElement>("[data-note]");
    if (tab) void switchNote(Number(tab.dataset.note));
  });

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

  // Gravadores sao verificados periodicamente e ao voltar o foco, que e quando
  // o usuario provavelmente acabou de abrir o OBS ou entrar numa chamada.
  window.setInterval(() => void checkRecorders(), RECORDER_POLL_MS);
  window.addEventListener("focus", () => void checkRecorders());

  // Invocacao global: a janela ja veio para frente no Rust; aqui so o cursor.
  void listen("harp://summoned", () => {
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
    el.chipStealth.title = t("chip.stealth.unavailable");
  }

  await initStores();
  settings = await loadSettings();

  // Idioma e tipografia antes de qualquer desenho: assim nada aparece no idioma
  // errado nem com a fonte errada, nem por um instante.
  setLang(settings.lang);
  applyStaticTranslations();
  applyTheme(settings.theme);
  applyAccent(settings.accent, settings.theme);
  // No modo "sistema", o Windows pode trocar de claro para escuro a qualquer
  // hora; o tom do destaque precisa trocar junto.
  watchSystemTheme(() => {
    applyAccent(settings.accent, settings.theme);
    settingsPanel.refresh();
  });
  await applyFont(settings.font);
  settings.fontSize = applyFontSize(settings.fontSize);
  renderFontSize();

  applyOpacity(settings.opacity);
  revealOnLaunch();
  await applyBackdrop(settings.backdrop, false);

  openNotes = settings.openNotes.filter((slot) => slot >= 1 && slot <= MAX_NOTES);
  if (!openNotes.length) openNotes = [1];
  activeNote = openNotes.includes(settings.activeNote) ? settings.activeNote : openNotes[0];

  const initialText = await loadNote(activeNote);
  editor = createEditor({
    parent: el.editorHost,
    initialText,
    fontSize: settings.fontSize,
    onChange: onTextChange,
    onAppKeydown: handleKeydown,
  });
  updateMetrics(initialText);
  renderTabs();
  scheduleTabsCollapse();

  prompter = createPrompter({
    scroller: () => editor.scroller(),
    onChange: onPrompterChange,
    onEnd: () => {
      // O fim do roteiro e a unica hora em que vale interromper a leitura.
      toast(t("toast.prompter.end"));
    },
  });

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
      toast(t("toast.stealth.notRestored"));
    }
  }

  // Atalhos escolhidos pelo usuario, aplicados por cima dos padroes do backend.
  for (const [action, combo] of Object.entries(settings.shortcuts)) {
    if (combo) await rebindGlobalShortcut(action as GlobalAction, combo);
  }

  el.metricOpacity.dataset.idle = String(settings.idleFade);
  applyBarControls();
  renderBarPrompter();
  scheduleIdleFade();

  wireEvents();
  void checkRecorders();
  appVersion = await getVersion().catch(() => "");
  // Ao recarregar a janela, os rascunhos continuam no processo.
  document.getElementById("drafts-glyph")!.innerHTML = glifoRascunho;
  renderDrafts(await listDrafts().catch(() => []));
  updates = watchForUpdates(renderUpdate);
  editor.focus();
}

/**
 * Uma falha aqui deixaria a janela em branco, sem nenhuma explicacao — o oposto
 * do que o app promete. Falhar visivelmente permite copiar o erro e seguir.
 */
void boot().catch((error) => {
  console.error("[harp] falha ao iniciar", error);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="gp-boot-error">Harp não conseguiu iniciar.<br /><code>${String(error)}</code></div>`,
  );
});
