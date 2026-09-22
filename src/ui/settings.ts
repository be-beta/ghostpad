/**
 * Painel de configurações (Ctrl+,).
 *
 * Só o que muda a experiência de escrever: idioma, fonte, tamanho do texto e o
 * esmaecimento automático. O resto se configura onde é usado — opacidade pelo
 * teclado, conteúdo da barra no menu dela, atalhos no painel de atalhos. Um
 * painel que reúne tudo só porque é um painel vira lista que ninguém lê.
 *
 * O esmaecimento está aqui, e não só na barra, porque o controle dele é clicar
 * na opacidade — que agora pode estar escondida.
 */

import { FONTS, FONT_SIZE_MAX, FONT_SIZE_MIN, type FontId } from "../core/fonts";
import { LANGUAGES, t, type Lang } from "../core/i18n";

export interface SettingsValues {
  lang: Lang;
  font: FontId;
  fontSize: number;
  idleFade: boolean;
}

export interface SettingsPanel {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Redesenha com valores novos (usado quando o idioma muda). */
  refresh(): void;
}

export interface SettingsHandlers {
  values: () => SettingsValues;
  onLang: (lang: Lang) => void;
  onFont: (font: FontId) => void;
  onFontSize: (size: number) => void;
  onIdleFade: (value: boolean) => void;
}

export function createSettingsPanel(host: HTMLElement, handlers: SettingsHandlers): SettingsPanel {
  const render = () => {
    const { lang, font, fontSize, idleFade } = handlers.values();

    const idiomas = LANGUAGES.map(
      (item) => `
        <button class="gp-option" data-lang="${item.id}" data-on="${item.id === lang}">
          ${item.label}
        </button>`,
    ).join("");

    // Cada nome aparece na própria fonte: é a forma mais direta de escolher.
    const fontes = FONTS.map(
      (item) => `
        <button
          class="gp-option gp-option--font"
          data-font="${item.id}"
          data-on="${item.id === font}"
          style="font-family: ${item.stack}"
        >
          ${item.label || t("settings.font.system")}
        </button>`,
    ).join("");

    host.innerHTML = `
      <div class="gp-sheet__card" role="dialog" aria-label="${t("settings.title")}">
        <header class="gp-sheet__header">
          <span>${t("settings.title")}</span>
          <span class="gp-sheet__hint"><button class="gp-sheet__close" data-close aria-label="${t("settings.close")}">✕</button>
          </span>
        </header>

        <section class="gp-sheet__section">
          <h2>${t("settings.language")}</h2>
          <div class="gp-options">${idiomas}</div>
        </section>

        <section class="gp-sheet__section">
          <h2>${t("settings.font")}</h2>
          <div class="gp-options gp-options--stack">${fontes}</div>
        </section>

        <section class="gp-sheet__section">
          <h2>${t("settings.fontSize")}</h2>
          <div class="gp-options">
            <button class="gp-option" data-size="-1" ${fontSize <= FONT_SIZE_MIN ? "disabled" : ""}>−</button>
            <span class="gp-options__value">${t("settings.fontSize.value", { n: fontSize })}</span>
            <button class="gp-option" data-size="1" ${fontSize >= FONT_SIZE_MAX ? "disabled" : ""}>+</button>
          </div>
        </section>

        <section class="gp-sheet__section">
          <h2>${t("settings.idleFade")}</h2>
          <div class="gp-options">
            <button class="gp-option" data-idle="on" data-on="${idleFade}">${t("settings.on")}</button>
            <button class="gp-option" data-idle="off" data-on="${!idleFade}">${t("settings.off")}</button>
          </div>
        </section>

      </div>`;
  };

  const panel: SettingsPanel = {
    isOpen: () => !host.hidden,
    open() {
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
    refresh() {
      if (panel.isOpen()) render();
    },
  };

  host.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const lang = target.closest<HTMLElement>("[data-lang]")?.dataset.lang;
    if (lang) {
      handlers.onLang(lang as Lang);
      render();
      return;
    }

    const font = target.closest<HTMLElement>("[data-font]")?.dataset.font;
    if (font) {
      handlers.onFont(font as FontId);
      render();
      return;
    }

    const size = target.closest<HTMLElement>("[data-size]")?.dataset.size;
    if (size) {
      handlers.onFontSize(handlers.values().fontSize + Number(size));
      render();
      return;
    }

    const idle = target.closest<HTMLElement>("[data-idle]")?.dataset.idle;
    if (idle) {
      handlers.onIdleFade(idle === "on");
      render();
      return;
    }

    if (target === host || target.closest("[data-close]")) panel.close();
  });

  return panel;
}
