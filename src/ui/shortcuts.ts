/**
 * Painel de atalhos (Ctrl+/).
 *
 * Num app sem menus nem barra de titulo, este painel e a unica forma de
 * descobrir o que ele faz. Os atalhos globais vem do backend porque o atalho
 * real depende do que estava livre na maquina do usuario.
 */

import type { EffectsReport, GlobalAction, KeyCombo } from "../core/bridge";

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
  const unavailable = "indisponível — atalho em uso por outro app";

  return [
    {
      title: "De qualquer lugar",
      rows: [
        {
          keys: effects.summonShortcut ?? "—",
          label: effects.summonShortcut ? "Chamar ou esconder o GhostPad" : `Chamar o GhostPad (${unavailable})`,
          action: "summon",
        },
        {
          keys: effects.panicShortcut ?? "—",
          label: effects.panicShortcut ? "Resgate: desfaz fantasma e oculto, traz a janela" : `Resgate (${unavailable})`,
          action: "panic",
        },
      ],
    },
    {
      title: "Texto",
      rows: [
        { keys: "Ctrl+1…5", label: "Trocar de anotação" },
        { keys: "Ctrl+Shift+Enter", label: "Copiar tudo e limpar" },
        { keys: "Ctrl+Shift+C", label: "Copiar tudo" },
        { keys: "Ctrl+S", label: "Salvar no arquivo atual" },
        { keys: "Ctrl+Shift+S", label: "Salvar como…" },
        { keys: "Ctrl+O", label: "Abrir arquivo de texto" },
        { keys: "Ctrl+Shift+V", label: "Versões anteriores do texto" },
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
      title: "Teleprompter",
      rows: [
        { keys: "Ctrl+Alt+P", label: "Ligar e desligar o teleprompter" },
        { keys: "Espaço", label: "Pausar e continuar (durante a rolagem)" },
        { keys: "↑ / ↓", label: "Velocidade (durante a rolagem)" },
        { keys: "Ctrl+Alt+N", label: "Modo faixa: três linhas no topo da tela" },
        { keys: "Ctrl+Alt+Shift+← →", label: "Largura da faixa" },
        { keys: "Esc", label: "Sair do teleprompter" },
      ],
    },
    {
      title: "Janela",
      rows: [
        { keys: "Ctrl+[ / Ctrl+]", label: "Opacidade, de 10 em 10%" },
        { keys: "Ctrl+Shift+[ / ]", label: "Opacidade em saltos de 50%" },
        { keys: "Ctrl+P", label: "Sempre visível" },
        { keys: "Ctrl+Shift+G", label: "Modo fantasma (o mouse atravessa)" },
        { keys: "Ctrl+Shift+H", label: "Ocultar de gravações" },
        { keys: "Ctrl+Shift+B", label: "Fundo da janela" },
        { keys: "Ctrl+Alt+1…5", label: "Encaixar nos cantos" },
        { keys: "Ctrl+Alt+6…9", label: "Ocupar metade da tela" },
        { keys: "Ctrl+Alt+0", label: "Ocupar a tela toda" },
        { keys: "Ctrl+Alt+Shift+setas", label: "Redimensionar" },
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
      <div class="gp-sheet__card" role="dialog" aria-label="Atalhos do GhostPad">
        <header class="gp-sheet__header">
          <span>Atalhos</span>
          <span class="gp-sheet__hint"><kbd>Esc</kbd> fecha
            <button class="gp-sheet__close" data-close aria-label="Fechar atalhos">✕</button>
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
                  ? `<span class="gp-sheet__capturing">Pressione a combinação…</span>`
                  : renderKeys(row.keys);
                const rebind = row.action
                  ? `<button class="gp-sheet__rebind" data-rebind="${row.action}">alterar</button>`
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
