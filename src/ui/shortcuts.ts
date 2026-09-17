/**
 * Painel de atalhos (Ctrl+/).
 *
 * Num app sem menus nem barra de titulo, este painel e a unica forma de
 * descobrir o que ele faz. Os atalhos globais vem do backend porque o atalho
 * real depende do que estava livre na maquina do usuario.
 */

import type { EffectsReport } from "../core/bridge";

interface Row {
  keys: string;
  label: string;
}

interface Section {
  title: string;
  rows: Row[];
}

function sections(effects: EffectsReport): Section[] {
  const unavailable = "indisponível — atalho em uso por outro app";

  return [
    {
      title: "De qualquer lugar",
      rows: [
        { keys: effects.summonShortcut ?? "—", label: effects.summonShortcut ? "Chamar ou esconder o GhostPad" : `Chamar o GhostPad (${unavailable})` },
        { keys: effects.panicShortcut ?? "—", label: effects.panicShortcut ? "Resgate: desfaz fantasma e oculto, traz a janela" : `Resgate (${unavailable})` },
      ],
    },
    {
      title: "Texto",
      rows: [
        { keys: "Ctrl+Shift+Enter", label: "Copiar tudo e limpar" },
        { keys: "Ctrl+Shift+C", label: "Copiar tudo" },
        { keys: "Ctrl+B / Ctrl+I", label: "Negrito / itálico" },
        { keys: "Ctrl+F", label: "Buscar e substituir" },
        { keys: "Ctrl+Z / Ctrl+Y", label: "Desfazer / refazer" },
      ],
    },
    {
      title: "Edição",
      rows: [
        { keys: "Alt+↑ / Alt+↓", label: "Mover linha" },
        { keys: "Shift+Alt+↑ / ↓", label: "Duplicar linha" },
        { keys: "Ctrl+D", label: "Selecionar próxima ocorrência" },
        { keys: "Alt+Clique", label: "Adicionar cursor" },
        { keys: "Tab / Shift+Tab", label: "Indentar / recuar" },
      ],
    },
    {
      title: "Janela",
      rows: [
        { keys: "Ctrl+[ / Ctrl+]", label: "Opacidade" },
        { keys: "Ctrl+P", label: "Sempre visível" },
        { keys: "Ctrl+Shift+G", label: "Modo fantasma (o mouse atravessa)" },
        { keys: "Ctrl+Shift+H", label: "Ocultar de gravações" },
        { keys: "Ctrl+Shift+B", label: "Fundo da janela" },
        { keys: "Ctrl+Alt+1…5", label: "Encaixar nos cantos" },
        { keys: "Ctrl+Q", label: "Fechar" },
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

export interface ShortcutsPanel {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
}

export function createShortcutsPanel(host: HTMLElement, getEffects: () => EffectsReport): ShortcutsPanel {
  const render = () => {
    host.innerHTML = `
      <div class="gp-sheet__card" role="dialog" aria-label="Atalhos do GhostPad">
        <header class="gp-sheet__header">
          <span>Atalhos</span>
          <span class="gp-sheet__hint"><kbd>Esc</kbd> fecha</span>
        </header>
        ${sections(getEffects())
          .map(
            (section) => `
          <section class="gp-sheet__section">
            <h2>${section.title}</h2>
            ${section.rows
              .map((row) => `<div class="gp-sheet__row"><span class="gp-sheet__keys">${renderKeys(row.keys)}</span><span>${row.label}</span></div>`)
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
    },
    close() {
      host.hidden = true;
    },
    toggle() {
      if (panel.isOpen()) panel.close();
      else panel.open();
    },
  };

  // Clicar fora do cartao fecha.
  host.addEventListener("mousedown", (event) => {
    if (event.target === host) panel.close();
  });

  return panel;
}
