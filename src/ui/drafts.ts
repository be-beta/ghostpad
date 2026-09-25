/**
 * Rascunhos recentes (Ctrl+J), dentro da janela principal.
 *
 * O outro lado do Win+J: onde se recupera o que foi escrito as pressas. E uma
 * lista curta e nada mais — copiar, excluir, limpar. Sem busca, titulo ou
 * organizacao: rascunho que precisa disso ja virou anotacao, e anotacao tem
 * aba.
 */

import { clearDrafts, copyDraft, deleteDraft, type Draft } from "../core/bridge";
import { t } from "../core/i18n";

export interface DraftsPanel {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Lista nova vinda do Rust. Redesenha so se o painel estiver aberto. */
  update(drafts: Draft[]): void;
}

export interface DraftsHandlers {
  /** Atalho global dos rascunhos, para ensinar no estado vazio. */
  shortcut: () => string | null;
  onCopied: () => void;
  onError: (message: string) => void;
  onClose: () => void;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hora(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Primeira linha com texto: e ela que a pessoa reconhece. */
function previa(text: string): string {
  return text.split("\n").find((linha) => linha.trim() !== "")?.trim() ?? "";
}

export function createDraftsPanel(host: HTMLElement, handlers: DraftsHandlers): DraftsPanel {
  let atual: Draft[] = [];

  const render = () => {
    const lista = atual
      .map(
        (draft) => `
        <div class="gp-drafts__item">
          <span class="gp-drafts__when">${hora(draft.at)}</span>
          <span class="gp-drafts__preview" title="${escapeHtml(draft.text)}">${escapeHtml(previa(draft.text))}</span>
          <button class="gp-drafts__copy" data-copy="${draft.id}">${t("drafts.copy")}</button>
          <button class="gp-drafts__delete" data-delete="${draft.id}" aria-label="${t("drafts.delete")}" title="${t("drafts.delete")}">✕</button>
        </div>`,
      )
      .join("");

    const vazio = `
      <div class="gp-sheet__empty">
        ${t("drafts.empty")}<br />
        ${t("drafts.emptyHint", { shortcut: handlers.shortcut() ?? "—" })}
      </div>`;

    host.innerHTML = `
      <div class="gp-sheet__card" role="dialog" aria-label="${t("drafts.title")}">
        <header class="gp-sheet__header">
          <span>${t("drafts.title")}</span>
          <span class="gp-sheet__hint">
            ${atual.length ? `<button class="gp-drafts__clear" data-clear>${t("drafts.clear")}</button>` : ""}
            <button class="gp-sheet__close" data-close aria-label="${t("drafts.close")}">✕</button>
          </span>
        </header>
        ${atual.length ? `<div class="gp-drafts">${lista}</div>` : vazio}
        <p class="gp-sheet__note gp-sheet__note--faint">${t("drafts.note")}</p>
      </div>`;
  };

  const panel: DraftsPanel = {
    isOpen: () => !host.hidden,
    open() {
      render();
      host.hidden = false;
      host.classList.add("gp-sheet--enter");
      host.addEventListener("animationend", () => host.classList.remove("gp-sheet--enter"), {
        once: true,
      });
    },
    close() {
      if (host.hidden) return;
      host.hidden = true;
      handlers.onClose();
    },
    toggle() {
      if (panel.isOpen()) panel.close();
      else panel.open();
    },
    update(drafts) {
      atual = drafts;
      if (panel.isOpen()) render();
    },
  };

  host.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const copiar = target.closest<HTMLElement>("[data-copy]")?.dataset.copy;
    if (copiar) {
      void copyDraft(Number(copiar))
        .then(handlers.onCopied)
        .catch((error) => handlers.onError(String(error)));
      return;
    }

    const excluir = target.closest<HTMLElement>("[data-delete]")?.dataset.delete;
    if (excluir) {
      void deleteDraft(Number(excluir));
      return;
    }

    if (target.closest("[data-clear]")) {
      void clearDrafts();
      return;
    }

    if (target === host || target.closest("[data-close]")) panel.close();
  });

  return panel;
}
