/**
 * Editor do Harp sobre CodeMirror 6.
 *
 * Isolado da orquestracao: main.ts so conhece a API exportada aqui (ler,
 * escrever, focar, limpar) e nunca toca no CodeMirror diretamente.
 */

import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  placeholder,
  rectangularSelection,
  crosshairCursor,
  dropCursor,
  type KeyBinding,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { t } from "../core/i18n";
import { ghostSearchPanel } from "./search-panel";
import { links } from "./links";
import { tasks, toggleTask } from "./tasks";
import { tags } from "@lezer/highlight";

export interface EditorOptions {
  parent: HTMLElement;
  initialText: string;
  /** Tamanho do texto em pixels. */
  fontSize: number;
  /** Chamado a cada alteracao do documento. */
  onChange: (text: string) => void;
  /**
   * Atalhos do app avaliados ANTES dos do editor. Deve retornar true quando
   * tratou o evento, para o CodeMirror nao processar a mesma tecla.
   */
  onAppKeydown: (event: KeyboardEvent) => boolean;
}

/**
 * Atalhos padrao do CodeMirror que colidem com o Harp:
 *   Mod-[ / Mod-]  indentacao    -> opacidade da janela
 *   Mod-/          comentar      -> painel de atalhos (e texto livre nao tem comentario)
 *   Mod-i          selecionar no -> italico
 * Indentacao continua disponivel por Tab e Shift+Tab.
 */
const RESERVED_KEYS = new Set(["Mod-[", "Mod-]", "Mod-/", "Mod-i", "Mod-Alt-g"]);

const withoutReserved = (bindings: readonly KeyBinding[]) =>
  bindings.filter((binding) => !binding.key || !RESERVED_KEYS.has(binding.key));

// --- Formatacao Markdown ---------------------------------------------------

/**
 * Envolve cada selecao com o marcador; sem selecao, insere o par e poe o cursor
 * no meio. Se a selecao ja esta envolvida, remove o marcador (alterna).
 */
function toggleWrap(marker: string) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const size = marker.length;

    view.dispatch(
      state.changeByRange((range) => {
        const before = state.sliceDoc(range.from - size, range.from);
        const after = state.sliceDoc(range.to, range.to + size);

        if (before === marker && after === marker) {
          return {
            changes: [
              { from: range.from - size, to: range.from, insert: "" },
              { from: range.to, to: range.to + size, insert: "" },
            ],
            range: EditorSelection.range(range.from - size, range.to - size),
          };
        }

        return {
          changes: [
            { from: range.from, insert: marker },
            { from: range.to, insert: marker },
          ],
          range: EditorSelection.range(range.from + size, range.to + size),
        };
      }),
    );
    return true;
  };
}

const formattingKeymap: KeyBinding[] = [
  { key: "Mod-b", run: toggleWrap("**") },
  { key: "Mod-i", run: toggleWrap("_") },
  // Antes do `defaultKeymap`, que usa Mod-Enter para inserir linha em branco.
  { key: "Mod-Enter", run: toggleTask },
];

/**
 * Mensagens que o CodeMirror ainda gera por conta propria (ir para a linha,
 * aviso de substituicao). O painel de busca em si e nosso, em `search-panel.ts`.
 */
const searchPhrases = EditorState.phrases.of({
  "current match": "ocorrência atual",
  "Go to line": "Ir para a linha",
  go: "Ir",
  "on line": "na linha",
  "replaced $ matches": "$ ocorrências substituídas",
  "replaced match on line $": "ocorrência substituída na linha $",
});

// --- Aparencia -------------------------------------------------------------

const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--gp-text)",
      backgroundColor: "transparent",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--gp-font)",
      lineHeight: "var(--gp-line-height)",
      overflowX: "hidden",
    },
    ".cm-content": {
      padding: "0 18px 12px",
      caretColor: "var(--gp-accent)",
      // Contraste sobre qualquer fundo quando a opacidade esta baixa.
      textShadow: "var(--gp-text-shadow)",
    },
    ".cm-line": { padding: "0" },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--gp-accent)",
      borderLeftWidth: "2px",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
      { backgroundColor: "rgba(var(--gp-accent-rgb), 0.22) !important" },
    ".cm-selectionMatch": { backgroundColor: "var(--gp-surface)" },
    ".cm-placeholder": { color: "var(--gp-text-faint)" },

    // A moldura do painel continua vindo do tema; o conteudo e nosso.
    ".cm-panels": {
      backgroundColor: "var(--gp-panel)",
      color: "var(--gp-text)",
      borderTop: "1px solid var(--gp-border)",
      fontFamily: "var(--gp-font)",
    },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--gp-border)" },
    ".cm-searchMatch": { backgroundColor: "rgba(250, 204, 21, 0.25)" },
    ".cm-searchMatch-selected": { backgroundColor: "rgba(250, 204, 21, 0.5)" },
  },
  { dark: true },
);

/** Markdown sutil: da hierarquia ao texto sem virar editor de codigo. */
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.35em", fontWeight: "700" },
  { tag: tags.heading2, fontSize: "1.2em", fontWeight: "650" },
  { tag: tags.heading3, fontSize: "1.08em", fontWeight: "600" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--gp-link)" },
  { tag: tags.url, color: "var(--gp-link)" },
  { tag: tags.monospace, fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: "0.92em" },
  { tag: tags.quote, color: "var(--gp-text-dim)" },
  // Os marcadores (#, **, -) ficam discretos para o texto dominar.
  { tag: tags.processingInstruction, color: "var(--gp-text-faint)" },
  { tag: tags.list, color: "var(--gp-text)" },
]);

/**
 * Colar sempre como texto puro, com espacos normalizados. O CodeMirror ja
 * descarta formatacao; aqui somem os caracteres invisiveis que vem junto de
 * paginas web e documentos (espaco rigido, espaco de largura zero).
 */
const plainPaste = EditorView.clipboardInputFilter.of((text) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, ""),
);

/**
 * Alternavel em tempo de execucao: no teleprompter o texto vira somente
 * leitura, o que tambem libera as teclas simples (espaco, setas) para controlar
 * a rolagem sem competir com a digitacao.
 */
const editable = new Compartment();

/**
 * Tipografia como extensao, e nao como variavel de CSS trocada por fora.
 *
 * O CodeMirror guarda altura de linha e largura de caractere em cache e so
 * remede quando percebe que algo mudou. Uma variavel de CSS trocada por fora
 * passa despercebida: o texto crescia, mas a camada do cursor continuava
 * desenhada com a medida antiga, e a barra ficava na altura anterior.
 *
 * Trocando o tema do editor, o proprio CodeMirror marca a tipografia como suja
 * e remede tudo. E o caminho previsto pela biblioteca, e nao um empurrao no
 * cache dela.
 */
const typography = new Compartment();

/**
 * O tamanho vai literal, e nao como `var()`: o valor precisa estar no tema para
 * que uma troca seja uma troca de verdade. A familia continua vindo do CSS, que
 * a carrega sob demanda; como este tema e reconstruido junto, trocar de fonte
 * tambem dispara a remedicao.
 */
function typographyTheme(size: number): Extension {
  return EditorView.theme({ "&": { fontSize: `${size}px` } });
}

// --- API -------------------------------------------------------------------

/**
 * Estado completo de uma anotacao: texto, cursor e historico de desfazer.
 *
 * Opaco de proposito — `main.ts` guarda uma sessao por anotacao sem precisar
 * conhecer o CodeMirror.
 */
export type EditorSession = EditorState;

export interface GhostEditor {
  getText(): string;
  focus(): void;
  /** Substitui todo o texto numa unica transacao desfazivel. */
  replaceAll(text: string): void;
  /** Estado atual, para ser devolvido depois por `restoreSession`. */
  captureSession(): EditorSession;
  /** Volta a uma sessao guardada, com cursor e desfazer no ponto em que ficou. */
  restoreSession(session: EditorSession): void;
  /** Comeca uma sessao nova, sem historico herdado de outra anotacao. */
  newSession(text: string): void;
  /** Liga e desliga a edicao (o teleprompter usa somente leitura). */
  setEditable(value: boolean): void;
  /** Elemento que rola, usado pelo teleprompter. */
  scroller(): HTMLElement;
  /** Elemento do texto, onde entra a folga de leitura do teleprompter. */
  content(): HTMLElement;
  /** Altura de uma linha, em pixels. */
  lineHeight(): number;
  /** Avisa que o tamanho ou a familia do texto mudou. */
  setTypography(size: number): void;
  view: EditorView;
}

export function createEditor(options: EditorOptions): GhostEditor {
  const extensions: Extension[] = [
    // Atalhos do app primeiro: uma tecla do Harp nunca chega ao editor.
    editable.of(EditorView.editable.of(true)),
    typography.of(typographyTheme(options.fontSize)),
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event) => options.onAppKeydown(event),
      }),
    ),
    history(),
    drawSelection(),
    dropCursor(),
    highlightSpecialChars(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    search({ top: true, createPanel: ghostSearchPanel }),
    searchPhrases,
    EditorState.allowMultipleSelections.of(true),
    // Alt+Click adiciona cursor, como no VS Code (o padrao do CodeMirror e Ctrl).
    EditorView.clickAddsSelectionRange.of((event) => event.altKey),
    EditorView.lineWrapping,
    indentUnit.of("  "),
    // Sem titulos "setext": em Markdown, uma linha de texto seguida de outra so
    // com "-" vira titulo. Ao comecar uma lista, o paragrafo de cima mudava de
    // tamanho sozinho. Titulos com "#" continuam funcionando.
    markdown({ extensions: [{ remove: ["SetextHeading"] }] }),
    links,
    tasks,
    syntaxHighlighting(markdownHighlight),
    placeholder(t("editor.placeholder")),
    plainPaste,
    theme,
    keymap.of([
      ...formattingKeymap,
      indentWithTab,
      ...withoutReserved(defaultKeymap),
      ...withoutReserved(historyKeymap),
      ...withoutReserved(searchKeymap),
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString());
    }),
  ];

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({ doc: options.initialText, extensions }),
  });

  // Cursor no fim ao abrir: o caso comum e continuar de onde parou.
  view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });

  return {
    view,
    setEditable: (value) => {
      view.dispatch({ effects: editable.reconfigure(EditorView.editable.of(value)) });
    },
    scroller: () => view.scrollDOM,
    content: () => view.contentDOM,
    lineHeight: () => view.defaultLineHeight,
    setTypography: (size) => {
      view.dispatch({ effects: typography.reconfigure(typographyTheme(size)) });
    },
    captureSession: () => view.state,
    restoreSession: (session) => {
      view.setState(session);
      view.focus();
    },
    newSession: (text) => {
      view.setState(EditorState.create({ doc: text, extensions }));
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    },
    getText: () => view.state.doc.toString(),
    focus: () => view.focus(),
    replaceAll: (text) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length },
        scrollIntoView: true,
      }),
  };
}
