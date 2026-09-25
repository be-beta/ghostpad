/**
 * Objetos do Vidro e o que se faz com eles, sem DOM.
 *
 * Quatro tipos, e so os dados que cada um precisa: posicao, tamanho, conteudo
 * quando ha, cor e tipo. Nada de camadas, grupos ou estilos por objeto — o
 * estilo e um so, o do Harp, e mora em `render.ts`.
 *
 * Tudo aqui e puro: recebe objetos, devolve objetos. O historico guarda copias
 * inteiras, e por isso desfazer e sempre exato.
 */

import { ACCENTS, type AccentId } from "../core/theme";

export type Kind = "text" | "arrow" | "rect" | "circle";
export type Tool = Kind;

/**
 * As mesmas cores de destaque do app, e so elas: quem anota com o Harp anota
 * com a paleta do Harp. Para o texto, a cor e a da caixa; a letra e preta ou
 * branca, a que tiver mais contraste com ela.
 */
export type Color = AccentId;
export const COLORS: Color[] = ACCENTS.map((accent) => accent.id);

interface Base {
  id: number;
  color: Color;
}

/** Seta: da cauda (x1, y1) a ponta (x2, y2). */
export interface Arrow extends Base {
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Retangulo e circulo: a caixa que os contem, sempre com largura positiva. */
export interface Box extends Base {
  kind: "rect" | "circle";
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Texto: canto superior esquerdo da caixa; `w` e `h` vem da medicao. */
export interface Text extends Base {
  kind: "text";
  x: number;
  y: number;
  text: string;
  w: number;
  h: number;
}

export type Obj = Arrow | Box | Text;

/** Alcas de redimensionamento: cantos da caixa, ou as pontas da seta. */
export type Handle = "nw" | "ne" | "sw" | "se" | "start" | "end";

/** Distancia maxima, em pixels, para um clique contar como "no traco". */
export const HIT = 8;
/** Tamanho do quadrado de uma alca. */
export const HANDLE = 10;

// --- Geometria -------------------------------------------------------------

export function bounds(obj: Obj): { x: number; y: number; w: number; h: number } {
  if (obj.kind === "arrow") {
    const x = Math.min(obj.x1, obj.x2);
    const y = Math.min(obj.y1, obj.y2);
    return { x, y, w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) };
  }
  return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * O clique acertou o objeto?
 *
 * Formas vazadas contam so perto do traco. Contar o interior impediria desenhar
 * um retangulo dentro de outro — o clique selecionaria o de fora.
 */
export function hits(obj: Obj, px: number, py: number): boolean {
  switch (obj.kind) {
    case "arrow":
      return distanceToSegment(px, py, obj.x1, obj.y1, obj.x2, obj.y2) <= HIT;
    case "text":
      return px >= obj.x && px <= obj.x + obj.w && py >= obj.y && py <= obj.y + obj.h;
    case "rect": {
      const dentroFolgado =
        px >= obj.x - HIT && px <= obj.x + obj.w + HIT && py >= obj.y - HIT && py <= obj.y + obj.h + HIT;
      const dentroEstrito =
        px > obj.x + HIT && px < obj.x + obj.w - HIT && py > obj.y + HIT && py < obj.y + obj.h - HIT;
      return dentroFolgado && !dentroEstrito;
    }
    case "circle": {
      const rx = obj.w / 2;
      const ry = obj.h / 2;
      if (rx < 1 || ry < 1) return false;
      const nx = (px - (obj.x + rx)) / rx;
      const ny = (py - (obj.y + ry)) / ry;
      const r = Math.sqrt(nx * nx + ny * ny);
      return Math.abs(r - 1) * Math.min(rx, ry) <= HIT;
    }
  }
}

/** O objeto de cima que o clique acertou (o ultimo desenhado fica por cima). */
export function objectAt(objs: Obj[], px: number, py: number): Obj | undefined {
  for (let i = objs.length - 1; i >= 0; i--) if (hits(objs[i], px, py)) return objs[i];
  return undefined;
}

export function handlesOf(obj: Obj): { handle: Handle; x: number; y: number }[] {
  if (obj.kind === "arrow") {
    return [
      { handle: "start", x: obj.x1, y: obj.y1 },
      { handle: "end", x: obj.x2, y: obj.y2 },
    ];
  }
  // Texto nao redimensiona: o tamanho da letra e um so, para as anotacoes
  // conversarem entre si.
  if (obj.kind === "text") return [];
  return [
    { handle: "nw", x: obj.x, y: obj.y },
    { handle: "ne", x: obj.x + obj.w, y: obj.y },
    { handle: "sw", x: obj.x, y: obj.y + obj.h },
    { handle: "se", x: obj.x + obj.w, y: obj.y + obj.h },
  ];
}

export function handleAt(obj: Obj, px: number, py: number): Handle | undefined {
  const meio = HANDLE / 2 + 2;
  return handlesOf(obj).find((h) => Math.abs(px - h.x) <= meio && Math.abs(py - h.y) <= meio)?.handle;
}

// --- Transformacoes ----------------------------------------------------------

export function moved(obj: Obj, dx: number, dy: number): Obj {
  if (obj.kind === "arrow") return { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy };
  return { ...obj, x: obj.x + dx, y: obj.y + dy };
}

/** Caixa normalizada entre dois pontos, qualquer que seja a direcao do arraste. */
export function boxBetween(ax: number, ay: number, bx: number, by: number) {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/**
 * Arrasta uma alca ate (px, py). Numa caixa, o canto oposto fica parado; numa
 * seta, a outra ponta.
 */
export function resized(obj: Obj, handle: Handle, px: number, py: number): Obj {
  if (obj.kind === "arrow") {
    return handle === "start" ? { ...obj, x1: px, y1: py } : { ...obj, x2: px, y2: py };
  }
  if (obj.kind === "text") return obj;
  const fixo = {
    nw: [obj.x + obj.w, obj.y + obj.h],
    ne: [obj.x, obj.y + obj.h],
    sw: [obj.x + obj.w, obj.y],
    se: [obj.x, obj.y],
  }[handle as "nw" | "ne" | "sw" | "se"];
  return { ...obj, ...boxBetween(fixo[0], fixo[1], px, py) };
}

/** Pequeno demais para ser intencional: um clique, e nao um desenho. */
export function tooSmall(obj: Obj): boolean {
  if (obj.kind === "arrow") return Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) < 8;
  if (obj.kind === "text") return obj.text.trim() === "";
  return obj.w < 6 || obj.h < 6;
}

// --- Historico -----------------------------------------------------------------

/**
 * Desfazer e refazer da sessao atual, por copias inteiras.
 *
 * Copias, e nao comandos inversos: com poucos objetos, guardar o estado inteiro
 * custa nada e nao tem como desfazer "quase" certo.
 */
export class History {
  private past: Obj[][] = [];
  private future: Obj[][] = [];

  /** Guarda o estado de ANTES de uma mudanca. */
  record(before: Obj[]): void {
    this.past.push(structuredClone(before));
    this.future = [];
  }

  undo(current: Obj[]): Obj[] | undefined {
    const anterior = this.past.pop();
    if (!anterior) return undefined;
    this.future.push(structuredClone(current));
    return anterior;
  }

  redo(current: Obj[]): Obj[] | undefined {
    const seguinte = this.future.pop();
    if (!seguinte) return undefined;
    this.past.push(structuredClone(current));
    return seguinte;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
