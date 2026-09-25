/**
 * Vidro, a janela: anotar sobre a tela.
 *
 * Tres coisas convivem aqui:
 *
 * - o canvas, que desenha os objetos com a mesma funcao que gera a imagem
 *   final (`render.ts`), para o que se ve ser o que se copia;
 * - a barra flutuante e o campo de edicao de texto, que sao HTML e por isso
 *   nunca entram na imagem;
 * - o modelo (`model.ts`), onde vivem os objetos e o historico.
 *
 * Captura, clipboard e foco sao do Rust (`vidro.rs`).
 */

import "../styles.css";
import "./vidro.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { applyAccent, applyTheme, DEFAULT_ACCENT, DEFAULT_THEME } from "../core/theme";
import { applyStaticTranslations, detectLang, setLang } from "../core/i18n";
import type { Settings } from "../core/store";
import {
  COLORS,
  History,
  boxBetween,
  handleAt,
  moved,
  objectAt,
  resized,
  tooSmall,
  type Color,
  type Handle,
  type Obj,
  type Tool,
} from "./model";
import { FONTE, TEXT_PADDING, drawObject, drawSelection, inkOn, measureText, paint, renderPng } from "./render";

interface Area {
  width: number;
  height: number;
  scale: number;
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const editor = document.getElementById("editor") as HTMLTextAreaElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const swatch = document.getElementById("swatch") as HTMLSpanElement;

// --- Estado da sessao -----------------------------------------------------------

let objs: Obj[] = [];
let selectedId: number | null = null;
let tool: Tool = "arrow";
let color: Color = "accent";
let nextId = 1;
/** Area coberta, em pixels fisicos. Vem do Rust ao abrir; ele confere o tamanho da imagem contra ela. */
let area: Area | null = null;

/**
 * Tamanho fisico da imagem das anotacoes.
 *
 * O do Rust, quando chegou; senao, o da propria janela na escala da tela. Nunca
 * o tamanho CSS: numa tela a 150%, ele e dois tercos do real, e o Rust recusaria
 * a imagem por nao bater com a captura.
 */
function physicalSize(): { width: number; height: number } {
  if (area) return { width: area.width, height: area.height };
  const dpr = window.devicePixelRatio || 1;
  return { width: Math.round(window.innerWidth * dpr), height: Math.round(window.innerHeight * dpr) };
}
let finishing = false;
const history = new History();

/** Copia interna: o objeto em si, e nao uma imagem dele — colado, continua editavel. */
let clipboard: Obj | null = null;
let pasteCount = 0;

/** Texto em edicao, e o estado de antes, para o desfazer engolir a edicao inteira. */
let editing: { id: number; before: Obj[] } | null = null;

/** Gesto em andamento com o mouse. */
let gesture:
  | { kind: "draw"; id: number; ax: number; ay: number; before: Obj[] }
  | { kind: "move"; id: number; lx: number; ly: number; before: Obj[]; moved: boolean }
  | { kind: "resize"; id: number; handle: Handle; before: Obj[]; moved: boolean }
  | null = null;

/** Setas do teclado seguidas contam como um passo so no desfazer. */
let nudgeTimer: number | undefined;

const selected = () => objs.find((o) => o.id === selectedId);
const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--gp-accent").trim();

// --- Desenho -------------------------------------------------------------------

let pending = false;
function redraw(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(window.innerWidth * dpr)) {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const cor = accent();
    for (const obj of objs) {
      // O texto em edicao aparece no campo, e nao duas vezes.
      if (editing?.id === obj.id) continue;
      drawObject(ctx, obj, cor);
    }
    const atual = selected();
    if (atual && !editing && !finishing) drawSelection(ctx, atual, cor);
  });
}

function renderHud(): void {
  for (const botao of hud.querySelectorAll<HTMLElement>("[data-tool]")) {
    botao.dataset.on = String(botao.dataset.tool === tool);
  }
  swatch.style.background = paint(color, accent());
  swatch.dataset.color = color;
  document.body.dataset.tool = tool;
}

// --- Mudancas com historico -------------------------------------------------------

function commit(before: Obj[]): void {
  history.record(before);
}

function replace(id: number, next: Obj): void {
  objs = objs.map((o) => (o.id === id ? next : o));
}

function remove(id: number): void {
  objs = objs.filter((o) => o.id !== id);
  if (selectedId === id) selectedId = null;
}

// --- Texto -------------------------------------------------------------------------

function startEditing(id: number, before: Obj[]): void {
  const obj = objs.find((o) => o.id === id);
  if (!obj || obj.kind !== "text") return;
  editing = { id, before };
  selectedId = id;

  const fundo = paint(obj.color, accent());
  Object.assign(editor.style, {
    left: `${obj.x}px`,
    top: `${obj.y}px`,
    font: FONTE,
    lineHeight: `${TEXT_PADDING.line}px`,
    padding: `${TEXT_PADDING.y}px ${TEXT_PADDING.x}px`,
    borderRadius: `${TEXT_PADDING.radius}px`,
    background: fundo,
    color: inkOn(fundo),
  });
  editor.value = obj.text;
  editor.hidden = false;
  fitEditor();
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
  redraw();
}

function fitEditor(): void {
  const { w, h } = measureText(editor.value || " ");
  editor.style.width = `${w + 4}px`;
  editor.style.height = `${h}px`;
}

/** Encerra a edicao. Texto vazio remove o objeto: caixa sem texto nao anota nada. */
function stopEditing(): void {
  if (!editing) return;
  const { id, before } = editing;
  editing = null;
  editor.hidden = true;

  const obj = objs.find((o) => o.id === id);
  if (obj && obj.kind === "text") {
    const text = editor.value.replace(/\s+$/, "");
    if (text.trim() === "") remove(id);
    else replace(id, { ...obj, text, ...measureText(text) });
  }
  // So entra no historico se algo mudou de fato.
  if (JSON.stringify(before) !== JSON.stringify(objs)) commit(before);
  redraw();
}

editor.addEventListener("input", fitEditor);

// --- Mouse -------------------------------------------------------------------------

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || finishing) return;
  if (editing) stopEditing();

  const x = event.clientX;
  const y = event.clientY;
  const before = structuredClone(objs);
  canvas.setPointerCapture(event.pointerId);

  // Alca do selecionado vem primeiro: ela fica por cima do contorno.
  const atual = selected();
  const alca = atual ? handleAt(atual, x, y) : undefined;
  if (atual && alca) {
    gesture = { kind: "resize", id: atual.id, handle: alca, before, moved: false };
    return;
  }

  const alvo = objectAt(objs, x, y);
  if (alvo) {
    selectedId = alvo.id;
    gesture = { kind: "move", id: alvo.id, lx: x, ly: y, before, moved: false };
    redraw();
    return;
  }

  selectedId = null;
  const id = nextId++;

  if (tool === "text") {
    objs = [...objs, { id, kind: "text", color, x, y: y - TEXT_PADDING.line / 2 - TEXT_PADDING.y, text: "", ...measureText(" ") }];
    // Deixa o clique terminar antes de mover o foco para o campo.
    requestAnimationFrame(() => startEditing(id, before));
    return;
  }

  objs =
    tool === "arrow"
      ? [...objs, { id, kind: "arrow", color, x1: x, y1: y, x2: x, y2: y }]
      : [...objs, { id, kind: tool, color, x, y, w: 0, h: 0 }];
  gesture = { kind: "draw", id, ax: x, ay: y, before };
  redraw();
});

canvas.addEventListener("pointermove", (event) => {
  const x = event.clientX;
  const y = event.clientY;

  if (!gesture) {
    // Cursor de mover sobre objetos: diz que da para pegar.
    document.body.dataset.hover = String(Boolean(objectAt(objs, x, y) || (selected() && handleAt(selected()!, x, y))));
    return;
  }

  const obj = objs.find((o) => o.id === gesture!.id);
  if (!obj) return;

  if (gesture.kind === "draw") {
    // Shift trava a seta em angulos de 45 graus e a caixa em quadrado.
    let px = x;
    let py = y;
    if (event.shiftKey) {
      if (obj.kind === "arrow") {
        const ang = Math.round(Math.atan2(py - gesture.ay, px - gesture.ax) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(px - gesture.ax, py - gesture.ay);
        px = gesture.ax + Math.cos(ang) * len;
        py = gesture.ay + Math.sin(ang) * len;
      } else {
        const lado = Math.max(Math.abs(px - gesture.ax), Math.abs(py - gesture.ay));
        px = gesture.ax + Math.sign(px - gesture.ax || 1) * lado;
        py = gesture.ay + Math.sign(py - gesture.ay || 1) * lado;
      }
    }
    replace(
      obj.id,
      obj.kind === "arrow" ? { ...obj, x2: px, y2: py } : { ...obj, ...boxBetween(gesture.ax, gesture.ay, px, py) },
    );
  } else if (gesture.kind === "move") {
    replace(obj.id, moved(obj, x - gesture.lx, y - gesture.ly));
    gesture.lx = x;
    gesture.ly = y;
    gesture.moved = true;
  } else {
    replace(obj.id, resized(obj, gesture.handle, x, y));
    gesture.moved = true;
  }
  redraw();
});

canvas.addEventListener("pointerup", () => {
  const g = gesture;
  gesture = null;
  if (!g) return;

  if (g.kind === "draw") {
    const obj = objs.find((o) => o.id === g.id);
    if (!obj || tooSmall(obj)) {
      remove(g.id);
    } else {
      selectedId = g.id;
      commit(g.before);
    }
  } else if (g.moved) {
    commit(g.before);
  }
  redraw();
});

canvas.addEventListener("dblclick", (event) => {
  const alvo = objectAt(objs, event.clientX, event.clientY);
  if (alvo?.kind === "text") startEditing(alvo.id, structuredClone(objs));
});

// --- Teclado ---------------------------------------------------------------------

function undo(): void {
  const anterior = history.undo(objs);
  if (anterior) {
    objs = anterior;
    if (!selected()) selectedId = null;
    redraw();
  }
}

function redo(): void {
  const seguinte = history.redo(objs);
  if (seguinte) {
    objs = seguinte;
    if (!selected()) selectedId = null;
    redraw();
  }
}

function nudge(dx: number, dy: number): void {
  const obj = selected();
  if (!obj) return;
  // A primeira seta de uma sequencia grava o historico; as seguintes, dentro de
  // meio segundo, entram no mesmo passo.
  if (nudgeTimer === undefined) commit(structuredClone(objs));
  window.clearTimeout(nudgeTimer);
  nudgeTimer = window.setTimeout(() => (nudgeTimer = undefined), 500);
  replace(obj.id, moved(obj, dx, dy));
  redraw();
}

function setTool(next: Tool): void {
  tool = next;
  renderHud();
}

/** Proxima cor; se ha objeto selecionado, ele muda junto. */
function cycleColor(): void {
  color = COLORS[(COLORS.indexOf(color) + 1) % COLORS.length];
  const obj = selected();
  if (obj) {
    commit(structuredClone(objs));
    replace(obj.id, { ...obj, color });
    redraw();
  }
  renderHud();
}

const FERRAMENTA_POR_TECLA: Record<string, Tool> = { "1": "text", "2": "arrow", "3": "rect", "4": "circle" };

window.addEventListener("keydown", (event) => {
  if (finishing) return;
  const ctrl = event.ctrlKey || event.metaKey;
  const tecla = event.key.toLowerCase();

  // Valem sempre, inclusive editando texto.
  if (ctrl && event.shiftKey && event.key === "Enter") {
    event.preventDefault();
    void finish();
    return;
  }

  if (editing) {
    // Editando, as teclas sao do texto; Esc so encerra a edicao.
    if (event.key === "Escape") {
      event.preventDefault();
      stopEditing();
    }
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    void cancel();
    return;
  }

  if (ctrl && !event.shiftKey && tecla === "z") return prevent(event, undo);
  if (ctrl && (tecla === "y" || (event.shiftKey && tecla === "z"))) return prevent(event, redo);

  if (ctrl && tecla === "c") {
    const obj = selected();
    // Com texto selecionado em algum lugar, Ctrl+C e do texto.
    if (obj && !window.getSelection()?.toString()) {
      clipboard = structuredClone(obj);
      pasteCount = 0;
      event.preventDefault();
    }
    return;
  }

  if (ctrl && tecla === "v") {
    if (!clipboard) return;
    event.preventDefault();
    pasteCount += 1;
    const antes = structuredClone(objs);
    const copia = { ...moved(structuredClone(clipboard), 16 * pasteCount, 16 * pasteCount), id: nextId++ } as Obj;
    objs = [...objs, copia];
    selectedId = copia.id;
    commit(antes);
    redraw();
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && selected()) {
    event.preventDefault();
    commit(structuredClone(objs));
    remove(selectedId!);
    redraw();
    return;
  }

  const passo = event.shiftKey ? 10 : 1;
  const seta: Record<string, [number, number]> = {
    ArrowLeft: [-passo, 0],
    ArrowRight: [passo, 0],
    ArrowUp: [0, -passo],
    ArrowDown: [0, passo],
  };
  if (seta[event.key] && selected()) {
    event.preventDefault();
    nudge(...seta[event.key]);
    return;
  }

  if (!ctrl && !event.altKey) {
    if (FERRAMENTA_POR_TECLA[event.key]) return prevent(event, () => setTool(FERRAMENTA_POR_TECLA[event.key]));
    if (event.key === "5") return prevent(event, cycleColor);
  }
});

function prevent(event: KeyboardEvent, action: () => void): void {
  event.preventDefault();
  action();
}

// --- Barra ---------------------------------------------------------------------------

hud.addEventListener("click", (event) => {
  const alvo = event.target as HTMLElement;
  const ferramenta = alvo.closest<HTMLElement>("[data-tool]")?.dataset.tool as Tool | undefined;
  if (ferramenta) setTool(ferramenta);
  else if (alvo.closest("#color")) cycleColor();
  else if (alvo.closest("#finish")) void finish();
  else if (alvo.closest("#close")) void cancel();
});

/** A barra pode sair da frente: arrastar pela alca a leva para outro lugar. */
hud.addEventListener("pointerdown", (event) => {
  if (!(event.target as HTMLElement).closest("[data-grip]")) return;
  const inicio = { x: event.clientX, y: event.clientY, left: hud.offsetLeft, top: hud.offsetTop };
  hud.setPointerCapture(event.pointerId);
  const mover = (e: PointerEvent) => {
    hud.style.left = `${inicio.left + e.clientX - inicio.x}px`;
    hud.style.top = `${inicio.top + e.clientY - inicio.y}px`;
    hud.style.transform = "none";
  };
  const soltar = () => {
    hud.removeEventListener("pointermove", mover);
    hud.removeEventListener("pointerup", soltar);
  };
  hud.addEventListener("pointermove", mover);
  hud.addEventListener("pointerup", soltar);
});

// --- Entrar e sair -------------------------------------------------------------------

async function applyPreferences(): Promise<void> {
  let salvo: Partial<Settings> | undefined;
  try {
    const store = await load("settings.json", { autoSave: false });
    salvo = (await store.get<Partial<Settings>>("settings")) ?? undefined;
  } catch {
    // Padrao, se nao der para ler: o Vidro precisa abrir de qualquer jeito.
  }
  const tema = salvo?.theme ?? DEFAULT_THEME;
  applyTheme(tema);
  applyAccent(salvo?.accent ?? DEFAULT_ACCENT, tema);
  setLang(salvo?.lang ?? detectLang());
  applyStaticTranslations();
}

function reset(): void {
  objs = [];
  selectedId = null;
  editing = null;
  gesture = null;
  finishing = false;
  editor.hidden = true;
  history.clear();
  hud.hidden = false;
  hud.removeAttribute("style");
  document.body.dataset.finishing = "false";
}

async function cancel(): Promise<void> {
  reset();
  redraw();
  await invoke("vidro_cancel");
}

/**
 * Ctrl+Shift+Enter: termina edicao, tira selecao e alcas, esconde a barra, e
 * manda as anotacoes para o Rust — que esconde a janela, captura a tela, junta
 * as duas e copia.
 */
async function finish(): Promise<void> {
  if (finishing) return;
  stopEditing();
  finishing = true;
  selectedId = null;
  hud.hidden = true;
  document.body.dataset.finishing = "true";
  redraw();

  try {
    const png = await renderPng(
      objs,
      { width: window.innerWidth, height: window.innerHeight },
      physicalSize(),
      accent(),
    );
    await invoke("vidro_finish", png);
  } catch (error) {
    console.error("[harp] falha ao capturar", error);
  } finally {
    reset();
    redraw();
  }
}

void listen<Area>("harp://vidro-open", async (event) => {
  area = event.payload;
  reset();
  await applyPreferences();
  renderHud();
  redraw();
  window.focus();
  canvas.focus();
});

window.addEventListener("resize", redraw);

void document.fonts.load(FONTE);
void applyPreferences().then(() => {
  renderHud();
  redraw();
});
