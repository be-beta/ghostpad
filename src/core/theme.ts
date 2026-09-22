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

export type AccentId = "mint" | "blue" | "violet" | "amber" | "coral" | "slate";

export interface Accent {
  id: AccentId;
  /** Componentes RGB, para compor transparências. */
  rgb: string;
}

export const ACCENTS: Accent[] = [
  { id: "mint", rgb: "110, 231, 183" },
  { id: "blue", rgb: "96, 165, 250" },
  { id: "violet", rgb: "167, 139, 250" },
  { id: "amber", rgb: "251, 191, 36" },
  { id: "coral", rgb: "251, 113, 133" },
  { id: "slate", rgb: "148, 163, 184" },
];

export const DEFAULT_THEME: Theme = "system";
export const DEFAULT_ACCENT: AccentId = "mint";

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function applyAccent(id: AccentId): void {
  const accent = ACCENTS.find((item) => item.id === id) ?? ACCENTS[0];
  document.documentElement.style.setProperty("--gp-accent-rgb", accent.rgb);
}
