/**
 * Painel de atalhos (Ctrl+/).
 *
 * Num app sem menus nem barra de titulo, este painel e a unica forma de
 * descobrir o que ele faz. Os atalhos globais vem do backend porque o atalho
 * real depende do que estava livre na maquina do usuario.
 */

import type { EffectsReport, GlobalAction, KeyCombo } from "../core/bridge";
import { t } from "../core/i18n";

interface Row {
  keys: string;
  label: string;
  /** Presente nas acoes globais, que o usuario pode reprogramar. */
  action?: GlobalAction;
}

interface Section {
  title: string;
  rows: Row[];
}

function sections(effects: EffectsReport): Section[] {
  const reason = t("shortcuts.unavailable");

  return [
    {
      title: t("shortcuts.section.global"),
      rows: [
        {
          keys: effects.summonShortcut ?? "—",
          label: effects.summonShortcut
            ? t("shortcuts.summon")
            : t("shortcuts.summon.off", { reason }),
          action: "summon",
        },
        {
          keys: effects.panicShortcut ?? "—",
          label: effects.panicShortcut ? t("shortcuts.panic") : t("shortcuts.panic.off", { reason }),
          action: "panic",
        },
      ],
    },
    {
      title: t("shortcuts.section.text"),
      rows: [
        { keys: "Ctrl+1…5", label: t("shortcuts.newTab") },
        { keys: "Ctrl+T / Ctrl+W", label: t("shortcuts.tabs") },
        { keys: "Ctrl+Shift+Enter", label: t("shortcuts.copyClear") },
        { keys: "Ctrl+Shift+C", label: t("shortcuts.copyAll") },
        { keys: "Ctrl+S", label: t("shortcuts.save") },
        { keys: "Ctrl+Shift+S", label: t("shortcuts.saveAs") },
        { keys: "Ctrl+O", label: t("shortcuts.open") },
        { keys: "Ctrl+Shift+V", label: t("shortcuts.history") },
        { keys: "Ctrl+B / Ctrl+I", label: t("shortcuts.bold") },
        { keys: "Ctrl+F", label: t("shortcuts.find") },
        { keys: "Ctrl+Z / Ctrl+Y", label: t("shortcuts.undo") },
      ],
    },
    {
      title: t("shortcuts.section.editing"),
      rows: [
        { keys: "Alt+↑ / Alt+↓", label: t("shortcuts.moveLine") },
        { keys: "Shift+Alt+↑ / ↓", label: t("shortcuts.copyLine") },
        { keys: "Ctrl+D", label: t("shortcuts.selectNext") },
        { keys: "Alt+Clique", label: t("shortcuts.addCursor") },
        { keys: "Ctrl+Clique", label: t("shortcuts.openLink") },
        { keys: "Tab / Shift+Tab", label: t("shortcuts.indent") },
      ],
    },
    {
      title: t("shortcuts.section.prompter"),
      rows: [
        { keys: "Ctrl+Alt+P", label: t("shortcuts.prompter") },
        { keys: "Espaço", label: t("shortcuts.prompterPause") },
        { keys: "↑ / ↓", label: t("shortcuts.prompterSpeed") },
        { keys: "Ctrl+Alt+N", label: t("shortcuts.notch") },
        { keys: "Ctrl+Alt+F", label: t("shortcuts.stage") },
        { keys: "Ctrl+Alt+Shift+← →", label: t("shortcuts.notchWidth") },
        { keys: "Esc", label: t("shortcuts.prompterExit") },
      ],
    },
    {
      title: t("shortcuts.section.window"),
      rows: [
        { keys: "Ctrl+[ / Ctrl+]", label: t("shortcuts.opacity") },
        { keys: "Ctrl+Shift+[ / ]", label: t("shortcuts.opacityJump") },
        { keys: "Ctrl+= / Ctrl+−", label: t("shortcuts.fontSize") },
        { keys: "Ctrl+,", label: t("shortcuts.settings") },
        { keys: "Ctrl+P", label: t("shortcuts.alwaysOnTop") },
        { keys: "Ctrl+Shift+G", label: t("shortcuts.ghost") },
        { keys: "Ctrl+Shift+H", label: t("shortcuts.stealth") },
        { keys: "Ctrl+Shift+B", label: t("shortcuts.backdrop") },
        { keys: "Ctrl+Alt+1…5", label: t("shortcuts.corners") },
        { keys: "Ctrl+Alt+6…9", label: t("shortcuts.halves") },
        { keys: "Ctrl+Alt+0", label: t("shortcuts.full") },
        { keys: "Ctrl+Alt+Shift+setas", label: t("shortcuts.resize") },
        { keys: "Ctrl+Q", label: t("shortcuts.quit") },
      ],
    },
  ];
}

function renderKeys(keys: string): string {
  // Cada tecla vira um <kbd>; separadores (+, /, …) ficam como texto discreto.
  return keys
    .split(/(\s*\/\s*|\+|…)/)
    .filter((part) => part !== "")
    .map((part) =>
      /^(\s*\/\s*|\+|…)$/.test(part)
        ? `<span class="gp-sheet__sep">${part.trim()}</span>`
        : `<kbd>${part}</kbd>`,
    )
    .join("");
}

/** Rotulo legivel a partir do evento, no mesmo formato que o backend devolve. */
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

export interface ShortcutsPanel {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
}

export function createShortcutsPanel(
  host: HTMLElement,
  getEffects: () => EffectsReport,
  onRebind: (action: GlobalAction, combo: KeyCombo) => Promise<void>,
): ShortcutsPanel {
  let capturing: GlobalAction | null = null;

  const render = () => {
    host.innerHTML = `
      <div class="gp-sheet__card" role="dialog" aria-label="${t("shortcuts.title")}">
        <header class="gp-sheet__header">
          <span>${t("shortcuts.title")}</span>
          <span class="gp-sheet__hint"><button class="gp-sheet__close" data-close aria-label="${t("shortcuts.close")}">✕</button>
          </span>
        </header>
        ${sections(getEffects())
          .map(
            (section) => `
          <section class="gp-sheet__section">
            <h2>${section.title}</h2>
            ${section.rows
              .map((row) => {
                const keys = capturing && capturing === row.action
                  ? `<span class="gp-sheet__capturing">${t("shortcuts.capturing")}</span>`
                  : renderKeys(row.keys);
                const rebind = row.action
                  ? `<button class="gp-sheet__rebind" data-rebind="${row.action}">${t("shortcuts.rebind")}</button>`
                  : "";
                return `<div class="gp-sheet__row"><span class="gp-sheet__keys">${keys}</span><span>${row.label}${rebind}</span></div>`;
              })
              .join("")}
          </section>`,
          )
          .join("")}
      </div>`;
  };

  const panel: ShortcutsPanel = {
    isOpen: () => !host.hidden,
    open() {
      // Renderiza a cada abertura: os atalhos globais podem ter mudado.
      render();
      host.hidden = false;
      // A animação de entrada vale para a abertura, não para cada redesenho.
      host.classList.add("gp-sheet--enter");
      host.addEventListener("animationend", () => host.classList.remove("gp-sheet--enter"), {
        once: true,
      });
    },
    close() {
      if (capturing) stopCapture();
      host.hidden = true;
    },
    toggle() {
      if (panel.isOpen()) panel.close();
      else panel.open();
    },
  };

  const stopCapture = () => {
    capturing = null;
    window.removeEventListener("keydown", onCaptureKey, true);
    render();
  };

  /**
   * Captura na fase de captura e com stopPropagation: durante a gravacao, a
   * tecla pertence ao dialogo e nao pode disparar a acao que ela representa.
   */
  async function onCaptureKey(event: KeyboardEvent): Promise<void> {
    if (MODIFIER_KEYS.has(event.key)) return; // espera a tecla final
    event.preventDefault();
    event.stopPropagation();

    const action = capturing;
    if (!action) return;
    if (event.key === "Escape") {
      stopCapture();
      return;
    }

    const combo: KeyCombo = {
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      code: event.code,
    };
    stopCapture();
    await onRebind(action, combo);
    if (panel.isOpen()) render();
  }

  host.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement;
    const rebind = target.closest<HTMLElement>("[data-rebind]");

    if (rebind) {
      event.preventDefault();
      capturing = rebind.dataset.rebind as GlobalAction;
      window.addEventListener("keydown", onCaptureKey, true);
      render();
      return;
    }

    // Fecha ao clicar fora do cartao ou no botao de fechar.
    if (target === host || target.closest("[data-close]")) {
      if (capturing) stopCapture();
      panel.close();
    }
  });

  return panel;
}
