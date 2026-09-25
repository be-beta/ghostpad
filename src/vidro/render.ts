/**
 * Como as anotacoes do Vidro se parecem.
 *
 * Um desenho so, para a tela e para a imagem copiada: o que a pessoa ve
 * enquanto anota e exatamente o que chega ao clipboard, porque e a mesma funcao
 * que desenha os dois. A unica diferenca e que a imagem nao leva selecao nem
 * alcas.
 *
 * O estilo e do Harp, e nao de editor grafico: traco limpo, cantos levemente
 * arredondados, sem sombra projetada, sem gradiente. Cada traco leva um halo
 * fino de contraste, para continuar visivel sobre fundo claro e escuro — uma
 * seta branca sobre uma pagina branca nao pode sumir.
 */

import { ACCENTS } from "../core/theme";
import { HANDLE, handlesOf, bounds, type Color, type Obj } from "./model";

const TRACO = 3;
const TRACO_SETA = 4;
const PONTA_COMPRIMENTO = 18;
const PONTA_LARGURA = 15;
const RAIO_CAIXA = 6;

export const FONTE = '600 16px "Inter Variable", "Inter", "Segoe UI", system-ui, sans-serif';
const LINHA = 22;
const FOLGA_X = 10;
const FOLGA_Y = 6;
const RAIO_TEXTO = 7;

/**
 * Tom das cores: cada destaque tem um tom para tema claro e outro para escuro,
 * e o Vidro usa o do tema em que o app esta — o mesmo que aparece nas
 * configuracoes.
 */
let tom: "light" | "dark" = "dark";

export function setTone(next: "light" | "dark"): void {
  tom = next;
}

/** Cor de verdade de um destaque, no tom do tema atual. */
export function paint(color: Color): string {
  const accent = ACCENTS.find((item) => item.id === color) ?? ACCENTS[0];
  return `rgb(${tom === "light" ? accent.light : accent.dark})`;
}

/** Luminancia aproximada de 0 a 1, suficiente para escolher entre dois. */
function luminance(css: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(css);
  let r: number, g: number, b: number;
  if (m) {
    const n = parseInt(m[1], 16);
    [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    [r, g, b] = (css.match(/\d+/g) ?? ["0", "0", "0"]).map(Number);
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Halo de contraste: escuro em volta de cor clara, claro em volta de cor
 * escura. Um roxo fundo sobre uma pagina escura some sem o halo claro.
 */
function halo(color: Color): string {
  return luminance(paint(color)) > 0.42 ? "rgba(0, 0, 0, 0.38)" : "rgba(255, 255, 255, 0.55)";
}

/** Preto ou branco, o que tiver mais contraste com a caixa. */
export function inkOn(background: string): string {
  return luminance(background) > 0.6 ? "#141414" : "#ffffff";
}

// --- Medicao de texto ----------------------------------------------------------

const medidor = document.createElement("canvas").getContext("2d")!;

/** Tamanho da caixa de um texto, com a folga em volta. */
export function measureText(text: string): { w: number; h: number } {
  medidor.font = FONTE;
  const linhas = text.split("\n");
  const largura = Math.max(8, ...linhas.map((l) => medidor.measureText(l).width));
  return { w: Math.ceil(largura + FOLGA_X * 2), h: linhas.length * LINHA + FOLGA_Y * 2 };
}

export const TEXT_PADDING = { x: FOLGA_X, y: FOLGA_Y, line: LINHA, radius: RAIO_TEXTO };

// --- Desenho -------------------------------------------------------------------

function tracar(ctx: CanvasRenderingContext2D, color: Color, largura: number, caminho: () => void) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  caminho();
  ctx.strokeStyle = halo(color);
  ctx.lineWidth = largura + 3;
  ctx.stroke();

  ctx.beginPath();
  caminho();
  ctx.strokeStyle = paint(color);
  ctx.lineWidth = largura;
  ctx.stroke();
}

function desenharSeta(ctx: CanvasRenderingContext2D, obj: Extract<Obj, { kind: "arrow" }>) {
  const ang = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
  const comprimento = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
  // Ponta proporcional em setas curtas: uma ponta cheia numa seta de 20 px
  // seria so ponta.
  const ponta = Math.min(PONTA_COMPRIMENTO, comprimento * 0.45);
  const abertura = (PONTA_LARGURA / PONTA_COMPRIMENTO) * ponta;
  // A haste termina na base da ponta, para o traco arredondado nao vazar.
  const bx = obj.x2 - Math.cos(ang) * ponta * 0.85;
  const by = obj.y2 - Math.sin(ang) * ponta * 0.85;

  tracar(ctx, obj.color, TRACO_SETA, () => {
    ctx.moveTo(obj.x1, obj.y1);
    ctx.lineTo(bx, by);
  });

  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const baseX = obj.x2 - Math.cos(ang) * ponta;
  const baseY = obj.y2 - Math.sin(ang) * ponta;
  const triangulo = () => {
    ctx.moveTo(obj.x2, obj.y2);
    ctx.lineTo(baseX + (nx * abertura) / 2, baseY + (ny * abertura) / 2);
    ctx.lineTo(baseX - (nx * abertura) / 2, baseY - (ny * abertura) / 2);
    ctx.closePath();
  };

  ctx.lineJoin = "round";
  ctx.beginPath();
  triangulo();
  ctx.strokeStyle = halo(obj.color);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  triangulo();
  ctx.fillStyle = paint(obj.color);
  ctx.fill();
  ctx.strokeStyle = paint(obj.color);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function desenharTexto(ctx: CanvasRenderingContext2D, obj: Extract<Obj, { kind: "text" }>) {
  const fundo = paint(obj.color);
  ctx.save();
  // Sombra curta, e so aqui: sem ela, uma caixa branca some numa pagina branca.
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.roundRect(obj.x, obj.y, obj.w, obj.h, RAIO_TEXTO);
  ctx.fillStyle = fundo;
  ctx.fill();
  ctx.restore();

  ctx.font = FONTE;
  ctx.fillStyle = inkOn(fundo);
  ctx.textBaseline = "middle";
  obj.text.split("\n").forEach((linha, i) => {
    ctx.fillText(linha, obj.x + FOLGA_X, obj.y + FOLGA_Y + LINHA * i + LINHA / 2);
  });
}

export function drawObject(ctx: CanvasRenderingContext2D, obj: Obj): void {
  switch (obj.kind) {
    case "arrow":
      return desenharSeta(ctx, obj);
    case "rect":
      return tracar(ctx, obj.color, TRACO, () => ctx.roundRect(obj.x, obj.y, obj.w, obj.h, RAIO_CAIXA));
    case "circle":
      return tracar(ctx, obj.color, TRACO, () =>
        ctx.ellipse(obj.x + obj.w / 2, obj.y + obj.h / 2, obj.w / 2, obj.h / 2, 0, 0, Math.PI * 2),
      );
    case "text":
      return desenharTexto(ctx, obj);
  }
}

/** Contorno tracejado e alcas do objeto selecionado. So na tela, nunca na imagem. */
export function drawSelection(ctx: CanvasRenderingContext2D, obj: Obj, accent: string): void {
  const b = bounds(obj);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = accent;
  if (obj.kind !== "arrow") ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
  ctx.setLineDash([]);
  for (const h of handlesOf(obj)) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(h.x - HANDLE / 2, h.y - HANDLE / 2, HANDLE, HANDLE, 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A imagem das anotacoes, transparente, no tamanho fisico do monitor.
 *
 * O Rust junta este PNG com a tela capturada. Transparente onde nao ha
 * anotacao, para a tela aparecer por baixo.
 */
export async function renderPng(
  objs: Obj[],
  css: { width: number; height: number },
  physical: { width: number; height: number },
): Promise<ArrayBuffer> {
  await document.fonts.load(FONTE);
  const canvas = document.createElement("canvas");
  canvas.width = physical.width;
  canvas.height = physical.height;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(physical.width / css.width, physical.height / css.height);
  for (const obj of objs) drawObject(ctx, obj);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG vazio"))), "image/png"),
  );
  return blob.arrayBuffer();
}
