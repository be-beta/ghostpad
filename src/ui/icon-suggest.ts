/**
 * Sugestao de icone a partir do texto da aba.
 *
 * Tudo local, deterministico e sob demanda: roda uma vez quando o seletor abre,
 * nunca enquanto a pessoa escreve, e o mesmo texto da sempre a mesma resposta.
 * Nada de IA nem rede — e uma contagem de sinais simples.
 *
 * Sugestao so ordena. Quem escolhe e a pessoa, e o icone escolhido nunca muda
 * sozinho, mesmo que o texto passe a "parecer" outra coisa.
 */

import { ICON_IDS, type IconId } from "./icon-catalog";

/** Quantas sugestoes no maximo. Mais que isso vira uma segunda lista inteira. */
const MAX = 4;

/** Pontuacao minima para sugerir: uma palavra solta nao basta. */
const MINIMO = 2;

/**
 * Palavras por categoria, em portugues, ingles e espanhol, ja sem acento.
 *
 * Comparadas palavra a palavra (e nao como trecho): "ata" nao pode acender
 * "reuniao" dentro de "batata".
 */
const PALAVRAS: Partial<Record<IconId, string[]>> = {
  image: ["imagem", "imagens", "foto", "fotos", "fotografia", "image", "images", "photo", "photos", "screenshot", "print", "png", "jpg", "jpeg", "imagen", "imagenes"],
  video: ["video", "videos", "gravacao", "gravar", "filmagem", "clipe", "recording", "footage", "mp4", "grabacion", "edicao", "roteiro", "script"],
  audio: ["audio", "musica", "podcast", "som", "mp3", "music", "song", "sound", "cancion", "sonido", "trilha"],
  meeting: ["reuniao", "reunioes", "meeting", "call", "pauta", "ata", "conversa", "participantes", "agenda", "reunion", "llamada", "attendees", "1:1"],
  ai: ["prompt", "prompts", "llm", "gpt", "claude", "ia", "ai", "modelo", "model", "chatbot", "token", "tokens", "agente", "agent", "system"],
  calendar: ["prazo", "prazos", "deadline", "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo", "amanha", "hoje", "monday", "tuesday", "wednesday", "thursday", "friday", "tomorrow", "lunes", "martes", "manana", "cronograma", "schedule"],
  idea: ["ideia", "ideias", "idea", "ideas", "brainstorm", "insight", "talvez", "hipotese", "hypothesis"],
  research: ["pesquisa", "pesquisar", "research", "estudo", "estudos", "study", "fonte", "fontes", "source", "sources", "analise", "analysis", "investigacion", "comparar", "benchmark"],
  chart: ["grafico", "graficos", "chart", "charts", "metrica", "metricas", "metric", "metrics", "kpi", "dashboard", "crescimento", "growth", "conversao", "grafica"],
  presentation: ["slide", "slides", "apresentacao", "presentation", "deck", "pitch", "palestra", "keynote", "presentacion"],
  vector: ["design", "figma", "svg", "vetor", "vector", "layout", "ui", "ux", "wireframe", "prototipo", "prototype", "logo", "tipografia", "typography"],
  person: ["contato", "contact", "telefone", "phone", "email", "aniversario", "birthday", "cliente", "client", "contacto"],
  work: ["trabalho", "work", "escritorio", "office", "empresa", "company", "chefe", "boss", "equipe", "team", "trabajo", "oficina"],
  home: ["casa", "home", "mercado", "compras", "groceries", "familia", "family", "aluguel", "rent", "limpeza", "receita", "recipe"],
  project: ["projeto", "projetos", "project", "sprint", "roadmap", "fase", "milestone", "entrega", "entregas", "escopo", "scope", "proyecto"],
  code: ["function", "const", "return", "import", "class", "def", "var", "let", "async", "await", "null", "undefined", "bug", "api", "deploy", "commit"],
  document: ["capitulo", "chapter", "paragrafo", "rascunho", "draft", "texto", "artigo", "article", "ensaio", "essay", "documento", "document"],
};

const URL = /\bhttps?:\/\/\S+/g;
const TAREFA = /^\s*(?:[-*+]|\d+[.)]) \[[ xX]\]/;
const ITEM = /^\s*(?:[-*+]|\d+[.)]) /;
const TABELA = /^\s*\|.*\|\s*$/;
const CERCA = /^\s*(```|~~~)/;
/** Linhas com cara de codigo: terminam em `;`, `{` ou `}`, ou tem `=>`. */
const CODIGO = /(;|\{|\})\s*$|=>|^\s*(\/\/|#include|<\/?[a-z]+[ >])/;

function semAcento(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Categorias sugeridas para o texto, da mais provavel para a menos.
 *
 * Os pesos sao deliberadamente grosseiros. A estrutura do texto (tarefas,
 * tabela, codigo, links) pesa mais que o vocabulario, porque e um sinal que a
 * pessoa escreveu de proposito; palavras so desempatam e completam.
 */
export function suggestIcons(text: string): IconId[] {
  const pontos = new Map<IconId, number>();
  const somar = (id: IconId, valor: number) => pontos.set(id, (pontos.get(id) ?? 0) + valor);

  const linhas = text.split("\n");
  const cheias = linhas.filter((linha) => linha.trim() !== "");
  if (cheias.length === 0) return [];

  // --- Estrutura ------------------------------------------------------------

  const tarefas = cheias.filter((l) => TAREFA.test(l)).length;
  const itens = cheias.filter((l) => ITEM.test(l) && !TAREFA.test(l)).length;
  const tabela = cheias.filter((l) => TABELA.test(l)).length;
  const cercas = cheias.filter((l) => CERCA.test(l)).length;
  const codigo = cheias.filter((l) => CODIGO.test(l)).length;
  const urls = text.match(URL)?.length ?? 0;

  if (tarefas > 0) somar("tasks", 3 + tarefas * 2);
  if (itens >= 2) somar("list", 2 + itens);
  if (tabela >= 2) somar("data", 4 + tabela);
  // Varias linhas com o mesmo numero de separadores: CSV ou colado de planilha.
  const colunas = cheias.map((l) => (l.match(/[\t,;]/g) ?? []).length).filter((n) => n >= 2);
  if (colunas.length >= 3 && new Set(colunas).size <= 2) somar("data", 4);
  if (cercas >= 2) somar("code", 6);
  if (codigo >= 2) somar("code", Math.min(8, codigo * 2));
  if (urls > 0) somar("link", 2 + urls);
  if (urls >= 3) somar("web", 1 + urls);

  // Prosa longa, com pouca estrutura, e documento.
  const estruturadas = tarefas + itens + tabela + codigo;
  const frases = (text.match(/[.!?](\s|$)/g) ?? []).length;
  if (frases >= 4 && estruturadas <= cheias.length / 4) somar("document", 2 + Math.min(4, frases / 4));

  // --- Vocabulario ------------------------------------------------------------

  const palavras = new Map<string, number>();
  for (const palavra of semAcento(text.replace(URL, " ")).split(/[^a-z0-9:]+/)) {
    if (palavra) palavras.set(palavra, (palavras.get(palavra) ?? 0) + 1);
  }

  for (const [id, lista] of Object.entries(PALAVRAS) as [IconId, string[]][]) {
    let achadas = 0;
    for (const palavra of lista) achadas += palavras.get(palavra) ?? 0;
    // Cada ocorrencia vale 2, com teto: repetir "reuniao" dez vezes nao faz o
    // texto dez vezes mais sobre reuniao.
    if (achadas > 0) somar(id, Math.min(8, achadas * 2));
  }

  // Datas escritas (12/03, 2026-03-12) contam como calendario.
  const datas = text.match(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/g)?.length ?? 0;
  if (datas > 0) somar("calendar", 1 + datas);

  return [...pontos.entries()]
    .filter(([, valor]) => valor >= MINIMO)
    // Empate resolvido pela ordem do catalogo, para a resposta ser sempre a mesma.
    .sort((a, b) => b[1] - a[1] || ICON_IDS.indexOf(a[0]) - ICON_IDS.indexOf(b[0]))
    .slice(0, MAX)
    .map(([id]) => id);
}
