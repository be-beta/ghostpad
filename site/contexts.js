/**
 * Telas de contexto.
 *
 * São as coisas que já estão acontecendo na tela quando alguém precisa
 * escrever: código, uma planilha, uma reunião. Desenhadas em HTML, e não
 * capturadas, para escalar com a caixa onde são colocadas: o tamanho base de
 * cada uma está em `cqw` (a largura do espaço que a recebe) e o resto em `em`.
 *
 * As fotografias em images/ são provisórias (Unsplash), só para preencher.
 *
 * São decorativas. Quem não as vê não perde informação: o texto ao redor diz o
 * que cada uma representa.
 */

import { icon } from "./icons.js";

const h = (html) => {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const img = (name, cls = "", pos = "50% 50%") =>
  `<img class="ctx-img ${cls}" src="images/${name}" alt="" loading="lazy" decoding="async" style="object-position:${pos}">`;

/**
 * Vídeo de contexto.
 *
 * Só começa a baixar quando a cena se aproxima da tela, e pausa quando ela
 * sai: um site sobre não disputar atenção não deixa três vídeos rodando fora
 * de vista. Com movimento reduzido, fica no quadro parado — o `poster` já
 * conta a mesma coisa.
 */
const video = (name, pos = "50% 50%") =>
  `<video class="ctx-img" data-src="video/${name}.mp4" poster="video/${name}.jpg" muted loop playsinline
    preload="metadata" tabindex="-1" aria-hidden="true" style="object-position:${pos}"></video>`;

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Tenta tocar, e não desiste no primeiro não.
 *
 * `play()` pode ser recusado por três motivos comuns: os dados ainda não
 * chegaram, a janela estava escondida, ou o navegador exige um gesto antes de
 * qualquer vídeo. Sem isto, o quadro do `poster` ficava parado para sempre e
 * parecia uma imagem — que é exatamente o contrário do que a cena diz.
 */
function keepPlaying(v) {
  if (reduced.matches || !v.isConnected) return;
  if (!v.src) v.src = v.dataset.src;
  const tryPlay = () => v.play().catch(() => {});
  tryPlay();
  v.addEventListener("canplay", tryPlay, { once: true });
  v.addEventListener("loadeddata", tryPlay, { once: true });
}

const visible = new Set();

const videoWatcher = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        visible.add(v);
        keepPlaying(v);
      } else {
        visible.delete(v);
        v.pause?.();
      }
    }
  },
  { rootMargin: "600px 0px" }
);

/* A janela volta, a aba volta: o que está à vista volta a andar. */
const resumeVisible = () => {
  if (document.visibilityState !== "visible") return;
  for (const v of visible) keepPlaying(v);
};

document.addEventListener("visibilitychange", resumeVisible);
addEventListener("focus", resumeVisible);

/* Navegador que só libera vídeo depois de um gesto: o primeiro clique, toque
   ou rolagem serve de gesto. */
for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) {
  addEventListener(ev, resumeVisible, { once: true, passive: true });
}

const raw = (src, pos = "50% 50%") =>
  `<img class="ctx-img" src="${src}" alt="" loading="lazy" decoding="async" style="object-position:${pos}">`;

const winControls = `<span class="win-ctl" aria-hidden="true"><i></i><i></i><i></i></span>`;

/* Um pseudoaleatório fixo: as ondas de áudio e os gráficos saem sempre iguais. */
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/* --- Python com cores ------------------------------------------------------ */

const PY_KW = new Set(
  "from import as class def async await return for in if else elif and or not is None True False with yield lambda raise try except finally pass".split(" ")
);
const PY_BUILTIN = new Set("list tuple len abs zip float int str dict set sum max min sorted property field self".split(" "));

function highlightPython(src) {
  const re = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(@\w+)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/gm;
  let out = "";
  let last = 0;
  let nextIsName = "";
  for (const m of src.matchAll(re)) {
    out += esc(src.slice(last, m.index));
    last = m.index + m[0].length;
    const t = esc(m[0]);
    if (m[1]) out += `<span class="c">${t}</span>`;
    else if (m[2]) out += `<span class="s">${t}</span>`;
    else if (m[3]) out += `<span class="d">${t}</span>`;
    else if (m[4]) out += `<span class="n">${t}</span>`;
    else {
      const w = m[5];
      if (nextIsName) {
        out += `<span class="${nextIsName}">${t}</span>`;
        nextIsName = "";
      } else if (PY_KW.has(w)) {
        out += `<span class="k">${t}</span>`;
        if (w === "def") nextIsName = "f";
        if (w === "class") nextIsName = "t";
      } else if (PY_BUILTIN.has(w)) out += `<span class="b">${t}</span>`;
      else if (/^[A-Z]/.test(w)) out += `<span class="t">${t}</span>`;
      else if (src[last] === "(") out += `<span class="f">${t}</span>`;
      else out += t;
    }
  }
  return out + esc(src.slice(last));
}

const PYTHON = `from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable

from .extratos import Lancamento, carregar_extrato
from .regras import Regra, aplicar_regras


@dataclass(slots=True)
class Resultado:
    conciliados: list[tuple[Lancamento, Lancamento]] = field(default_factory=list)
    pendentes: list[Lancamento] = field(default_factory=list)

    @property
    def taxa(self) -> float:
        total = len(self.conciliados) + len(self.pendentes)
        return len(self.conciliados) / total if total else 0.0


async def conciliar_lote(contas: Iterable[str], regras: list[Regra],
                         tolerancia: Decimal = Decimal("0.01")) -> Resultado:
    # Os extratos chegam em paralelo; a ordem das contas é preservada.
    extratos = await asyncio.gather(*(carregar_extrato(c) for c in contas))
    resultado = Resultado()
    for banco, razao in zip(*extratos, strict=True):
        par = aplicar_regras(banco, razao, regras)
        if par and abs(par[0].valor - par[1].valor) <= tolerancia:
            resultado.conciliados.append(par)
        else:
            resultado.pendentes.append(banco)
    return resultado`;

/* --- Peças ----------------------------------------------------------------- */

function waveform(seed, n = 90) {
  const r = rng(seed);
  let d = "";
  for (let i = 0; i < n; i++) {
    const env = 0.35 + 0.65 * Math.abs(Math.sin(i / 7 + seed));
    const a = (0.15 + r() * 0.85) * env * 9;
    d += `M${i * 2 + 1} ${10 - a}V${10 + a}`;
  }
  return `<svg class="wave" viewBox="0 0 ${n * 2} 20" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
}

function histogram() {
  const curve = (seed, shift) => {
    const r = rng(seed);
    let d = "M0 60";
    for (let x = 0; x <= 100; x += 2) {
      const base = Math.exp(-Math.pow((x - shift) / 22, 2)) * 44 + Math.exp(-Math.pow((x - 82) / 9, 2)) * 18;
      d += ` L${x} ${60 - base - r() * 4}`;
    }
    return d + " L100 60Z";
  };
  return `<svg class="histo" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
    <path d="${curve(3, 38)}" fill="rgba(255,90,90,.45)"/>
    <path d="${curve(7, 46)}" fill="rgba(90,220,120,.4)"/>
    <path d="${curve(11, 54)}" fill="rgba(90,140,255,.45)"/>
  </svg>`;
}

/* --- Contextos ------------------------------------------------------------- */

const builders = {
  /* Um editor de código com projeto aberto. */
  code: () => {
    const lines = PYTHON.split("\n");
    return h(`<div class="ctx ctx--code">
      <div class="ide-title"><span class="ide-menu">Arquivo&nbsp;&nbsp;Editar&nbsp;&nbsp;Seleção&nbsp;&nbsp;Ver&nbsp;&nbsp;Executar&nbsp;&nbsp;Terminal</span><span class="ide-search">${icon("magnifying-glass")}fechamento</span>${winControls}</div>
      <div class="ide">
        <nav class="ide-act">${icon("document-duplicate", "on")}${icon("magnifying-glass")}${icon("squares-2x2")}${icon("play")}${icon("puzzle-piece")}<span></span>${icon("cog-6-tooth")}</nav>
        <aside class="ide-tree">
          <p>Explorador</p>
          <b>${icon("chevron-down-20")}FECHAMENTO</b>
          <span class="d1">${icon("chevron-down-20")}src</span>
          <span class="d2 f-py on">conciliacao.py</span>
          <span class="d2 f-py">extratos.py</span>
          <span class="d2 f-py">regras.py</span>
          <span class="d2 f-py">__init__.py</span>
          <span class="d1">${icon("chevron-right-20")}tests</span>
          <span class="d1 f-toml">pyproject.toml</span>
          <span class="d1 f-md">README.md</span>
        </aside>
        <div class="ide-main">
          <div class="ide-tabs"><span class="on">conciliacao.py<i></i></span><span>regras.py</span><span>test_conciliacao.py</span></div>
          <div class="ide-crumbs">src › conciliacao.py › conciliar_lote</div>
          <div class="ide-body">
            <ol class="ide-gutter">${lines.map((_, i) => `<li${i === 26 ? ' class="on"' : ""}>${i + 1}</li>`).join("")}</ol>
            <pre class="ide-code">${highlightPython(PYTHON)}</pre>
            <div class="ide-mini">${lines.map((l) => `<i style="--w:${Math.min(100, l.length * 1.25)}%;--x:${(l.length - l.trimStart().length) * 1.2}%"></i>`).join("")}</div>
          </div>
        </div>
      </div>
      <div class="ide-status"><span>⎇ main</span><span>⚠ 2</span><span class="sp"></span><span>Ln 27, Col 32</span><span>UTF-8</span><span>Python 3.12</span></div>
    </div>`);
  },

  /* Uma fotografia sozinha. */
  photo: () => h(`<div class="ctx ctx--photo">${img("surf.jpg")}</div>`),

  /* Um programa 3D aberto (captura provisória). */
  "3d": () => h(`<div class="ctx ctx--shot">${img("blender.jpg", "", "50% 0%")}</div>`),

  /* Revelação de fotografia. */
  editor: () => {
    const sliders = [
      ["Temperatura", 0.56, "5.450"],
      ["Tonalidade", 0.52, "+4"],
      ["Exposição", 0.61, "+0,35"],
      ["Contraste", 0.55, "+12"],
      ["Realces", 0.29, "−42"],
      ["Sombras", 0.62, "+18"],
      ["Brancos", 0.5, "0"],
      ["Pretos", 0.44, "−9"],
      ["Textura", 0.57, "+10"],
      ["Vibração", 0.63, "+22"],
    ];
    const strip = [
      ["surf.jpg", "50% 50%"],
      ["ipanema.jpg", "50% 45%"],
      ["rio.jpg", "50% 40%"],
      ["istambul.jpg", "50% 45%"],
      ["ponte.jpg", "50% 50%"],
      ["estrada.jpg", "60% 50%"],
      ["surf.jpg", "80% 40%"],
    ];
    return h(`<div class="ctx ctx--editor">
      <div class="e-top"><span class="e-mods"><b>Revelar</b><span>Biblioteca</span><span>Mapa</span><span>Imprimir</span></span><span>DSC_0412.ARW · 6000 × 4000</span></div>
      <div class="e-main">
        <aside class="e-left">
          <p>Navegador</p>
          <div class="e-nav">${img("surf.jpg")}<i></i></div>
          <p>Predefinições</p>
          <span>Paisagem · suave</span><span class="on">Costa · fim de tarde</span><span>Preto e branco · alto</span><span>Filme · 400</span>
        </aside>
        <div class="e-canvas"><div class="e-img">${img("surf.jpg")}<div class="e-thirds"></div><div class="e-crop"></div></div></div>
        <aside class="e-panel">
          <p>Histograma</p>
          ${histogram()}
          <p class="e-meta">ISO 100 · 70 mm · f/8 · 1/500 s</p>
          <p>Básico</p>
          ${sliders
            .map(([n, v, t]) => `<div class="e-slider"><span>${n}</span><b>${t}</b><em style="--v:${v}"></em></div>`)
            .join("")}
        </aside>
      </div>
      <div class="e-strip">${strip.map(([f, p], i) => `<span class="${i === 0 ? "on" : ""}">${img(f, "", p)}</span>`).join("")}</div>
    </div>`);
  },

  /* Uma planilha de fechamento, com fórmulas, abas e formatação. */
  sheet: () => {
    const rows = [
      ["Receita recorrente", "Comercial", "412.300", "418.950", "431.000", "428.410", "−2.590", -0.6, "ok"],
      ["Serviços", "Comercial", "86.120", "91.400", "95.000", "97.860", "2.860", 3.0, "ok"],
      ["Licenças", "Produto", "38.900", "38.900", "39.500", "39.500", "0", 0.0, "ok"],
      ["Infraestrutura", "Tecnologia", "−61.200", "−63.880", "−64.500", "−82.340", "−17.840", -27.7, "revisar"],
      ["Folha", "Pessoas", "−198.400", "−198.400", "−203.000", "−202.110", "890", 0.4, "ok"],
      ["Marketing", "Comercial", "−44.100", "−39.700", "−42.000", "−40.960", "1.040", 2.5, "ok"],
      ["Viagens", "Operações", "−8.300", "−11.250", "−9.000", "−9.870", "−870", -9.7, "ok"],
      ["Ferramentas", "Tecnologia", "−12.640", "−12.910", "−13.000", "−13.020", "−20", -0.2, "ok"],
      ["Consultoria", "Financeiro", "−15.000", "−0", "−7.500", "−7.500", "0", 0.0, "ok"],
      ["Impostos", "Financeiro", "−71.230", "−73.500", "−76.300", "−75.980", "320", 0.4, "ok"],
    ];
    const body = rows
      .map((r, i) => {
        const n = i + 4;
        const sel = i === 3;
        const pct = r[7];
        const bar = Math.min(100, Math.abs(pct) * 3.4);
        return `<tr class="${sel ? "is-flag" : ""}"><th>${n}</th>
          <td class="l">${r[0]}</td><td class="l dim">${r[1]}</td>
          <td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td>
          <td class="${r[6].startsWith("−") && r[6] !== "−0" ? "neg" : ""}${sel ? " is-sel" : ""}">${r[6]}</td>
          <td class="pct ${pct < 0 ? "neg" : ""}"><i style="--b:${bar}%"></i>${pct.toFixed(1).replace(".", ",")}%</td>
          <td class="l"><span class="st st--${r[8]}">${r[8]}</span></td></tr>`;
      })
      .join("");
    return h(`<div class="ctx ctx--sheet">
      <div class="s-title"><span>fechamento_marco.xlsx</span><span class="s-saved">Salvo</span>${winControls}</div>
      <div class="s-ribbon-tabs"><span>Arquivo</span><b>Página inicial</b><span>Inserir</span><span>Fórmulas</span><span>Dados</span><span>Revisão</span><span>Exibir</span></div>
      <div class="s-ribbon">
        ${icon("arrow-uturn-left")}${icon("arrow-uturn-right")}<i class="sep"></i>
        <span class="s-font">Inter</span><span class="s-size">10</span><b>N</b><em>I</em><u>S</u><i class="sep"></i>
        ${icon("paint-brush")}${icon("funnel")}${icon("table-cells")}${icon("chart-bar")}<i class="sep"></i>
        <span class="s-fmt">Contábil</span><span class="s-fmt">% 0,0</span>
      </div>
      <div class="s-formula"><b>G7</b><span class="fx">fx</span><span>=F7-E7</span></div>
      <div class="s-wrap">
      <table class="s-grid">
        <colgroup><col class="c0"><col class="c1"><col class="c2"><col><col><col><col><col class="c7"><col class="c8"><col class="c9"></colgroup>
        <thead><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th><th>G</th><th>H</th><th>I</th></tr></thead>
        <tbody>
          <tr class="s-head"><th>1</th><td class="l" colspan="9">Fechamento · março · valores em R$</td></tr>
          <tr class="s-cols"><th>2</th><td class="l">Conta</td><td class="l">Centro de custo</td><td>Jan</td><td>Fev</td><td>Mar previsto</td><td>Mar realizado</td><td>Diferença</td><td>Var.</td><td class="l">Status</td></tr>
          <tr><th>3</th><td colspan="9"></td></tr>
          ${body}
          <tr class="s-total"><th>14</th><td class="l">Resultado</td><td></td><td>126.450</td><td>149.610</td><td>149.200</td><td>133.950</td><td class="neg">−15.250</td><td class="pct neg"><i style="--b:34%"></i>−10,2%</td><td></td></tr>
        </tbody>
      </table>
      </div>
      <div class="s-sheets"><span>Resumo</span><b>Março</b><span>Q1</span><span>Premissas</span><span>+</span><span class="sp"></span><span>Soma: −17.840</span><span>100%</span></div>
    </div>`);
  },

  /* Uma apresentação em tela cheia. */
  slides: () => {
    const r = rng(5);
    const pts = (base, drift, seed) =>
      Array.from({ length: 12 }, (_, i) => [i * (100 / 11), base - i * drift - Math.sin(i + seed) * 3 - r() * 2]);
    const a = pts(62, 1.6, 1);
    const b = pts(58, 3.2, 3);
    b[8][1] = 17;
    const path = (p) => p.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    return h(`<div class="ctx ctx--slides">
      <div class="sl-page">
        <div class="sl-head"><p class="sl-kicker">Resultados · trimestre 3</p><p class="sl-n">07</p></div>
        <p class="sl-title">Retenção por coorte subiu, mas não em todas as regiões</p>
        <div class="sl-body">
          <div class="sl-chart">
            <svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
              ${[10, 25, 40, 55].map((y) => `<line x1="0" x2="100" y1="${y}" y2="${y}" class="grid"/>`).join("")}
              <path d="${path(a)}" class="ln a"/>
              <path d="${path(b)}" class="ln b"/>
              <circle cx="${b[8][0]}" cy="17" r="1.8" class="dot" data-flag/>
            </svg>
            <div class="sl-legend"><span><i class="a"></i>Sudeste</span><span><i class="b"></i>Nordeste</span></div>
            <span class="sl-callout" style="left:${b[8][0]}%;top:${(17 / 70) * 100}%">+18 p.p. em agosto</span>
          </div>
          <div class="sl-kpis">
            <div><b>61%</b><span>retenção em 90 dias</span></div>
            <div><b>+7 p.p.</b><span>contra o trimestre 2</span></div>
            <div><b>3,4×</b><span>retorno sobre aquisição</span></div>
          </div>
        </div>
        <p class="sl-foot"><span>Fonte: base interna · coortes de março a agosto de 2026</span><span>7 / 18</span></p>
      </div>
    </div>`);
  },

  /* Um vídeo sendo assistido. */
  video: () =>
    h(`<div class="ctx ctx--video">
      ${video("montanha")}
      <div class="v-bar">
        <span class="v-track"><em style="--v:.28"></em><i style="--x:.12"></i><i style="--x:.44"></i><i style="--x:.71"></i></span>
        <div class="v-row">${icon("play")}${icon("speaker-wave")}<span class="v-time">01:42 / 06:10</span><span class="v-chap">Subindo até o lago</span><span class="sp"></span>${icon("cog-6-tooth")}${icon("arrows-pointing-out")}</div>
      </div>
    </div>`),

  /* Um editor de vídeo, com trilhas. */
  timeline: () => {
    const clips = [
      ["video/galeria.jpg", 0, 17, "50% 40%"],
      ["images/estrada.jpg", 17.4, 14, "40% 50%"],
      ["video/roda.jpg", 31.8, 21, "70% 30%"],
      ["images/ipanema.jpg", 53.2, 12, "50% 60%"],
      ["video/montanha.jpg", 65.6, 18, "80% 50%"],
      ["images/vlog.jpg", 84, 16, "30% 50%"],
    ];
    return h(`<div class="ctx ctx--timeline">
      <div class="t-top">
        <div class="t-bin">
          <p>Mídia do projeto <span>14 itens</span></p>
          <div class="t-grid">${["video/galeria.jpg", "video/roda.jpg", "images/vlog.jpg", "video/montanha.jpg", "images/estrada.jpg", "images/rio.jpg"]
            .map((f, i) => `<span>${raw(f, `${30 + i * 8}% 50%`)}<b>C00${i + 12}.MP4</b></span>`)
            .join("")}</div>
        </div>
        <div class="t-viewer">${video("galeria", "50% 40%")}<span class="t-tc">00:01:42:08</span><div class="t-transport">${icon("arrow-uturn-left")}${icon("play")}${icon("arrow-uturn-right")}</div></div>
      </div>
      <div class="t-tools">${icon("scissors")}${icon("squares-2x2")}${icon("film")}${icon("musical-note")}<span class="sp"></span><span>Sequência 03 · 24 qps</span></div>
      <div class="t-tl">
        <div class="t-ruler">${["00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00"].map((t) => `<span>${t}</span>`).join("")}</div>
        <div class="t-track"><b class="lbl">V2</b><div class="lane"><i class="title" style="--x:4;--w:12">Título · praia</i><i class="title" style="--x:58;--w:10">Legenda</i></div></div>
        <div class="t-track tall"><b class="lbl">V1</b><div class="lane">${clips
          .map(([f, x, w, p]) => `<i class="clip" style="--x:${x};--w:${w}">${raw(f, p)}</i>`)
          .join("")}</div></div>
        <div class="t-track"><b class="lbl">A1</b><div class="lane"><i class="audio" style="--x:0;--w:52">${waveform(2)}</i><i class="audio" style="--x:53.2;--w:46.8">${waveform(9)}</i></div></div>
        <div class="t-track"><b class="lbl">A2</b><div class="lane"><i class="audio music" style="--x:0;--w:100">${waveform(4, 140)}</i></div></div>
        <span class="t-head" style="--x:41"></span>
        <span class="t-mark" style="--x:28"></span><span class="t-mark" style="--x:66"></span>
      </div>
    </div>`);
  },

  /* Um documento sendo lido. */
  text: () =>
    h(`<div class="ctx ctx--text">
      <div class="d-bar">${icon("arrow-uturn-left")}${icon("arrow-uturn-right")}<span>Normal</span><b>N</b><em>I</em><span class="sp"></span><span>Comentários (2)</span></div>
      <div class="d-scroll">
        <div class="d-page">
          <p class="d-h">Contrato de prestação de serviços</p>
          <p class="d-sub">Versão 3 · revisão jurídica</p>
          <p><b>4.</b> O prazo de entrega será contado a partir da aprovação do escopo, e qualquer alteração posterior será registrada por escrito pelas duas partes.</p>
          <p><b>5.</b> Os arquivos produzidos durante o projeto pertencem à contratante a partir do pagamento integral, <mark>incluindo versões intermediárias</mark>.</p>
          <p><b>6.</b> A rescisão pode ser solicitada por qualquer das partes, com aviso prévio de trinta dias, sem multa.</p>
          <p><b>7.</b> Casos omissos serão resolvidos no foro da comarca da contratante.</p>
        </div>
        <div class="d-note"><b>Júlia</b>Isso inclui os brutos?</div>
      </div>
    </div>`),

  /* Um painel de cobrança num navegador. */
  browser: () =>
    h(`<div class="ctx ctx--browser">
      <div class="b-chrome">
        <span class="b-tab on">Plano e cobrança · Órbita</span><span class="b-tab">Documentação</span><span class="b-tab">Status</span>
        ${winControls}
      </div>
      <div class="b-bar"><span class="b-nav">‹ › ${icon("arrow-path")}</span><span class="b-url">${icon("lock-closed")}app.orbita.com.br/configuracoes/plano</span><span class="b-ext"></span></div>
      <div class="b-app">
        <nav class="b-side">
          <span class="b-logo"><i></i>Órbita</span>
          <span>${icon("home")}Início</span><span>${icon("chart-bar")}Relatórios</span><span>${icon("users")}Equipe</span>
          <span class="on">${icon("credit-card")}Plano e cobrança</span><span>${icon("cog-6-tooth")}Configurações</span>
        </nav>
        <div class="b-main">
          <div class="b-head"><div><p class="b-h">Plano e cobrança</p><p class="b-sub">Você está no plano Equipe, renovado todo dia 12.</p></div><span class="b-user">${icon("bell")}<i>MC</i></span></div>
          <div class="b-plans">
            <div class="b-plan"><p>Inicial</p><b>R$ 0</b><span>3 projetos</span><span>1 GB</span></div>
            <div class="b-plan on"><p>Equipe <em>atual</em></p><b>R$ 89</b><span>Projetos ilimitados</span><span>50 GB</span></div>
            <div class="b-plan"><p>Empresa</p><b>R$ 249</b><span>SSO e auditoria</span><span>1 TB</span><span class="b-btn" data-flag>Atualizar plano</span></div>
          </div>
          <div class="b-usage">
            <p>Uso neste ciclo</p>
            <div><span>Armazenamento</span><em style="--v:.72"></em><b>36 de 50 GB</b></div>
            <div><span>Membros</span><em style="--v:.9"></em><b>9 de 10</b></div>
          </div>
          <table class="b-table">
            <tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Status</th></tr>
            <tr><td>12 set</td><td>Plano Equipe · setembro</td><td>R$ 89,00</td><td><span class="ok">Pago</span></td></tr>
            <tr><td>12 ago</td><td>Plano Equipe · agosto</td><td>R$ 89,00</td><td><span class="ok">Pago</span></td></tr>
            <tr><td>12 jul</td><td>Plano Equipe · julho</td><td>R$ 89,00</td><td><span class="ok">Pago</span></td></tr>
          </table>
        </div>
      </div>
    </div>`),

  /* Uma chamada de vídeo. */
  meeting: () => {
    const people = [
      ["Ana Ribeiro", "pessoa-3.jpg", true],
      ["Rafael Souza", "pessoa-1.jpg"],
      ["Tiago Martins", "pessoa-6.jpg"],
      ["Caio Nunes", "pessoa-4.jpg"],
      ["Marcos Lima", "pessoa-5.jpg"],
      ["Diego Alves", "pessoa-2.jpg"],
    ];
    return h(`<div class="ctx ctx--meeting">
      <div class="m-top"><span class="m-rec"><i></i>Gravando</span><b>Revisão semanal · produto</b><span class="sp"></span><span>${icon("users")}7</span><span>32:14</span></div>
      <div class="m-grid">${people
        .map(
          ([n, f, speaking]) =>
            `<div class="m-tile ${speaking ? "is-speaking" : ""}">${img(f, "", "50% 35%")}<span>${speaking ? icon("speaker-wave") : ""}${n}</span></div>`
        )
        .join("")}</div>
      <div class="m-bar">
        <span>${icon("microphone")}</span><span>${icon("video-camera")}</span><span>${icon("computer-desktop")}</span><span>${icon("hand-raised")}</span><span>${icon("face-smile")}</span><span>${icon("chat-bubble-left-right")}</span><span>${icon("ellipsis-horizontal")}</span><span class="m-leave">${icon("phone-x-mark")}</span>
      </div>
    </div>`);
  },

  /* O que a webcam vê. */
  camera: () =>
    h(`<div class="ctx ctx--camera">
      ${img("pessoa-3.jpg", "", "50% 30%")}
      <span class="cam-rec"><i></i>REC <b class="cam-time">00:12</b></span>
      <span class="cam-meta">Câmera · 1080p</span>
    </div>`),

  /* Uma resposta sendo avaliada, num assistente de texto qualquer. */
  answer: () =>
    h(`<div class="ctx ctx--answer">
      <aside class="a-side">
        <span class="a-new">${icon("plus")}Nova conversa</span>
        <p>Hoje</p><span class="on">Resumo de março para a diretoria</span><span>Tabela de reajustes</span>
        <p>Ontem</p><span>E-mail para fornecedores</span><span>Revisar contrato</span><span>Roteiro do vídeo</span>
      </aside>
      <div class="a-main">
        <div class="a-msg a-user">Resuma o relatório de março para a diretoria. Cinco tópicos, com os números.</div>
        <div class="a-msg a-bot">
          <p><b>Resumo · março</b></p>
          <p>O resultado do mês ficou em <b>R$ 133,9 mil</b>, 10,2% abaixo do previsto. A diferença se concentra em infraestrutura.</p>
          <ul>
            <li><b>Receita recorrente:</b> R$ 428,4 mil, praticamente em linha com a meta.</li>
            <li><b>Serviços:</b> 3% acima do previsto, puxados por dois contratos novos.</li>
            <li><b>Infraestrutura:</b> R$ 17,8 mil acima do orçamento, por causa da migração de servidores.</li>
            <li><b>Folha e impostos:</b> dentro do esperado.</li>
            <li><b>Próximo passo:</b> renegociar o contrato de nuvem antes de maio.</li>
          </ul>
          <p class="a-tools">${icon("document-duplicate")}${icon("arrow-path")}</p>
        </div>
        <div class="a-input"><span>Escreva uma mensagem…</span>${icon("paper-airplane")}</div>
      </div>
    </div>`),
};

export function buildContext(type) {
  const make = builders[type];
  if (!make) throw new Error(`Contexto desconhecido: ${type}`);
  const el = make();
  el.setAttribute("aria-hidden", "true");
  for (const v of el.querySelectorAll("video")) videoWatcher.observe(v);
  return el;
}

/** Preenche todo elemento com `data-ctx` com o contexto correspondente. */
export function fillContexts(root = document) {
  for (const slot of root.querySelectorAll("[data-ctx]")) {
    if (slot.firstElementChild) continue;
    slot.appendChild(buildContext(slot.dataset.ctx));
  }
}
