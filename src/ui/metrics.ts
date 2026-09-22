/**
 * Metricas da barra de status.
 *
 * Todas sao estimativas baratas, calculadas no proprio texto a cada mudanca.
 * Duas delas sao aproximacoes de proposito e a interface diz isso com o sinal
 * "~": paginas e tokens dependem de diagramacao e de tokenizador, que o app nao
 * tem como saber. Prometer precisao onde nao existe seria pior que aproximar.
 */

import { t } from "../core/i18n";

export type MetricKey = "words" | "chars" | "lines" | "tokens" | "pages";

export type MetricModules = Record<MetricKey, boolean>;

/** Controles da barra que podem ser escondidos, além das contagens. */
export type ControlKey = "fontSize" | "opacity" | "backdrop";

export type BarControls = Record<ControlKey, boolean>;

export const CONTROL_KEYS: ControlKey[] = ["fontSize", "opacity", "backdrop"];

export const DEFAULT_CONTROLS: BarControls = {
  fontSize: true,
  opacity: true,
  // Desligado por padrão: o desfoque nativo falha em parte das máquinas, então
  // o seletor de fundo só interessa a quem for testá-lo.
  backdrop: false,
};

export const controlLabel = (key: ControlKey): string => t(`bar.${key}` as "bar.fontSize");

export const DEFAULT_MODULES: MetricModules = {
  words: true,
  chars: false,
  lines: false,
  // Ligado por padrao: o uso central do app e escrever prompt, e nesse contexto
  // tokens importam mais que qualquer outra contagem.
  tokens: true,
  pages: false,
};

export const moduleLabel = (key: MetricKey): string =>
  t(`metric.${key}` as "metric.words");

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

const numero = (value: number) => value.toLocaleString();

const plural = (key: "words" | "chars" | "lines", value: number) =>
  t(`metric.${key}.${value === 1 ? "one" : "many"}` as "metric.words.one", { n: numero(value) });

/**
 * Rotulos curtos para quando o espaco aperta.
 *
 * A barra divide a largura com os chips de estado, entao com tres ou mais
 * metricas ligadas os dois lados se encontravam. Encurtar o rotulo mantem a
 * informacao; esconder a metrica a perderia.
 */
const shortUnit = (key: MetricKey) => t(`metric.short.${key}` as "metric.short.words");

export function formatMetric(key: MetricKey, metrics: Metrics, compact = false): string {
  const short = (value: number, prefix = "") => `${prefix}${numero(value)} ${shortUnit(key)}`;

  switch (key) {
    case "words":
      return compact ? short(metrics.words) : plural("words", metrics.words);
    case "chars":
      return compact ? short(metrics.chars) : plural("chars", metrics.chars);
    case "lines":
      return compact ? short(metrics.lines) : plural("lines", metrics.lines);
    case "tokens":
      return compact
        ? short(metrics.tokens, "~")
        : t("metric.tokens.value", { n: numero(metrics.tokens) });
    case "pages": {
      // Uma casa decimal: "0,4 pág." diz mais sobre o progresso que "0 pág.".
      const pages = metrics.pages.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return t("metric.pages.value", { n: pages });
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
