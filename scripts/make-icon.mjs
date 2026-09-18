/**
 * Monta o icone do app a partir do SVG enviado pelo usuario.
 *
 * O SVG original tem traco preto sobre fundo transparente, que desapareceria na
 * barra de tarefas escura do Windows. Aqui ele vira desenho claro sobre o mesmo
 * cinza-carvao do app, com folga nas bordas para o simbolo respirar em 16px.
 */

import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\//, "");
const SOURCE = `${ROOT}assets/harp.svg`;
const OUT_DIR = `${ROOT}src-tauri/icons`;

const BG = "#121212";
const FG = "#F3F4F6";
const SIZE = 1024;
const SCALE = 0.72; // proporcao do simbolo dentro do quadrado

const source = readFileSync(SOURCE, "utf8");

// Aproveita o grupo de paths como veio, so trocando a cor do preenchimento.
const match = source.match(/<g transform=[\s\S]*<\/g>/);
if (!match) throw new Error("Nao encontrei o grupo de paths no SVG de origem");
const glyph = match[0].replace(/fill="#000000"/, `fill="${FG}"`);

const inset = (512 * (1 - SCALE)) / 2;
const composed = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${BG}"/>
  <rect x="2" y="2" width="508" height="508" rx="110" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="4"/>
  <g transform="translate(${inset},${inset}) scale(${SCALE})">${glyph}</g>
</svg>`;

writeFileSync(`${OUT_DIR}/source.svg`, composed);
await sharp(Buffer.from(composed)).resize(SIZE, SIZE).png().toFile(`${OUT_DIR}/icon-source.png`);

console.log(`icone base gerado em ${OUT_DIR}/icon-source.png`);
console.log("agora rode: npx tauri icon src-tauri/icons/icon-source.png");
