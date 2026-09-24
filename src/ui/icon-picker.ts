/**
 * Seletor de icone de uma aba.
 *
 * Um popover preso a aba, e nao um modal: escolher um icone e um gesto de meio
 * segundo, e um modal transformaria isso numa tarefa. Tres grupos, do mais
 * provavel para o mais completo — sugeridos pelo texto, os que a pessoa mais
 * usa, e os 25.
 */

import { t } from "../core/i18n";
import { ICON_IDS, type IconId } from "./icon-catalog";
import { suggestIcons } from "./icon-suggest";
import { iconSvg } from "./tab-icons";

export interface IconPickerHandlers {
  /** Texto da aba, para as sugestoes. So e pedido quando o seletor abre. */
  textFor: (slot: number) => Promise<string>;
  current: (slot: number) => IconId | undefined;
  /** Os mais usados, do mais para o menos. */
  recents: () => IconId[];
  /** `null` remove o icone. */
  onPick: (slot: number, icon: IconId | null) => void;
  /** Chamado ao fechar, para o foco voltar ao texto. */
  onClose: () => void;
}

export interface IconPicker {
  open(anchor: HTMLElement, slot: number): Promise<void>;
  close(): void;
  isOpen(): boolean;
  /** Aberto para esta aba: clicar de novo no icone dela fecha. */
  isOpenFor(slot: number): boolean;
}

export function iconLabel(id: IconId): string {
  return t(`icon.${id}` as "icon.image");
}

export function createIconPicker(host: HTMLElement, handlers: IconPickerHandlers): IconPicker {
  let slot = 0;

  const botao = (id: IconId, atual: IconId | undefined) =>
    `<button class="gp-picker__icon" data-pick="${id}" data-on="${id === atual}"
       title="${iconLabel(id)}" aria-label="${iconLabel(id)}">${iconSvg(id)}</button>`;

  const grupo = (titulo: string, ids: IconId[], atual: IconId | undefined) =>
    ids.length === 0
      ? ""
      : `<div class="gp-picker__group">
           <span class="gp-picker__title">${titulo}</span>
           <div class="gp-picker__row">${ids.map((id) => botao(id, atual)).join("")}</div>
         </div>`;

  const posicionar = (anchor: HTMLElement) => {
    const alvo = anchor.getBoundingClientRect();
    const caixa = host.getBoundingClientRect();
    // Abaixo da aba, sem sair da janela: numa janela estreita, a ultima aba
    // fica perto da borda direita.
    const x = Math.min(Math.max(8, alvo.left - 6), window.innerWidth - caixa.width - 8);
    host.style.left = `${x}px`;
    host.style.top = `${alvo.bottom + 6}px`;
  };

  const picker: IconPicker = {
    isOpen: () => !host.hidden,
    isOpenFor: (alvo) => !host.hidden && alvo === slot,

    async open(anchor, alvo) {
      slot = alvo;
      const atual = handlers.current(slot);
      // Calculadas agora, uma vez, e nunca enquanto a pessoa escreve.
      const sugeridos = suggestIcons(await handlers.textFor(slot));
      const recentes = handlers.recents().slice(0, 5);

      host.innerHTML = `
        ${grupo(t("icons.suggested"), sugeridos, atual)}
        ${grupo(t("icons.recent"), recentes, atual)}
        <div class="gp-picker__group">
          <span class="gp-picker__title">${t("icons.all")}</span>
          <div class="gp-picker__grid">${ICON_IDS.map((id) => botao(id, atual)).join("")}</div>
        </div>
        ${atual ? `<button class="gp-picker__none" data-pick="">${t("icons.none")}</button>` : ""}`;

      host.hidden = false;
      posicionar(anchor);
      host.querySelector<HTMLElement>('[data-on="true"], [data-pick]')?.focus();
    },

    close() {
      if (host.hidden) return;
      host.hidden = true;
      handlers.onClose();
    },
  };

  host.addEventListener("click", (event) => {
    const alvo = (event.target as HTMLElement).closest<HTMLElement>("[data-pick]");
    if (!alvo) return;
    const id = alvo.dataset.pick;
    handlers.onPick(slot, id ? (id as IconId) : null);
    picker.close();
  });

  // Fora do popover fecha; Esc tambem. Em captura, para vir antes do editor.
  document.addEventListener(
    "mousedown",
    (event) => {
      const alvo = event.target as HTMLElement;
      // O icone da aba decide sozinho: abre, ou fecha se ja estava aberto.
      if (alvo.closest?.("[data-icon-pick]")) return;
      if (picker.isOpen() && !host.contains(alvo)) picker.close();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (picker.isOpen() && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        picker.close();
      }
    },
    true,
  );

  return picker;
}
