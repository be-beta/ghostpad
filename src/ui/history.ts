/**
 * Historico local de versoes (Ctrl+Shift+S).
 *
 * O app guarda o texto que foi substituido, no maximo a cada 3 minutos. Este
 * painel existe para o caso em que o "desfazer" nao basta: apagar tudo, colar
 * por cima, fechar uma aba, ou perceber a perda uma hora depois.
 *
 * Lista as versoes de TODAS as anotacoes, com etiqueta de origem. Mostrar so as
 * da aba aberta escondia justamente o que a pessoa procura depois de fechar uma
 * aba. Restaurar sempre traz o texto para a anotacao aberta agora.
 *
 * Restaurar nunca destroi o texto atual sem saida: a troca entra como uma
 * edicao normal do editor, entao `Ctrl+Z` volta atras.
 */

import { listSnapshots, readSnapshot, type SnapshotInfo } from "../core/bridge";

export interface HistoryPanel {
  isOpen(): boolean;
  open(): Promise<void>;
  close(): void;
  toggle(): Promise<void>;
}

/** "14:32" para hoje, "21/09 14:32" para dias anteriores. */
function formatMoment(ms: number): string {
  const date = new Date(ms);
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;

  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${day} ${time}`;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function createHistoryPanel(
  host: HTMLElement,
  describeSlot: (slot: number) => string,
  onRestore: (text: string) => void,
  onError: (message: string) => void,
): HistoryPanel {
  const renderEmpty = () => `
    <div class="gp-sheet__empty">
      Nenhuma versão guardada ainda.<br />
      O GhostPad guarda o texto substituído a cada 3 minutos de edição, e o de
      abas fechadas.
    </div>`;

  const renderList = (items: SnapshotInfo[]) =>
    items
      .map(
        (item) => `
      <button class="gp-history__item" data-snapshot="${item.id}" data-slot="${item.slot}">
        <span class="gp-history__when">${formatMoment(item.savedAtMs)}</span>
        <span class="gp-history__preview">${escapeHtml(item.preview) || "(vazio)"}</span>
        <span class="gp-history__tag">${escapeHtml(describeSlot(item.slot))}</span>
        <span class="gp-history__size">${item.chars.toLocaleString("pt-BR")} car.</span>
      </button>`,
      )
      .join("");

  const render = (items: SnapshotInfo[]) => {
    host.innerHTML = `
      <div class="gp-sheet__card" role="dialog" aria-label="Versões anteriores">
        <header class="gp-sheet__header">
          <span>Versões anteriores</span>
          <span class="gp-sheet__hint"><kbd>Esc</kbd> fecha
            <button class="gp-sheet__close" data-close aria-label="Fechar histórico">✕</button>
          </span>
        </header>
        ${items.length ? renderList(items) : renderEmpty()}
      </div>`;
  };

  const panel: HistoryPanel = {
    isOpen: () => !host.hidden,
    async open() {
      try {
        render(await listSnapshots());
      } catch (error) {
        render([]);
        onError(`Não foi possível ler o histórico: ${error}`);
      }
      host.hidden = false;
    },
    close() {
      host.hidden = true;
    },
    async toggle() {
      if (panel.isOpen()) panel.close();
      else await panel.open();
    },
  };

  host.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement;

    const item = target.closest<HTMLElement>("[data-snapshot]");
    if (item) {
      event.preventDefault();
      const id = item.dataset.snapshot as string;
      const slot = Number(item.dataset.slot);
      void readSnapshot(slot, id)
        .then((text) => {
          onRestore(text);
          panel.close();
        })
        .catch((error) => onError(`Não foi possível restaurar: ${error}`));
      return;
    }

    if (target === host || target.closest("[data-close]")) panel.close();
  });

  return panel;
}
