/**
 * Enderecos no texto viram links de abrir com Ctrl+clique.
 *
 * Anotacao sobre tela quase sempre e "link + observacao": o endereco de onde a
 * coisa estava, e o que voce pensou sobre ela. Num bloco de notas comum esse
 * endereco e texto morto — da para copiar e colar no navegador, e mais nada.
 *
 * Nao existe inserir link, nem editar, nem esconder o endereco atras de um
 * rotulo: isso seria texto formatado, que o Harp nao e. O endereco continua
 * sendo o que voce digitou; so ganhou a capacidade de abrir.
 */

import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * So `http` e `https`.
 *
 * O texto vem de qualquer lugar — colado de um site, ditado, aberto de um
 * arquivo — e um clique nao pode virar a execucao de outro esquema qualquer.
 * Sao tambem os unicos que o backend autoriza abrir.
 */
const ENDERECO = /\bhttps?:\/\/[^\s<>"'`]+/g;

/** Classe que marca o trecho; tambem e o gancho do clique e do CSS. */
const CLASSE = "cm-harp-link";

/**
 * Pontuacao no fim quase nunca faz parte do endereco.
 *
 * "Veja https://exemplo.com." termina em ponto final, e "(https://exemplo.com)"
 * fecha parentese. Incluir esses caracteres abriria uma pagina que nao existe.
 */
function semPontuacaoFinal(url: string): string {
  return url.replace(/[.,;:!?)\]}>'"]+$/, "");
}

const marcador = new MatchDecorator({
  regexp: ENDERECO,
  decorate(add, from, _to, match) {
    const url = semPontuacaoFinal(match[0]);
    if (!url) return;
    add(from, from + url.length, Decoration.mark({ class: CLASSE, attributes: { "data-url": url } }));
  },
});

const sublinhado = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = marcador.createDeco(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = marcador.updateDeco(update, this.decorations);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Enquanto Ctrl estiver pressionado, o editor ganha uma classe.
 *
 * E o que troca o cursor para a mao sobre um endereco. Sem isso o recurso
 * existiria sem ninguem descobrir: um sublinhado discreto nao diz que da para
 * clicar, e o ponteiro dizendo "texto" diz ativamente que nao da.
 */
const ponteiro = ViewPlugin.fromClass(
  class {
    constructor(private view: EditorView) {
      window.addEventListener("keydown", this.tecla);
      window.addEventListener("keyup", this.tecla);
      // Sair da janela com Ctrl pressionado deixaria a mao para sempre.
      window.addEventListener("blur", this.solta);
    }

    tecla = (event: KeyboardEvent) => {
      this.view.dom.classList.toggle("cm-harp-ready", event.ctrlKey || event.metaKey);
    };

    solta = () => {
      this.view.dom.classList.remove("cm-harp-ready");
    };

    destroy() {
      window.removeEventListener("keydown", this.tecla);
      window.removeEventListener("keyup", this.tecla);
      window.removeEventListener("blur", this.solta);
    }
  },
);

const clique = EditorView.domEventHandlers({
  // `mousedown`, e nao `click`: o CodeMirror ja comecou a desenhar uma selecao
  // quando o clique termina, e o cursor saltaria antes da pagina abrir.
  mousedown(event) {
    if (!event.ctrlKey && !event.metaKey) return false;

    const url = (event.target as HTMLElement).closest<HTMLElement>(`.${CLASSE}`)?.dataset.url;
    if (!url) return false;

    event.preventDefault();
    void openUrl(url).catch((error) => console.error("[harp] falha ao abrir link", error));
    return true;
  },
});

export const links = [sublinhado, ponteiro, clique];
