/**
 * Fontes disponíveis para o texto.
 *
 * Todas são OFL e vêm empacotadas com o app — nada é baixado em uso, o que
 * mantém a promessa de funcionar sem rede. Os arquivos de cada família só são
 * carregados quando a família é escolhida: empacotar sete famílias e carregar
 * as sete na abertura desperdiçaria memória por algo que ninguém pediu.
 */

export type FontId =
  | "inter"
  | "dm-serif-text"
  | "eb-garamond"
  | "ibm-plex-mono"
  | "dm-mono"
  | "syne"
  | "comic-neue"
  | "system";

export interface FontChoice {
  id: FontId;
  /** Nome da família, exibido na própria fonte no menu. */
  label: string;
  /** Valor final do `font-family`, com alternativas. */
  stack: string;
  /** Carrega os arquivos da família. */
  load?: () => Promise<unknown>;
}

const SYSTEM_STACK = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

export const FONTS: FontChoice[] = [
  {
    id: "inter",
    label: "Inter",
    stack: `"Inter Variable", "Inter", ${SYSTEM_STACK}`,
    load: () => import("@fontsource-variable/inter"),
  },
  {
    id: "dm-serif-text",
    label: "DM Serif Text",
    stack: '"DM Serif Text", Georgia, serif',
    load: () => import("@fontsource/dm-serif-text/400.css"),
  },
  {
    id: "eb-garamond",
    label: "EB Garamond",
    stack: '"EB Garamond Variable", Garamond, Georgia, serif',
    load: () => import("@fontsource-variable/eb-garamond"),
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    stack: '"IBM Plex Mono", Consolas, monospace',
    load: () => import("@fontsource/ibm-plex-mono/400.css"),
  },
  {
    id: "dm-mono",
    label: "DM Mono",
    stack: '"DM Mono", Consolas, monospace',
    load: () => import("@fontsource/dm-mono/400.css"),
  },
  {
    id: "syne",
    label: "Syne",
    stack: `"Syne Variable", ${SYSTEM_STACK}`,
    load: () => import("@fontsource-variable/syne"),
  },
  {
    id: "comic-neue",
    label: "Comic Neue",
    stack: '"Comic Neue", "Comic Sans MS", cursive',
    load: () => import("@fontsource/comic-neue/400.css"),
  },
  // Última da lista: quem quiser a fonte que já usa no Windows a encontra aqui.
  { id: "system", label: "", stack: SYSTEM_STACK },
];

export const DEFAULT_FONT: FontId = "inter";

export const FONT_SIZE_MIN = 11;
export const FONT_SIZE_MAX = 30;
export const DEFAULT_FONT_SIZE = 15;

const loaded = new Set<FontId>();

/**
 * Aplica a fonte escolhida, carregando os arquivos dela na primeira vez.
 *
 * A troca da variável CSS acontece depois do carregamento: mudar antes faria o
 * texto piscar na fonte de fallback enquanto os arquivos chegam.
 */
export async function applyFont(id: FontId): Promise<void> {
  const choice = FONTS.find((font) => font.id === id) ?? FONTS[0];

  if (choice.load && !loaded.has(choice.id)) {
    try {
      await choice.load();
      loaded.add(choice.id);
    } catch {
      // Falhou o carregamento: a pilha de alternativas segura o texto.
    }
  }

  document.documentElement.style.setProperty("--gp-font", choice.stack);
}

export function applyFontSize(size: number): number {
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(size)));
  document.documentElement.style.setProperty("--gp-font-size", `${clamped}px`);
  return clamped;
}
