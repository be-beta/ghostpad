/**
 * Painel de busca do GhostPad.
 *
 * Substitui o painel embutido do CodeMirror, que vinha em ingles, com controles
 * pequenos e opcoes que um bloco de notas nao usa (expressao regular, palavra
 * inteira). Escrever o proprio painel saiu mais barato que continuar corrigindo
 * o de fora por cima.
 *
 * Regra dos rotulos: **seta so para navegar, palavra para o que altera o
 * texto**. Um icone para "substituir todas" seria adivinhacao, e errar ali
 * custa caro. As setas apontam para os lados, como avancar e voltar.
 */

import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorView, Panel } from "@codemirror/view";

const CHEVRON_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>';

function button(className: string, html: string, title: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.innerHTML = html;
  // Botao com icone sem rotulo precisa de nome para o mouse e para leitores de
  // tela: sem isso, a simplificacao viraria adivinhacao.
  element.title = title;
  element.setAttribute("aria-label", title);
  return element;
}

function field(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "gp-find__field";
  input.placeholder = placeholder;
  input.spellcheck = false;
  return input;
}

export function ghostSearchPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "gp-find";

  const current = getSearchQuery(view.state);
  const search = field("Buscar");
  const replace = field("Substituir por");
  search.value = current.search;
  replace.value = current.replace;

  const prev = button("gp-find__icon", CHEVRON_LEFT, "Anterior (Shift+Enter)");
  const next = button("gp-find__icon", CHEVRON_RIGHT, "Próxima (Enter)");
  const close = button("gp-find__icon gp-find__icon--close", CLOSE, "Fechar (Esc)");

  const caseSensitive = button("gp-find__toggle", "Aa", "Diferenciar maiúsculas de minúsculas");
  caseSensitive.dataset.on = String(current.caseSensitive);

  const replaceOne = document.createElement("button");
  replaceOne.type = "button";
  replaceOne.className = "gp-find__action";
  replaceOne.textContent = "Substituir";

  const replaceEvery = document.createElement("button");
  replaceEvery.type = "button";
  replaceEvery.className = "gp-find__action";
  replaceEvery.textContent = "Todas";

  /** Manda a consulta atual para o editor; tudo aqui passa por este ponto. */
  const commit = () => {
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: search.value,
          replace: replace.value,
          caseSensitive: caseSensitive.dataset.on === "true",
          literal: true,
        }),
      ),
    });
  };

  search.addEventListener("input", commit);
  replace.addEventListener("input", commit);

  caseSensitive.addEventListener("click", () => {
    caseSensitive.dataset.on = String(caseSensitive.dataset.on !== "true");
    commit();
    search.focus();
  });

  const run = (command: (view: EditorView) => boolean) => () => {
    command(view);
    view.focus();
  };

  prev.addEventListener("click", run(findPrevious));
  next.addEventListener("click", run(findNext));
  replaceOne.addEventListener("click", run(replaceNext));
  replaceEvery.addEventListener("click", run(replaceAll));
  close.addEventListener("click", () => closeSearchPanel(view));

  dom.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.target === replace) replaceNext(view);
      else if (event.shiftKey) findPrevious(view);
      else findNext(view);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchPanel(view);
    }
  });

  const linha = document.createElement("div");
  linha.className = "gp-find__row";
  linha.append(search, prev, next, caseSensitive);

  const linhaSubstituir = document.createElement("div");
  linhaSubstituir.className = "gp-find__row";
  linhaSubstituir.append(replace, replaceOne, replaceEvery, close);

  dom.append(linha, linhaSubstituir);

  return {
    dom,
    top: true,
    mount() {
      search.focus();
      search.select();
    },
  };
}
