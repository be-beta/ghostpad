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
import { ACCENTS, type AccentId, type Theme } from "../core/theme";

export interface SettingsValues {
  lang: Lang;
  font: FontId;
  fontSize: number;
  idleFade: boolean;
  theme: Theme;
  accent: AccentId;
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
  onTheme: (theme: Theme) => void;
  onAccent: (accent: AccentId) => void;
}

export function createSettingsPanel(host: HTMLElement, handlers: SettingsHandlers): SettingsPanel {
  const render = () => {
    const { lang, font, fontSize, idleFade, theme, accent } = handlers.values();

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

    const temas = (["system", "light", "dark"] as Theme[])
      .map(
        (item) => `
        <button class="gp-option" data-theme-option="${item}" data-on="${item === theme}">
          ${t(`theme.${item}` as "theme.system")}
        </button>`,
      )
      .join("");

    // O botão é a própria cor: nomear seis tons daria uma lista para ler em vez
    // de uma escolha para ver. O nome fica na dica, para quem precisar dele.
    const cores = ACCENTS.map(
      (item) => `
        <button
          class="gp-swatch"
          data-accent="${item.id}"
          data-on="${item.id === accent}"
          style="background: rgb(${item.rgb}); color: rgb(${item.rgb})"
          title="${t(`accent.${item.id}` as "accent.mint")}"
          aria-label="${t(`accent.${item.id}` as "accent.mint")}"
        ></button>`,
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
          <h2>${t("settings.theme")}</h2>
          <div class="gp-options">${temas}</div>
        </section>

        <section class="gp-sheet__section">
          <h2>${t("settings.accent")}</h2>
          <div class="gp-options">${cores}</div>
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

  /**
   * Atualiza só os marcadores de seleção.
   *
   * Refazer o painel inteiro a cada clique reiniciava a animação de entrada, o
   * que aparecia como uma piscada a cada escolha.
   */
  const syncState = () => {
    const { lang, font, fontSize, idleFade, theme, accent } = handlers.values();

    // A chave vai explicita: a ordem dos atributos de um elemento nao e
    // garantida, entao ler "o primeiro" daria certo por acaso.
    const marcar = (chave: string, atual: string) => {
      for (const node of host.querySelectorAll<HTMLElement>(`[data-${chave}]`)) {
        node.dataset.on = String(node.getAttribute(`data-${chave}`) === atual);
      }
    };

    marcar("lang", lang);
    marcar("font", font);
    marcar("theme-option", theme);
    marcar("accent", accent);

    for (const node of host.querySelectorAll<HTMLElement>("[data-idle]")) {
      node.dataset.on = String((node.dataset.idle === "on") === idleFade);
    }

    const valor = host.querySelector<HTMLElement>(".gp-options__value");
    if (valor) valor.textContent = t("settings.fontSize.value", { n: fontSize });

    const menor = host.querySelector<HTMLButtonElement>('[data-size="-1"]');
    const maior = host.querySelector<HTMLButtonElement>('[data-size="1"]');
    if (menor) menor.disabled = fontSize <= FONT_SIZE_MIN;
    if (maior) maior.disabled = fontSize >= FONT_SIZE_MAX;
  };

  const panel: SettingsPanel = {
    isOpen: () => !host.hidden,
    open() {
      render();
      host.hidden = false;
      // A animação de entrada vale para a abertura, não para cada clique.
      host.classList.add("gp-sheet--enter");
      host.addEventListener("animationend", () => host.classList.remove("gp-sheet--enter"), {
        once: true,
      });
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
      syncState();
      return;
    }

    const size = target.closest<HTMLElement>("[data-size]")?.dataset.size;
    if (size) {
      handlers.onFontSize(handlers.values().fontSize + Number(size));
      syncState();
      return;
    }

    const tema = target.closest<HTMLElement>("[data-theme-option]")?.dataset.themeOption;
    if (tema) {
      handlers.onTheme(tema as Theme);
      syncState();
      return;
    }

    const cor = target.closest<HTMLElement>("[data-accent]")?.dataset.accent;
    if (cor) {
      handlers.onAccent(cor as AccentId);
      syncState();
      return;
    }

    const idle = target.closest<HTMLElement>("[data-idle]")?.dataset.idle;
    if (idle) {
      handlers.onIdleFade(idle === "on");
      syncState();
      return;
    }

    if (target === host || target.closest("[data-close]")) panel.close();
  });

  return panel;
}
