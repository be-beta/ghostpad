/**
 * Metricas da barra de status.
 *
 * Todas sao estimativas baratas, calculadas no proprio texto a cada mudanca.
 * Duas delas sao aproximacoes de proposito e a interface diz isso com o sinal
 * "~": paginas e tokens dependem de diagramacao e de tokenizador, que o app nao
 * tem como saber. Prometer precisao onde nao existe seria pior que aproximar.
 */

export type MetricKey = "words" | "chars" | "lines" | "tokens" | "pages";

export type MetricModules = Record<MetricKey, boolean>;

export const DEFAULT_MODULES: MetricModules = {
  words: true,
  chars: false,
  lines: false,
  // Ligado por padrao: o uso central do app e escrever prompt, e nesse contexto
  // tokens importam mais que qualquer outra contagem.
  tokens: true,
  pages: false,
};

export const MODULE_LABELS: Record<MetricKey, string> = {
  words: "Palavras",
  chars: "Caracteres",
  lines: "Linhas",
  tokens: "Tokens (aprox.)",
  pages: "Páginas A4/ABNT (aprox.)",
};

/**
 * Caracteres por pagina no padrao ABNT: A4, fonte 12, entrelinha 1,5, margens
 * de 3cm/2cm. Da cerca de 30 linhas de ~70 caracteres.
 */
const CHARS_PER_PAGE = 2100;

/**
 * Caracteres por token.
 *
 * A regra difundida (4 caracteres por token) vem do ingles. Portugues gasta
 * mais tokens pela acentuacao e pelas palavras mais longas, entao o divisor e
 * menor. Continua sendo estimativa: cada modelo tem seu proprio tokenizador.
 */
const CHARS_PER_TOKEN = 3.8;

export interface Metrics {
  words: number;
  chars: number;
  lines: number;
  tokens: number;
  pages: number;
}

export function computeMetrics(text: string): Metrics {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: text.length,
    // Documento vazio ainda e uma linha, como em qualquer editor.
    lines: text ? text.split("\n").length : 1,
    tokens: Math.ceil(text.length / CHARS_PER_TOKEN),
    pages: text.length / CHARS_PER_PAGE,
  };
}

const plural = (value: number, one: string, many: string) =>
  `${value.toLocaleString("pt-BR")} ${value === 1 ? one : many}`;

/**
 * Rotulos curtos para quando o espaco aperta.
 *
 * A barra divide a largura com os chips de estado, entao com tres ou mais
 * metricas ligadas os dois lados se encontravam. Encurtar o rotulo mantem a
 * informacao; esconder a metrica a perderia.
 */
const SHORT_UNITS: Record<MetricKey, string> = {
  words: "pal.",
  chars: "car.",
  lines: "lin.",
  tokens: "tok.",
  pages: "pág.",
};

export function formatMetric(key: MetricKey, metrics: Metrics, compact = false): string {
  const short = (value: number, prefix = "") =>
    `${prefix}${value.toLocaleString("pt-BR")} ${SHORT_UNITS[key]}`;

  switch (key) {
    case "words":
      return compact ? short(metrics.words) : plural(metrics.words, "palavra", "palavras");
    case "chars":
      return compact ? short(metrics.chars) : plural(metrics.chars, "caractere", "caracteres");
    case "lines":
      return compact ? short(metrics.lines) : plural(metrics.lines, "linha", "linhas");
    case "tokens":
      return compact
        ? short(metrics.tokens, "~")
        : `~${metrics.tokens.toLocaleString("pt-BR")} tokens`;
    case "pages": {
      // Uma casa decimal: "0,4 pág." diz mais sobre o progresso que "0 pág.".
      const pages = metrics.pages.toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return `~${pages} pág.`;
    }
  }
}

export const enabledCount = (modules: MetricModules) =>
  Object.values(modules).filter(Boolean).length;

/** Renderiza so os modulos ligados, na ordem fixa da barra. */
export function renderMetrics(
  host: HTMLElement,
  text: string,
  modules: MetricModules,
  compact: boolean,
): void {
  const metrics = computeMetrics(text);
  const order: MetricKey[] = ["words", "chars", "lines", "tokens", "pages"];

  host.textContent = "";
  for (const key of order) {
    if (!modules[key]) continue;
    const span = document.createElement("span");
    span.className = "gp-metric";
    span.dataset.metric = key;
    span.textContent = formatMetric(key, metrics, compact);
    host.append(span);
  }
}
