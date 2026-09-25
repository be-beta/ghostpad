/**
 * Tarefas em Markdown: `- [ ]` e `- [x]`.
 *
 * O arquivo continua sendo Markdown comum — qualquer outro editor le as mesmas
 * tarefas. O que muda e so a mao: Ctrl+Enter cria e marca, e a caixa desenhada
 * no lugar do `- [ ]` aceita clique.
 *
 * Continuar a lista no Enter, encerrar numa tarefa vazia e aninhar com Tab ja
 * vem do suporte a Markdown do editor, que reconhece o marcador de tarefa ao
 * continuar uma lista. Nada disso e reimplementado aqui.
 */

import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type Command,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Item de lista com marcador de tarefa.
 *
 * Grupos: 1 recuo + marcador + espaco, 2 o estado (` `, `x` ou `X`). O marcador
 * pode ser de lista comum ou numerada — `1. [ ]` tambem e tarefa valida.
 */
const TAREFA = /^(\s*(?:[-*+]|\d+[.)]) )\[([ xX])\](?= |$)/;

/** Item de lista comum, ainda sem caixa. */
const ITEM = /^(\s*(?:[-*+]|\d+[.)]) )/;

/**
 * O que Ctrl+Enter faz com uma linha, como troca de texto.
 *
 * Separado do editor para poder ser conferido sem ele. Devolve a posicao
 * (relativa ao inicio da linha) e o texto a inserir/remover.
 *
 * - tarefa aberta → concluida, e concluida → aberta (nunca remove a caixa: sair
 *   de tarefa e apagar o `[ ]`, gesto que ja existe);
 * - item de lista comum → vira tarefa, mantendo o marcador;
 * - qualquer outra linha → vira tarefa aberta, preservando o recuo.
 */
export function taskEdit(line: string): { from: number; to: number; insert: string } {
  const tarefa = TAREFA.exec(line);
  if (tarefa) {
    const pos = tarefa[1].length + 1;
    return { from: pos, to: pos + 1, insert: tarefa[2] === " " ? "x" : " " };
  }

  const item = ITEM.exec(line);
  if (item) {
    const pos = item[1].length;
    return { from: pos, to: pos, insert: "[ ] " };
  }

  const recuo = /^\s*/.exec(line)?.[0].length ?? 0;
  return { from: recuo, to: recuo, insert: "- [ ] " };
}

/**
 * Ctrl+Enter: cria ou alterna a tarefa em cada linha tocada pela selecao.
 *
 * Linhas repetidas numa selecao multipla sao tratadas uma vez so: alternar duas
 * vezes a mesma caixa desfaria o gesto.
 */
export const toggleTask: Command = (view) => {
  if (view.state.readOnly) return false;

  const vistas = new Set<number>();
  const changes: { from: number; to: number; insert: string }[] = [];

  for (const range of view.state.selection.ranges) {
    const primeira = view.state.doc.lineAt(range.from).number;
    const ultima = view.state.doc.lineAt(range.to).number;
    for (let n = primeira; n <= ultima; n++) {
      if (vistas.has(n)) continue;
      vistas.add(n);
      const line = view.state.doc.line(n);
      const edit = taskEdit(line.text);
      changes.push({ from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert });
    }
  }

  view.dispatch({ changes, userEvent: "input.task", scrollIntoView: true });
  return true;
};

/** A caixa desenhada no lugar do `[ ]`. So visual: o texto continua la. */
class Caixa extends WidgetType {
  constructor(readonly feita: boolean) {
    super();
  }

  eq(other: Caixa): boolean {
    return other.feita === this.feita;
  }

  toDOM(): HTMLElement {
    const caixa = document.createElement("span");
    caixa.className = "cm-harp-task";
    caixa.dataset.done = String(this.feita);
    caixa.setAttribute("aria-hidden", "true");
    return caixa;
  }

  // O clique chega ao manipulador do editor, que sabe em qual linha ele caiu.
  ignoreEvent(): boolean {
    return false;
  }
}

const linhaFeita = Decoration.line({ class: "cm-harp-task-done" });

function desenhar(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const tarefa = TAREFA.exec(line.text);
      if (tarefa) {
        const feita = tarefa[2] !== " ";
        // Em lista com marcador, o "- " some junto com o "[ ]": na tela fica so
        // a caixa, e o arquivo continua `- [ ]`. Em lista numerada o numero
        // fica, porque ali ele diz a ordem.
        const recuo = /^\s*/.exec(line.text)![0].length;
        const comMarcador = "-*+".includes(line.text[recuo]);
        const inicio = line.from + (comMarcador ? recuo : tarefa[1].length);
        const fim = line.from + tarefa[1].length + 3;
        if (feita) builder.add(line.from, line.from, linhaFeita);
        builder.add(inicio, fim, Decoration.replace({ widget: new Caixa(feita) }));
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const caixas = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = desenhar(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = desenhar(update.view);
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    // A caixa se comporta como um caractere so: o cursor pula por cima dela, e
    // Backspace logo depois apaga o `[ ]` inteiro, nunca metade.
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);

/** Alterna a tarefa da linha em que o clique caiu. */
function alternarNaLinha(view: EditorView, pos: number): boolean {
  if (view.state.readOnly) return false;
  const line = view.state.doc.lineAt(pos);
  if (!TAREFA.test(line.text)) return false;

  const edit = taskEdit(line.text);
  view.dispatch({
    changes: { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert },
    userEvent: "input.task",
  });
  return true;
}

const clique = EditorView.domEventHandlers({
  mousedown(event, view) {
    const alvo = (event.target as HTMLElement).closest(".cm-harp-task");
    if (!alvo || event.button !== 0) return false;

    // `mousedown`, e nao `click`: sem isto o CodeMirror move o cursor para a
    // caixa antes do clique terminar, e a pessoa perde o lugar onde escrevia.
    event.preventDefault();
    return alternarNaLinha(view, view.posAtDOM(alvo));
  },
});

export const tasks: Extension = [caixas, clique];
