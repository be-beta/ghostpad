/**
 * Tema e cor de destaque.
 *
 * O tema vira um atributo no elemento raiz e o CSS resolve o resto — inclusive
 * o modo "sistema", que usa `prefers-color-scheme` e por isso acompanha o
 * Windows trocando de claro para escuro sozinho, sem o app precisar vigiar nada.
 *
 * O destaque é guardado em componentes (`110, 231, 183`) e não como cor pronta,
 * porque a interface o usa em várias transparências diferentes.
 */

export type Theme = "system" | "light" | "dark";

export type AccentId = "mint" | "blue" | "violet" | "amber" | "coral" | "purple" | "slate";

export interface Accent {
  id: AccentId;
  /**
   * Componentes RGB por tema.
   *
   * A mesma cor não serve aos dois fundos: um roxo forte some no escuro, e um
   * menta claro desaparece no claro. Cada tom é escolhido para ter contraste no
   * fundo em que vai aparecer, mantendo a identidade da cor.
   */
  dark: string;
  light: string;
}

export const ACCENTS: Accent[] = [
  { id: "mint", dark: "110, 231, 183", light: "13, 148, 108" },
  { id: "blue", dark: "96, 165, 250", light: "29, 78, 216" },
  { id: "violet", dark: "167, 139, 250", light: "109, 40, 217" },
  { id: "amber", dark: "251, 191, 36", light: "180, 83, 9" },
  { id: "coral", dark: "251, 113, 133", light: "190, 24, 60" },
  // O roxo pedido (#3215ad) é escuro demais para o tema escuro, então lá ele
  // aparece numa versão mais luminosa do mesmo tom.
  { id: "purple", dark: "139, 116, 245", light: "50, 21, 173" },
  { id: "slate", dark: "148, 163, 184", light: "71, 85, 105" },
];

/** Tema realmente em uso: "sistema" resolve pelo que o Windows está usando. */
export function effectiveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export const DEFAULT_THEME: Theme = "system";
export const DEFAULT_ACCENT: AccentId = "mint";

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function applyAccent(id: AccentId, theme: Theme): void {
  const accent = ACCENTS.find((item) => item.id === id) ?? ACCENTS[0];
  const rgb = effectiveTheme(theme) === "light" ? accent.light : accent.dark;
  document.documentElement.style.setProperty("--gp-accent-rgb", rgb);
}

/**
 * Avisa quando o Windows troca entre claro e escuro.
 *
 * Só importa no modo "sistema": o CSS já vira sozinho, mas a cor de destaque
 * precisa trocar de tom junto, e isso o CSS não faz.
 */
export function watchSystemTheme(onChange: () => void): void {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", onChange);
}
