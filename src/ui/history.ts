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
import { t } from "../core/i18n";

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

  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;

  const day = date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });
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
      ${t("history.empty")}<br />
      ${t("history.emptyHint")}
    </div>`;

  const renderList = (items: SnapshotInfo[]) =>
    items
      .map(
        (item) => `
      <button class="gp-history__item" data-snapshot="${item.id}" data-slot="${item.slot}">
        <span class="gp-history__when">${formatMoment(item.savedAtMs)}</span>
        <span class="gp-history__preview">${escapeHtml(item.preview) || t("history.emptyPreview")}</span>
        <span class="gp-history__tag">${escapeHtml(describeSlot(item.slot))}</span>
        <span class="gp-history__size">${t("history.chars", { n: item.chars.toLocaleString() })}</span>
      </button>`,
      )
      .join("");

  const render = (items: SnapshotInfo[]) => {
    host.innerHTML = `
      <div class="gp-sheet__card" role="dialog" aria-label="${t("history.title")}">
        <header class="gp-sheet__header">
          <span>${t("history.title")}</span>
          <span class="gp-sheet__hint"><button class="gp-sheet__close" data-close aria-label="${t("history.close")}">✕</button>
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
        onError(t("history.readFailed", { error: String(error) }));
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
        .catch((error) => onError(t("history.restoreFailed", { error: String(error) })));
      return;
    }

    if (target === host || target.closest("[data-close]")) panel.close();
  });

  return panel;
}
