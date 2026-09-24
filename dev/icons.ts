/**
 * Comparacao das tres familias de icone no tamanho em que eles vao viver.
 *
 * O criterio e um so: legibilidade na aba recolhida. Cada familia entra com a
 * variante que ela mesma recomenda para tamanhos pequenos:
 *
 *   Heroicons  16/solid ("micro"), desenhada para 16 px
 *   Phosphor   bold, o peso indicado para interface pequena
 *   Tabler     outline, traco 2 numa grade de 24
 *
 * Tamanhos: 9 px (o ponto da aba recolhida hoje), 12 e 14 px (cabem na barra
 * atual, de 26 px, sem aumenta-la) e 48 px para comparar desenho.
 */

import "../src/styles.css";
import { ACCENTS, applyAccent, type AccentId, type Theme } from "../src/core/theme";
import { FAMILY_NAMES, ICON_IDS, type IconId } from "../src/ui/icon-catalog";

type Family = "heroicons" | "phosphor" | "tabler";

const hero = import.meta.glob("/node_modules/heroicons/16/solid/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const phosphor = import.meta.glob("/node_modules/@phosphor-icons/core/assets/bold/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const tabler = import.meta.glob("/node_modules/@tabler/icons/icons/outline/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function svg(family: Family, id: IconId): string {
  const name = FAMILY_NAMES[id][family];
  const path =
    family === "heroicons"
      ? `/node_modules/heroicons/16/solid/${name}.svg`
      : family === "phosphor"
        ? `/node_modules/@phosphor-icons/core/assets/bold/${name}-bold.svg`
        : `/node_modules/@tabler/icons/icons/outline/${name}.svg`;
  const source = { heroicons: hero, phosphor, tabler }[family][path];
  if (!source) return `<span style="color:red">?</span>`;
  // Tamanho vem do CSS; cor do `currentColor`.
  return source.replace(/\s(width|height)="[^"]*"/g, "");
}

const FAMILIES: { id: Family; label: string; note: string }[] = [
  { id: "heroicons", label: "Heroicons", note: "16/solid (micro)" },
  { id: "phosphor", label: "Phosphor", note: "bold" },
  { id: "tabler", label: "Tabler", note: "outline, traço 2" },
];

const SIZES = [9, 12, 14];

let theme: Theme = "dark";
let accent: AccentId = "mint";

function render(): void {
  document.documentElement.dataset.theme = theme;
  applyAccent(accent, theme);

  const app = document.getElementById("app")!;
  const acentos = ACCENTS.map(
    (a) =>
      `<button data-accent="${a.id}" class="cmp-pill" data-on="${a.id === accent}">${a.id}</button>`,
  ).join("");

  const blocos = FAMILIES.map((family) => {
    const faixas = SIZES.map((size) => {
      const abas = ICON_IDS.map(
        (id, i) =>
          `<span class="cmp-tab" data-active="${i === 2}" style="--s:${size}px" title="${id}">${svg(family.id, id)}</span>`,
      ).join("");
      return `<div class="cmp-row"><span class="cmp-size">${size} px</span><div class="cmp-bar">${abas}</div></div>`;
    }).join("");

    const grandes = ICON_IDS.map(
      (id) =>
        `<figure class="cmp-big"><span>${svg(family.id, id)}</span><figcaption>${id}</figcaption></figure>`,
    ).join("");

    const lupas = SIZES.map(
      (size) =>
        `<div class="cmp-row"><span class="cmp-size">${size} px ×${LUPA}</span><canvas class="cmp-lupa" data-family="${family.id}" data-size="${size}"></canvas></div>`,
    ).join("");

    return `
      <section class="cmp-family">
        <h2>${family.label} <small>${family.note}</small></h2>
        ${faixas}
        <p class="cmp-hint">Lupa: os pixels reais do tamanho da aba, ampliados sem suavizar.</p>
        ${lupas}
        <div class="cmp-grid">${grandes}</div>
      </section>`;
  }).join("");

  app.innerHTML = `
    <header class="cmp-head">
      <h1>Ícones das abas</h1>
      <p>Barra de 26 px como a do app. A terceira aba de cada faixa está ativa.</p>
      <div class="cmp-controls">
        <button id="toggle-theme" class="cmp-pill">tema: ${theme}</button>
        ${acentos}
      </div>
    </header>
    ${blocos}`;
  void drawLupas();
}

/** Ampliacao da lupa. Inteira, para cada pixel virar um quadrado exato. */
const LUPA = 5;
/** Icones por linha na lupa: 25 numa linha so passariam da largura da tela. */
const POR_LINHA = 9;

/**
 * Desenha cada icone no tamanho real num canvas e amplia sem suavizar.
 *
 * Ampliar o SVG redesenharia o vetor e mostraria um icone nitido que nao existe
 * na aba. A lupa mostra o que o olho recebe de fato no tamanho pequeno.
 */
async function drawLupas(): Promise<void> {
  const cor = getComputedStyle(document.documentElement).getPropertyValue("--gp-text").trim();
  const fundo = `rgb(${getComputedStyle(document.documentElement).getPropertyValue("--gp-bg").trim()})`;
  const dpr = window.devicePixelRatio || 1;

  for (const canvas of document.querySelectorAll<HTMLCanvasElement>(".cmp-lupa")) {
    const family = canvas.dataset.family as Family;
    const size = Number(canvas.dataset.size);
    const passo = size + 6;
    const real = document.createElement("canvas");
    const linhas = Math.ceil(ICON_IDS.length / POR_LINHA);
    real.width = Math.round(POR_LINHA * passo * dpr);
    real.height = Math.round(linhas * passo * dpr);
    const ctx = real.getContext("2d")!;
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, real.width, real.height);

    await Promise.all(
      ICON_IDS.map(
        (id, i) =>
          new Promise<void>((resolve) => {
            const fonte = svg(family, id)
              .replace(/currentColor/g, cor)
              .replace("<svg", `<svg width="${size * dpr}" height="${size * dpr}"`);
            const img = new Image();
            img.onload = () => {
              const x = (i % POR_LINHA) * passo + 3;
              const y = Math.floor(i / POR_LINHA) * passo + 3;
              ctx.drawImage(img, Math.round(x * dpr), Math.round(y * dpr));
              resolve();
            };
            img.onerror = () => resolve();
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fonte)}`;
          }),
      ),
    );

    canvas.width = real.width * LUPA;
    canvas.height = real.height * LUPA;
    canvas.style.width = `${(real.width * LUPA) / dpr}px`;
    const grande = canvas.getContext("2d")!;
    grande.imageSmoothingEnabled = false;
    grande.drawImage(real, 0, 0, canvas.width, canvas.height);
  }
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.id === "toggle-theme") {
    theme = theme === "dark" ? "light" : "dark";
    render();
  }
  const a = target.dataset.accent as AccentId | undefined;
  if (a) {
    accent = a;
    render();
  }
});

const style = document.createElement("style");
style.textContent = `
  body { overflow: auto; background: rgb(var(--gp-bg)); color: var(--gp-text); padding: 24px; font: 13px var(--gp-font); }
  html, body { height: auto; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 28px 0 10px; }
  h2 small { color: var(--gp-text-dim); font-weight: 400; }
  .cmp-head p { color: var(--gp-text-dim); margin: 0 0 10px; }
  .cmp-controls { display: flex; gap: 6px; flex-wrap: wrap; }
  .cmp-pill { border: 0; border-radius: 6px; padding: 4px 8px; background: var(--gp-surface); color: var(--gp-text); cursor: pointer; font: inherit; }
  .cmp-pill[data-on="true"] { background: rgba(var(--gp-accent-rgb), .2); color: var(--gp-accent); }
  .cmp-row { display: flex; align-items: center; gap: 10px; }
  .cmp-size { width: 40px; color: var(--gp-text-faint); font-variant-numeric: tabular-nums; }
  .cmp-bar { display: flex; align-items: center; gap: 2px; height: 26px; padding: 0 13px; border-radius: 8px; background: rgba(var(--gp-bg), .9); box-shadow: inset 0 0 0 1px var(--gp-surface); }
  .cmp-tab { display: inline-grid; place-items: center; width: calc(var(--s) + 6px); height: calc(var(--s) + 6px); border-radius: 4px; color: var(--gp-text-dim); }
  .cmp-tab[data-active="true"] { color: var(--gp-accent); background: rgba(var(--gp-accent-rgb), .16); }
  .cmp-tab svg { width: var(--s); height: var(--s); display: block; }
  .cmp-hint { color: var(--gp-text-faint); font-size: 11px; margin: 10px 0 4px; }
  .cmp-lupa { display: block; image-rendering: pixelated; border-radius: 6px; margin: 4px 0; }
  .cmp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; margin-top: 12px; }
  .cmp-big { margin: 0; display: grid; justify-items: center; gap: 4px; padding: 10px 4px; border-radius: 8px; background: var(--gp-surface); }
  .cmp-big svg { width: 48px; height: 48px; color: var(--gp-text); }
  .cmp-big figcaption { font-size: 10px; color: var(--gp-text-dim); }
`;
document.head.append(style);

render();
