/**
 * Harp · site
 *
 * A rolagem é o tempo das cenas: cada seção alta tem um palco preso na tela, e
 * o quanto dela já passou (0 a 1) decide o estado do palco.
 *
 * No computador, a página anda por trechos: cada gesto da roda, cada seta do
 * teclado ou cada clique no botão leva ao próximo ponto de repouso, numa
 * velocidade que deixa a animação acontecer, e para ali. Rolar livremente
 * obrigava a acertar a distância no olho: devagar demais parecia travado,
 * rápido demais pulava a cena. A barra de rolagem continua funcionando.
 *
 * O laço de animação só roda enquanto há algo mudando e para sozinho depois.
 */

import { fillContexts, buildContext } from "./contexts.js";
import { icon } from "./icons.js";

const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const modeQuery = matchMedia("(prefers-reduced-motion: reduce), (max-width: 760px)");
const isStatic = () => root.classList.contains("static");

/* Elementos cujo estilo inline foi escrito pelo laço. Ao trocar de modo, eles
   voltam ao estilo original do HTML. */
const touched = new Map();
function css(el, props) {
  if (!el) return;
  if (!touched.has(el)) touched.set(el, el.getAttribute("style") || "");
  for (const k in props) {
    if (k.startsWith("--")) el.style.setProperty(k, props[k]);
    else el.style[k] = props[k];
  }
}

function resetTouched() {
  for (const [el, base] of touched) {
    if (base) el.setAttribute("style", base);
    else el.removeAttribute("style");
  }
  touched.clear();
}

/* --- Escrita --------------------------------------------------------------- */

/**
 * Digita `text` chamando `set(parcial)`, num ritmo irregular de pessoa.
 * Devolve uma função que cancela. O cursor fica aceso enquanto digita.
 */
function typeText(text, set, { caret, delay = 0, onDone, fast = false } = {}) {
  let i = 0;
  let timer = 0;
  let cancelled = false;
  caret?.classList.add("is-typing");
  const step = () => {
    if (cancelled) return;
    i += 1;
    set(text.slice(0, i));
    if (i >= text.length) {
      caret?.classList.remove("is-typing");
      onDone?.();
      return;
    }
    const ch = text[i - 1];
    const pause = ch === " " ? 70 : ch === "\n" ? 420 : ch === "." || ch === "," ? 160 : 0;
    timer = setTimeout(step, (fast ? 30 : 42) + Math.random() * (fast ? 38 : 62) + (fast ? pause * 0.6 : pause));
  };
  timer = setTimeout(step, delay);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    caret?.classList.remove("is-typing");
  };
}

const makeCaret = () => {
  const c = document.createElement("span");
  c.className = "caret caret--inline";
  c.setAttribute("aria-hidden", "true");
  return c;
};

/**
 * Um texto exibido (não editável) que pode ser digitado na hora: texto +
 * cursor no fim. O texto inteiro fica para leitores de tela desde o início.
 */
function makeTyped(el) {
  const full = el.textContent.replace(/^\s+|\s+$/g, "");
  el.textContent = "";
  const text = document.createElement("span");
  text.className = "typed";
  text.setAttribute("aria-hidden", "true");
  const caret = makeCaret();
  el.append(text, caret);
  el.setAttribute("aria-label", full);
  el.setAttribute("role", "text");
  const t = {
    full,
    el,
    caret,
    state: "empty",
    cancel: null,
    show() {
      t.cancel?.();
      text.textContent = full;
      t.state = "done";
    },
    type(delay = 250, fast = false) {
      return new Promise((resolve) => {
        if (t.state !== "empty") return resolve();
        t.state = "typing";
        t.cancel = typeText(full, (s) => (text.textContent = s), {
          caret,
          delay,
          fast,
          onDone: () => {
            t.state = "done";
            resolve();
          },
        });
      });
    },
    clear() {
      t.cancel?.();
      text.textContent = "";
      t.state = "empty";
    },
  };
  return t;
}

/* --- Teclas em ação ----------------------------------------------------------
   Nas situações, o atalho aparece no canto da tela no momento em que ele é
   dado: ler "Win+Alt+V" numa legenda não é a mesma coisa que ver a tecla
   afundar e a tela responder. */

function makeKeys(frame) {
  const box = document.createElement("div");
  box.className = "keys";
  box.setAttribute("aria-hidden", "true");
  frame.appendChild(box);
  let timer = 0;
  return {
    /** Mostra o atalho, afunda as teclas, e some sozinho. */
    press(combo, hold = 1500) {
      clearTimeout(timer);
      box.innerHTML = combo
        .split("+")
        .map((k) => `<kbd>${k}</kbd>`)
        .join('<i>+</i>');
      box.classList.remove("is-on", "is-down");
      void box.offsetWidth;
      box.classList.add("is-on");
      requestAnimationFrame(() => box.classList.add("is-down"));
      timer = setTimeout(() => box.classList.remove("is-on", "is-down"), hold);
    },
    clear() {
      clearTimeout(timer);
      box.classList.remove("is-on", "is-down");
    },
  };
}

/* --- A janela do Harp, como no app ------------------------------------------
   Abas recolhidas (só o ícone; a ativa na cor de destaque) e a barra de baixo a
   35%: "Topo" à esquerda; opacidade, tamanho do texto e os três controles à
   direita. */

function harpChrome(harp) {
  const tabs = (harp.dataset.tabs || "").split(",").filter(Boolean);
  if (tabs.length && !$(".harp__top", harp)) {
    const top = document.createElement("div");
    top.className = "harp__top";
    top.setAttribute("aria-hidden", "true");
    top.innerHTML = tabs.map((t, i) => `<span class="harp__tab${i === 0 ? " is-on" : ""}">${icon(t)}</span>`).join("");
    harp.prepend(top);
  }
  if (harp.dataset.status && !$(".harp__status", harp)) {
    const st = document.createElement("div");
    st.className = "harp__status";
    st.setAttribute("aria-hidden", "true");
    st.innerHTML = `<span class="chip is-on"><i></i>Topo</span><span class="harp__status-right"><span class="h-op">${harp.dataset.status}</span><span>A− 15 A+</span><span>···</span><span>⚙</span><span>?</span></span>`;
    harp.append(st);
  }
}

/* Os contextos precisam existir antes das cenas procurarem o que há neles. */
fillContexts();

/* --- Mouse: profundidade mínima -------------------------------------------- */

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener(
  "pointermove",
  (e) => {
    if (e.pointerType !== "mouse") return;
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / innerHeight) * 2 - 1;
    kick();
  },
  { passive: true }
);

/* --- Header ---------------------------------------------------------------- */

const header = $("#site-header");
let headerTimer = 0;
let lastScroll = scrollY;

function showHeader(autoHide = true) {
  header.classList.remove("is-hidden");
  clearTimeout(headerTimer);
  if (autoHide && scrollY > 80) {
    headerTimer = setTimeout(() => {
      if (!header.matches(":hover, :focus-within") && scrollY > 80) header.classList.add("is-hidden");
    }, 2600);
  }
}

function onScrollHeader() {
  const y = scrollY;
  if (y < 80) showHeader(false);
  else if (y > lastScroll + 4 && !header.matches(":focus-within")) header.classList.add("is-hidden");
  lastScroll = y;
}

let lastMove = 0;
addEventListener(
  "mousemove",
  () => {
    const now = performance.now();
    if (now - lastMove < 200) return;
    lastMove = now;
    showHeader();
  },
  { passive: true }
);
header.addEventListener("focusin", () => showHeader(false));
header.addEventListener("focusout", () => showHeader());

/* --- Cor de destaque ---------------------------------------------------------
   O app tem sete; o site passa pelas duas principais, menta e roxo, conforme a
   seção que ocupa o meio da tela. A troca é uma transição lenta no CSS. */

function setupAccent() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) root.dataset.accent = e.target.dataset.accent;
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  $$("[data-accent]").forEach((el) => io.observe(el));
}

/* --- Cenas ----------------------------------------------------------------- */

const scenes = [];

function scene(name, setup) {
  const el = $(`[data-scene="${name}"]`);
  if (!el) return;
  // O mesmo objeto que a cena devolve: ela pode atualizar as próprias paradas
  // ao medir (o teleprompter depende de quantas linhas o texto ocupa).
  const s = Object.assign(setup(el), { el, name, top: 0, total: 1, raw: 0, ready: false });
  s.beats ??= [];
  scenes.push(s);
}

function measure() {
  for (const s of scenes) {
    const r = s.el.getBoundingClientRect();
    s.top = r.top + scrollY;
    s.total = Math.max(1, s.el.offsetHeight - innerHeight);
    s.measure?.();
  }
  computeBeats();
}

/* 01 · A página em branco, a tela que deixa de ser folha, o Harp, a opacidade */
scene("origem", (el) => {
  const world = $("#world", el);
  const sheet = $(".sheet", el);
  const hero = $(".hero", el);
  const tagline = $(".tagline", el);
  const words = $$(".phrase .w", el);
  const folha = $(".folha", el);
  const name = $(".harp-name", el);
  const writer = $("#writer", el);
  const caps = $$(".captions p", el);
  const pad = $("#pad", el);
  const mirror = $(".pad-mirror", el);
  const caret = $(".caret--free", el);
  harpChrome(writer);
  const opOut = $(".h-op", writer);

  /* Fragmentos de uma grande tela de trabalho, em profundidades diferentes.
     x/y: centro em % do palco; w: largura em vw; d: profundidade (1 = perto);
     r: quando aparece. Nenhum fica exatamente atrás da linha de escrita, para
     nada dele parecer parte do campo. */
  const layout = [
    { t: "browser", x: 55, y: 28, w: 36, d: 0.42, r: 0.05 },
    { t: "code", x: 19, y: 27, w: 29, d: 0.72, r: 0.07 },
    { t: "photo", x: 81, y: 22, w: 22, d: 0.52, r: 0.09, ar: "3 / 2" },
    { t: "sheet", x: 79, y: 74, w: 28, d: 0.82, r: 0.1 },
    { t: "timeline", x: 20, y: 76, w: 28, d: 0.6, r: 0.12 },
    { t: "slides", x: 55, y: 90, w: 20, d: 0.3, r: 0.13, ar: "16 / 9" },
    { t: "text", x: 94, y: 48, w: 15, d: 0.26, r: 0.14, ar: "3 / 4" },
    { t: "meeting", x: 45, y: 7, w: 22, d: 0.22, r: 0.15, ar: "16 / 9" },
    { t: "camera", x: 4, y: 52, w: 15, d: 0.64, r: 0.16, ar: "4 / 3" },
    { t: "3d", x: 36, y: 97, w: 24, d: 0.9, r: 0.17, ar: "16 / 9" },
  ];
  const frags = layout.map((f) => {
    const node = document.createElement("div");
    node.className = "frag" + (f.d < 0.35 ? " frag--far" : "");
    node.style.cssText = `--x:${f.x};--y:${f.y};--w:${f.w};--ar:${f.ar || "16 / 10"};--o:${(0.4 + 0.55 * f.d).toFixed(2)}`;
    node.appendChild(buildContext(f.t));
    world.appendChild(node);
    return { ...f, el: node, max: 0.4 + 0.55 * f.d };
  });

  /* O cursor desenhado. O nativo não pisca devagar nem tem a cor da marca, e
     este é o elemento mais constante da identidade. Um espelho do campo mede
     onde ele deve ficar, e também se o texto ainda cabe na linha. */
  const marker = document.createElement("span");
  marker.textContent = "​";
  const lineH = () => parseFloat(getComputedStyle(pad).lineHeight) || 25.6;
  function placeCaret() {
    const focused = document.activeElement === pad;
    const collapsed = pad.selectionStart === pad.selectionEnd || !focused;
    const at = focused ? pad.selectionStart : pad.value.length;
    mirror.textContent = pad.value.slice(0, at);
    mirror.appendChild(marker);
    css(caret, {
      transform: `translate(${marker.offsetLeft}px, ${marker.offsetTop}px)`,
      visibility: collapsed ? "visible" : "hidden",
    });
  }
  const fits = (v) => {
    mirror.textContent = v || "​";
    return mirror.scrollHeight <= lineH() * 1.4;
  };

  /* Uma linha só: sem Enter, e o texto para no fim da linha. */
  let accepted = "";
  let acceptedSel = 0;
  pad.addEventListener("beforeinput", (e) => {
    if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") e.preventDefault();
    accepted = pad.value;
    acceptedSel = pad.selectionStart;
  });
  let typingTimer = 0;
  pad.addEventListener("input", () => {
    cancelAuto?.();
    let v = pad.value.replace(/[\r\n]+/g, " ");
    if (!fits(v)) {
      v = accepted;
      pad.value = v;
      pad.setSelectionRange(acceptedSel, acceptedSel);
    } else if (v !== pad.value) pad.value = v;
    caret.classList.add("is-typing");
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => caret.classList.remove("is-typing"), 600);
    placeCaret();
  });
  for (const ev of ["keyup", "click", "select", "focus", "blur"]) pad.addEventListener(ev, placeCaret);
  document.addEventListener("selectionchange", () => document.activeElement === pad && placeCaret());
  pad.addEventListener("focus", () => cancelAuto?.());

  /* A frase aparece sozinha depois de alguns segundos, como se estivesse ali
     o tempo todo. */
  setTimeout(() => {
    tagline.classList.add("is-visible");
    stepButton.reveal();
  }, 2200);

  let autoTyped = false;
  let cancelAuto = null;
  function autoType() {
    if (autoTyped || pad.value || document.activeElement === pad) return;
    autoTyped = true;
    cancelAuto = typeText(
      "Repensar a escrita na tela",
      (s) => {
        pad.value = s;
        placeCaret();
      },
      { caret, delay: 450 }
    );
  }

  let lastOp = "";
  return {
    beats: [0, 0.24, 0.41, 0.62, 0.73, 0.85, 0.97],
    measure: placeCaret,
    enterStatic() {
      pad.placeholder = "Escreva aqui…";
      if (!pad.value) {
        pad.value = "Revisar isso depois";
        autoTyped = true;
      }
      placeCaret();
    },
    update(p) {
      const vw = innerWidth;
      const vh = innerHeight;

      css(hero, { opacity: 1 - seg(p, 0.01, 0.05) });

      // A folha: primeiro o contexto aparece dentro dela, depois ela se abre.
      const pageH = vh * 0.74;
      const pageW = Math.min(vw * 0.42, pageH * 0.72);
      const open = ease(seg(p, 0.28, 0.4));
      const ix = lerp((vw - pageW) / 2, -60, open);
      const iy = lerp((vh - pageH) / 2, -60, open);
      const phraseIn = seg(p, 0.27, 0.31) * (1 - seg(p, 0.45, 0.5));
      css(world, {
        clipPath: `inset(${iy.toFixed(1)}px ${ix.toFixed(1)}px round ${lerp(3, 0, open).toFixed(1)}px)`,
        opacity: 1 - 0.5 * phraseIn,
      });
      css(sheet, {
        width: `${vw - ix * 2}px`,
        height: `${vh - iy * 2}px`,
        opacity: seg(p, 0.03, 0.09) * (1 - open),
      });

      const mx = pointer.x;
      const my = pointer.y;
      // Dentro da folha, as telas ficam encolhidas e juntas: é uma página
      // cheia, como a de um bloco de notas. Quando a folha se abre, elas voltam
      // ao tamanho e ao lugar que teriam numa tela de verdade, e continuam se
      // afastando depois disso.
      // Fechada, a folha puxa tudo para o centro (a coluna estreita de uma
      // página); aberta, cada tela volta ao seu lugar na tela inteira.
      const pullX = lerp(-0.6, 0, open);
      const pullY = lerp(-0.34, 0, open);
      const tight = lerp(0.5, 1, open);
      // Quando a janela fica transparente, o que está atrás ganha presença.
      const behind = 1 + 0.45 * seg(p, 0.72, 0.9);
      for (const f of frags) {
        const rv = easeOut(seg(p, f.r, f.r + 0.06));
        const spread = open * (0.1 + 0.28 * f.d);
        const dx = ((f.x / 100) * vw - vw / 2) * (pullX + spread) + mx * f.d * 16;
        const dy = ((f.y / 100) * vh - vh / 2) * (pullY + spread) + my * f.d * 10 + (1 - rv) * 36 * f.d;
        const s = tight * (0.9 + 0.14 * f.d) * (0.97 + 0.03 * rv);
        css(f.el, {
          transform: `translate(-50%, -50%) translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${s.toFixed(4)})`,
          opacity: Math.min(1, rv * f.max * behind).toFixed(3),
        });
      }

      // "A tela não é uma folha."
      const out = ease(seg(p, 0.45, 0.5));
      words.forEach((w, i) => {
        const a = 0.27 + i * 0.022;
        const v = easeOut(seg(p, a, a + 0.05));
        css(w, {
          opacity: (v * (1 - out)).toFixed(3),
          transform: `translateY(${((1 - v) * 26 - out * 34).toFixed(1)}px)`,
          filter: `blur(${((1 - v) * 8 + out * 6).toFixed(2)}px)`,
        });
      });
      // A palavra se abre junto com a composição.
      css(folha, { letterSpacing: `${lerp(-0.01, 0.07, open).toFixed(4)}em` });

      css(name, { opacity: seg(p, 0.49, 0.53) * (1 - seg(p, 0.66, 0.7)) });

      // A linha vira janela.
      const wf = ease(seg(p, 0.52, 0.6));
      // O fundo da janela só existe depois que ela vira janela.
      pad.placeholder = wf > 0.6 ? "Escreva aqui…" : "";
      if (p > 0.57) autoType();

      // A janela chega opaca, como a página em branco de sempre: ela cobre o
      // que estava ali. Depois deixa o contexto passar, some quase por
      // completo, e volta a um meio-termo. O texto nunca muda; só o fundo.
      let op = lerp(1, 0.5, ease(seg(p, 0.705, 0.775)));
      op = lerp(op, 0.2, ease(seg(p, 0.805, 0.865)));
      op = lerp(op, 0.68, ease(seg(p, 0.92, 0.965)));
      const label = `${Math.round(op * 100)}%`;
      if (label !== lastOp && opOut) opOut.textContent = lastOp = label;
      css(writer, {
        "--wf": wf.toFixed(4),
        "--ha": op.toFixed(3),
        transform: `translate(calc(-50% + ${(mx * 3).toFixed(1)}px), calc(-50% + ${(lerp(98, 0, wf) + my * 2).toFixed(1)}px))`,
      });

      const c = [
        seg(p, 0.62, 0.66) * (1 - seg(p, 0.75, 0.78)),
        seg(p, 0.79, 0.83) * (1 - seg(p, 0.885, 0.91)),
        seg(p, 0.92, 0.95),
      ];
      caps.forEach((cap, i) =>
        css(cap, { opacity: c[i].toFixed(3), transform: `translate(-50%, ${((1 - c[i]) * 10).toFixed(1)}px)` })
      );
    },
  };
});

/* 02 · Situações: o contexto primeiro, o Harp depois */

/* Vidro: moldura, barra de ferramentas, retângulo em volta do botão, seta e a
   etiqueta; depois o "copiar", e o Vidro sai. */
function vidroScene(sit) {
  const vd = $(".vd", sit.el);
  const hud = $(".vd__hud", vd);
  hud.innerHTML = `<i class="vd__grip"></i>
    <span class="vd__tool">T</span>
    <span class="vd__tool"><svg viewBox="0 0 16 16"><path d="M3 13 13 3M6.5 3H13v6.5"/></svg></span>
    <span class="vd__tool is-on"><svg viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="9" rx="1.8"/></svg></span>
    <span class="vd__tool"><svg viewBox="0 0 16 16"><ellipse cx="8" cy="8" rx="5.5" ry="4.8"/></svg></span>
    <i class="vd__sep"></i><span class="vd__swatch"></span><i class="vd__sep"></i>
    <span class="vd__finish">Copiar <kbd>Ctrl+Shift+Enter</kbd></span>`;
  const rects = $$(".vd__rect", vd);
  const lines = $$(".vd__line", vd);
  const head = $(".vd__head", vd);
  const label = makeTyped($(".vd__label", vd));

  function place() {
    const flag = $("[data-flag]", sit.frame);
    if (!flag) return;
    const fr = sit.frame.getBoundingClientRect();
    const r = flag.getBoundingClientRect();
    if (!fr.width) return;
    const k = 1000 / fr.width;
    const x = (r.left - fr.left) * k - 12;
    const y = (r.top - fr.top) * k - 10;
    const w = r.width * k + 24;
    const hh = r.height * k + 20;
    rects.forEach((el) => {
      el.setAttribute("x", x.toFixed(1));
      el.setAttribute("y", y.toFixed(1));
      el.setAttribute("width", w.toFixed(1));
      el.setAttribute("height", hh.toFixed(1));
      el.setAttribute("rx", "7");
    });
    // A seta sai da etiqueta, embaixo à esquerda, e aponta para o canto do retângulo.
    const x2 = x - 6;
    const y2 = y + hh + 6;
    const x1 = x - 92;
    const y1 = y + hh + 70;
    const d = `M${x1} ${y1} L${x2} ${y2}`;
    lines.forEach((el) => el.setAttribute("d", d));
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const L = 16;
    const W = 7;
    const bx = x2 - Math.cos(ang) * L;
    const by = y2 - Math.sin(ang) * L;
    const nx = -Math.sin(ang) * W;
    const ny = Math.cos(ang) * W;
    head.setAttribute("d", `M${x2} ${y2} L${bx + nx} ${by + ny} L${bx - nx} ${by - ny}Z`);
    css(label.el, { right: `${(100 - (x1 + 20) / 10).toFixed(2)}%`, top: `${((y1 + 6) / 6.25).toFixed(2)}%` });
  }

  const keys = makeKeys(sit.frame);
  let run = 0;
  return {
    loops: true,
    place,
    async play() {
      const id = ++run;
      place();
      keys.press("Win+Alt+V", 1400);
      await wait(360);
      if (id !== run) return;
      vd.classList.add("is-on");
      await wait(550);
      if (id !== run) return;
      vd.classList.add("is-rect");
      await wait(750);
      if (id !== run) return;
      vd.classList.add("is-arrow");
      await wait(450);
      if (id !== run) return;
      vd.classList.add("is-label");
      await label.type(0);
      await wait(900);
      if (id !== run) return;
      keys.press("Ctrl+Shift+Enter", 1300);
      await wait(420);
      if (id !== run) return;
      vd.classList.add("is-copy");
      await wait(260);
      if (id !== run) return;
      vd.classList.add("is-flash");
      await wait(240);
      if (id !== run) return;
      vd.classList.add("is-gone");
      sit.el.classList.add("is-after");
    },
    reset() {
      run++;
      keys.clear();
      vd.className = "vd";
      label.clear();
      sit.el.classList.remove("is-after");
    },
    showStatic() {
      place();
      vd.classList.add("is-on", "is-rect", "is-arrow", "is-label");
      label.show();
    },
  };
}

/* Rascunho: o campo abre no canto, recebe uma frase, Enter, e some. */
function jotScene(sit) {
  const jot = $(".jot", sit.el);
  const field = makeTyped($(".jot__field", jot));
  field.el.dataset.placeholder = "Rascunho rápido…";
  const keys = makeKeys(sit.frame);
  let run = 0;
  return {
    loops: true,
    async play() {
      const id = ++run;
      keys.press("Win+J", 1200);
      await wait(320);
      if (id !== run) return;
      jot.classList.add("is-open");
      await field.type(600, true);
      await wait(700);
      if (id !== run) return;
      keys.press("Enter", 1100);
      await wait(360);
      if (id !== run) return;
      jot.classList.add("is-sent");
      sit.el.classList.add("is-after");
    },
    reset() {
      run++;
      keys.clear();
      jot.classList.remove("is-open", "is-sent");
      field.clear();
      sit.el.classList.remove("is-after");
    },
    showStatic() {
      jot.classList.add("is-open");
      field.show();
    },
  };
}

/* Anotação comum; no pedido, depois de escrito, "copiar tudo e limpar" leva o
   texto para o campo da conversa. */
function noteScene(sit) {
  const harp = $(".harp--note", sit.el);
  harpChrome(harp);
  const note = makeTyped($(".note", sit.el));
  const isPrompt = sit.el.dataset.kind === "prompt";
  const input = isPrompt ? $(".a-input span", sit.el) : null;
  const original = input?.textContent;
  const keys = makeKeys(sit.frame);
  const call = harp.dataset.keys;
  // A anotação pode viver numa aba que não é a primeira: a troca acontece na
  // frente de quem olha, como aconteceria no app.
  const tabTo = Number(sit.el.dataset.tabTo || 0);
  const tabs = $$(".harp__tab", harp);
  const setTab = (i) => tabs.forEach((t, k) => t.classList.toggle("is-on", k === i));
  let run = 0;
  return {
    harp,
    loops: isPrompt || !!tabTo,
    async play() {
      const id = ++run;
      if (call) {
        keys.press(call, 1300);
        await wait(460);
        if (id !== run) return;
      }
      if (tabTo) {
        await wait(650);
        if (id !== run) return;
        keys.press("Ctrl+" + tabTo, 1200);
        await wait(360);
        if (id !== run) return;
        setTab(tabTo - 1);
        await wait(380);
        if (id !== run) return;
      }
      await note.type(300, isPrompt);
      if (id !== run) return;
      sit.el.classList.add("is-noted");
      if (!isPrompt) return;
      await wait(1100);
      if (id !== run) return;
      keys.press("Ctrl+Shift+Enter", 1200);
      await wait(400);
      if (id !== run) return;
      note.clear();
      note.state = "done";
      input.textContent = note.full.split(String.fromCharCode(10)).join(" ");
      input.parentElement.classList.add("is-filled");
      sit.el.classList.add("is-after");
    },
    reset() {
      run++;
      keys.clear();
      note.clear();
      setTab(0);
      sit.el.classList.remove("is-noted", "is-after");
      if (input) {
        input.textContent = original;
        input.parentElement.classList.remove("is-filled");
      }
    },
    showStatic() {
      note.show();
      if (tabTo) setTab(tabTo - 1);
      sit.el.classList.add("is-noted");
    },
  };
}

/* Enquanto a pessoa fica parada numa situação, a demonstração se repete: quem
   chegou no meio vê de novo desde o começo. */
async function runDemo(s) {
  const token = (s.token = {});
  while (s.played && s.token === token) {
    await s.demo.play();
    if (!s.demo.loops) return;
    await wait(2600);
    if (!s.played || s.token !== token) return;
    s.demo.reset();
    await wait(700);
  }
}

scene("situacoes", (el) => {
  const sits = $$(".sit", el).map((node) => {
    const sit = { el: node, frame: $(".sit__frame", node), text: $(".sit__text", node), played: false };
    const kind = node.dataset.kind;
    sit.demo = kind === "vidro" ? vidroScene(sit) : kind === "jot" ? jotScene(sit) : noteScene(sit);
    return sit;
  });
  const n = sits.length;
  return {
    beats: sits.map((_, i) => (i + 0.5) / n),
    measure() {
      sits.forEach((s) => s.demo.place?.());
    },
    enterStatic() {
      sits.forEach((s) => s.demo.showStatic());
    },
    update(p, raw) {
      const P = raw * n;
      sits.forEach((s, i) => {
        const t = P - i;
        const enter = easeOut(seg(t, i === 0 ? -0.9 : -0.2, i === 0 ? -0.1 : 0.1));
        const exit = i === n - 1 ? 0 : ease(seg(t, 0.84, 1.08));
        const vis = enter * (1 - exit);
        css(s.el, { opacity: vis.toFixed(3), visibility: vis < 0.01 ? "hidden" : "visible" });
        css(s.frame, {
          transform: `translate3d(${((1 - enter) * 5 - exit * 4).toFixed(2)}vw, 0, 0) scale(${(0.965 + 0.035 * enter - 0.02 * exit).toFixed(4)})`,
        });
        const cap = seg(t, 0.02, 0.14);
        css(s.text, { opacity: cap.toFixed(3), transform: `translateY(${((1 - cap) * 10).toFixed(1)}px)` });
        const hv = easeOut(seg(t, 0.3, 0.42));
        if (s.demo.harp) {
          css(s.demo.harp, {
            opacity: hv.toFixed(3),
            transform: `translate3d(${(pointer.x * 3).toFixed(1)}px, ${((1 - hv) * 14 + pointer.y * 2).toFixed(1)}px, 0)`,
          });
        }
        // A demonstração roda quando a situação chega e recomeça se a pessoa
        // voltar a ela depois de sair.
        if (hv > 0.5 && t < 1 && !s.played) {
          s.played = true;
          runDemo(s);
        } else if ((t < 0.05 || t > 1.2) && s.played) {
          s.played = false;
          s.demo.reset();
        }
      });
    },
  };
});

/* 03 · O texto acompanha o olhar: três linhas no topo, perto da câmera */
scene("prompter", (el) => {
  const band = $("#prompter", el);
  const text = $(".prompter__text", el);
  const caption = $(".prompter__caption-wrap", el);
  const rec = $(".rec-view", el);
  let lh = 30;
  let lines = 1;

  // Relógio da gravação: só anda enquanto a cena está na tela.
  const clocks = $$(".cam-time", el);
  let seconds = 12;
  let clock = 0;
  new IntersectionObserver(([e]) => {
    clearInterval(clock);
    if (e.isIntersecting && !isStatic()) {
      clock = setInterval(() => {
        seconds += 1;
        const t = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
        clocks.forEach((c) => (c.textContent = t));
      }, 1000);
    }
  }).observe(el);

  const s = {
    beats: [0.05],
    measure() {
      lh = parseFloat(getComputedStyle(text).lineHeight) || 30;
      lines = Math.max(1, Math.round(text.offsetHeight / lh));
      s.beats = [];
      for (let i = 0; i < lines; i += 2) s.beats.push(0.05 + (i / Math.max(1, lines - 1)) * 0.75);
      s.beats.push(0.8, 0.93);
    },
    enterStatic() {
      s.measure();
      s.place(1);
    },
    place(line) {
      css(text, { transform: `translate3d(0, ${(lh - line * lh).toFixed(1)}px, 0)` });
    },
    update(p) {
      s.place(seg(p, 0.05, 0.8) * (lines - 1));
      const a = seg(p, 0.8, 0.86);
      css(caption, { opacity: a, transform: `translateY(${((1 - a) * 10).toFixed(1)}px)` });
      css(rec, { opacity: seg(p, 0.82, 0.88) });
    },
  };
  return s;
});

/* Manifesto em momentos */
scene("manifesto", (el) => {
  const lines = $$(".mf__line", el);
  const verbs = $$(".mf__line--verbs .v", el);
  const drift = $(".drift", el);
  const items = $$(".drift__item", el).map((d) => ({ el: d, d: parseFloat(d.style.getPropertyValue("--d")) || 0.5 }));
  let verbTimer = 0;
  let lit = false;
  const n = lines.length;
  return {
    beats: lines.map((_, i) => (i + 0.5) / n),
    enterStatic() {
      verbs.forEach((v) => v.classList.add("is-on"));
    },
    update(p, raw) {
      lines.forEach((line, i) => {
        const a = i / n;
        const b = (i + 1) / n;
        const len = b - a;
        const fin = easeOut(seg(p, a + len * 0.05, a + len * 0.32));
        const fout = i === n - 1 ? 0 : ease(seg(p, b - len * 0.2, b));
        const v = fin * (1 - fout);
        css(line, {
          opacity: v.toFixed(3),
          transform: `translate3d(0, ${((1 - fin) * 28 - fout * 24).toFixed(1)}px, 0)`,
          filter: `blur(${((1 - fin) * 8 + fout * 6).toFixed(2)}px)`,
          visibility: v < 0.01 ? "hidden" : "visible",
        });
        // Os verbos acendem um a um quando a frase chega.
        if (i === 1) {
          if (v > 0.85 && !lit) {
            lit = true;
            let k = 0;
            verbTimer = setInterval(() => {
              verbs[k++]?.classList.add("is-on");
              if (k >= verbs.length) clearInterval(verbTimer);
            }, 240);
          } else if (v < 0.05 && lit) {
            lit = false;
            clearInterval(verbTimer);
            verbs.forEach((x) => x.classList.remove("is-on"));
          }
        }
      });

      // "Existe informação acontecendo em toda parte": o fundo se acende.
      const mid = seg(p, 2 / n, 2 / n + 0.3 / n) * (1 - seg(p, 3 / n - 0.15 / n, 3 / n + 0.1 / n));
      css(drift, { opacity: (0.14 + 0.36 * mid).toFixed(3) });
      const vh = innerHeight;
      for (const it of items) {
        const y = -raw * vh * (0.9 + it.d * 1.1) + pointer.y * it.d * -8;
        css(it.el, { transform: `translate3d(${(pointer.x * it.d * -10).toFixed(1)}px, ${y.toFixed(1)}px, 0)` });
      }
    },
  };
});

/* O Harp como camada: o mundo muda atrás da mesma janela, e as tarefas vão
   sendo escritas e marcadas. */
scene("camada", (el) => {
  const layers = $$(".layer", el);
  const harp = $(".harp--layer", el);
  harpChrome(harp);
  const notes = $$(".layer-notes li", el).map((li) => {
    const text = li.textContent;
    li.textContent = "";
    const box = document.createElement("i");
    box.className = "task";
    box.setAttribute("aria-hidden", "true");
    const span = document.createElement("span");
    li.append(box, span);
    li.setAttribute("aria-label", text);
    return { li, span, text };
  });
  const index = $$(".camada__index li", el);
  const b = $(".camada__b", el);
  const K = layers.length;
  let shown = -1;
  let cancel = null;
  const caret = makeCaret();

  function setShown(k) {
    if (k === shown) return;
    cancel?.();
    notes.forEach((nt, i) => {
      nt.li.classList.toggle("is-in", i < k);
      nt.li.classList.toggle("is-done", i < k - 1);
      nt.span.textContent = nt.text;
    });
    caret.remove();
    if (k > 0) {
      const last = notes[k - 1];
      last.li.append(caret);
      if (k > shown) {
        last.span.textContent = "";
        cancel = typeText(last.text, (s) => (last.span.textContent = s), { caret, delay: 380 });
      }
    }
    shown = k;
  }

  return {
    beats: layers.map((_, i) => 0.02 + (i / (K - 1)) * 0.88),
    showLayer(i) {
      layers.forEach((l, k) => l.classList.toggle("is-shown", k === i));
    },
    enterStatic() {
      notes.forEach((nt, i) => {
        nt.li.classList.add("is-in");
        nt.li.classList.toggle("is-done", i < notes.length - 1);
        nt.span.textContent = nt.text;
      });
    },
    update(p) {
      const P = seg(p, 0.02, 0.9) * (K - 1);
      layers.forEach((layer, i) => {
        const inner = layer.firstElementChild;
        if (i === 0) {
          css(inner, { transform: `translate3d(${(-ease(seg(P, 0.45, 1)) * 3).toFixed(2)}%, 0, 0)` });
          return;
        }
        const e = ease(seg(P, i - 0.55, i));
        const out = i === K - 1 ? 0 : ease(seg(P, i + 0.45, i + 1));
        css(layer, { clipPath: `inset(0 0 0 ${((1 - e) * 100).toFixed(2)}%)` });
        css(inner, { transform: `translate3d(${((1 - e) * 8 - out * 3).toFixed(2)}%, 0, 0)` });
      });
      const active = Math.min(K - 1, Math.floor(P + 0.25));
      index.forEach((li, i) => li.classList.toggle("is-on", i === active));
      setShown(p > 0.005 ? active + 1 : 0);
      b.classList.toggle("is-in", P > 1.05);
      css(harp, {
        transform: `translate(calc(-50% + ${(pointer.x * 3).toFixed(1)}px), calc(-50% + ${(pointer.y * 2).toFixed(1)}px))`,
      });
    },
  };
});

/* --- Trechos: a rolagem por passos ----------------------------------------- */

let beats = [];

function computeBeats() {
  const vh = innerHeight;
  const max = Math.max(0, document.documentElement.scrollHeight - vh);
  const list = [0, max];
  const ranges = [];
  for (const s of scenes) {
    for (const b of s.beats) list.push(s.top + s.total * b);
    ranges.push([s.top, s.top + s.total]);
  }
  for (const el of $$("[data-beat]")) {
    const r = el.getBoundingClientRect();
    const top = r.top + scrollY;
    list.push(el.dataset.beat === "center" ? top + r.height / 2 - vh / 2 : top - 64);
  }
  const sorted = list.map((y) => Math.round(clamp(y, 0, max))).sort((a, b) => a - b);
  const out = [];
  for (const y of sorted) {
    const prev = out[out.length - 1];
    if (prev !== undefined && y - prev < 24) continue;
    // Fora dos palcos, um intervalo maior que a tela ganha paradas no meio,
    // para nenhum trecho de texto ser pulado.
    if (prev !== undefined && y - prev > vh * 1.1) {
      const touchesScene = ranges.some(([a, b]) => prev < b + 2 && y > a - 2);
      if (!touchesScene) {
        const k = Math.ceil((y - prev) / (vh * 0.8));
        for (let i = 1; i < k; i++) out.push(Math.round(prev + ((y - prev) * i) / k));
      }
    }
    out.push(y);
  }
  beats = out;
  stepButton.update();
}

const nextBeat = (dir) => {
  const y = scrollY;
  return dir > 0 ? beats.find((b) => b > y + 8) : [...beats].reverse().find((b) => b < y - 8);
};

let anim = null;
let lockedUntilQuiet = false;
let lastWheel = 0;
let lastMag = 0;
let acc = 0;

function goTo(target) {
  if (target === undefined) return;
  const from = scrollY;
  const dist = Math.abs(target - from);
  if (dist < 1) return;
  const vh = innerHeight;
  const dur = clamp(760 + (dist / vh) * 520, 850, 2100);
  const start = performance.now();
  const id = {};
  anim = id;
  const tick = (now) => {
    if (anim !== id) return;
    const t = clamp((now - start) / dur);
    scrollTo(0, from + (target - from) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else {
      anim = null;
      lockedUntilQuiet = true;
      stepButton.update();
    }
  };
  requestAnimationFrame(tick);
}

const step = (dir) => goTo(nextBeat(dir));

function onWheel(e) {
  if (isStatic() || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  const now = performance.now();
  const gap = now - lastWheel;
  const mag = Math.abs(e.deltaY);
  const growing = mag > lastMag * 1.6 + 4;
  lastWheel = now;
  lastMag = mag;
  if (gap > 320) acc = 0;
  if (anim) return;
  // A inércia do touchpad continua mandando eventos depois do passo, cada vez
  // mais fracos. Só conta como pedido novo um gesto depois de um instante de
  // silêncio, ou um impulso que volta a crescer.
  if (lockedUntilQuiet) {
    if (gap < 300 && !growing) return;
    lockedUntilQuiet = false;
  }
  acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  if (Math.abs(acc) < 22) return;
  const dir = Math.sign(acc);
  acc = 0;
  step(dir);
}

function onKey(e) {
  if (isStatic() || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t.closest?.("input, textarea, select, [contenteditable]")) return;
  const isSpace = e.key === " ";
  if (isSpace && t.closest?.("button, a, summary")) return;
  let dir = 0;
  if (e.key === "ArrowDown" || e.key === "PageDown" || (isSpace && !e.shiftKey)) dir = 1;
  else if (e.key === "ArrowUp" || e.key === "PageUp" || (isSpace && e.shiftKey)) dir = -1;
  else if (e.key === "Home") {
    e.preventDefault();
    return goTo(0);
  } else if (e.key === "End") {
    e.preventDefault();
    return goTo(beats[beats.length - 1]);
  }
  if (!dir) return;
  e.preventDefault();
  if (!anim) step(dir);
}

const stepButton = (() => {
  const btn = $("#step");
  btn.innerHTML = icon("chevron-down-20");
  let revealed = false;
  btn.addEventListener("click", () => {
    if (!anim) step(1);
  });
  return {
    reveal() {
      revealed = true;
      this.update();
    },
    update() {
      const atEnd = nextBeat(1) === undefined;
      btn.hidden = isStatic() || !revealed;
      btn.classList.toggle("is-end", atEnd);
    },
  };
})();


/* --- Tema ---------------------------------------------------------------------
   O site abre no escuro, sempre: é nele que a janela translúcida se explica,
   e é o tema em que as demonstrações foram desenhadas. Quem preferir o claro
   troca aqui, e o navegador lembra. O app tem a mesma troca, em Ctrl+Shift+B. */

function setupTheme() {
  const btn = $("#theme");
  const meta = $("#theme-color");
  if (!btn) return;

  const paint = (dark) => {
    btn.innerHTML = icon(dark ? "sun" : "moon");
    btn.setAttribute("aria-label", dark ? "Mudar para o tema claro" : "Voltar para o tema escuro");
    btn.setAttribute("aria-pressed", String(!dark));
    if (meta) meta.content = dark ? "#09090a" : "#f4f4f6";
  };

  paint(root.dataset.theme !== "light");

  btn.addEventListener("click", () => {
    const dark = root.dataset.theme === "light";
    root.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("harp-tema", root.dataset.theme);
    } catch (e) {
      /* Navegador sem armazenamento: a troca vale para esta visita. */
    }
    paint(dark);
  });
}

/* --- Atalhos ------------------------------------------------------------------
 * Ler o nome de um atalho não diz o que ele faz. Cada um traz uma demonstração
 * de poucas formas: uma tela ao fundo, a janela do Harp e, quando o atalho
 * precisa, um cursor ou uma marca. A animação só roda enquanto a pessoa aponta
 * para o atalho — nada se mexe sozinho aqui.
 */

const SHORTCUTS = [
  ["call", "Ctrl+Alt+Space", "Chama e esconde o Harp, de qualquer aplicativo"],
  ["jot", "Win+J", "Rascunho rápido por cima de tudo"],
  ["vidro", "Win+Alt+V", "Escreve e aponta sobre a própria tela"],
  ["ghost", "Ctrl+Shift+G", "Modo fantasma: o clique atravessa a janela"],
  ["stealth", "Ctrl+Shift+H", "Some das gravações e do compartilhamento"],
  ["opacity", "Ctrl+[ · Ctrl+]", "Menos ou mais opacidade"],
  ["snap", "Ctrl+Alt+1…5", "Encaixa nos cantos"],
  ["full", "Ctrl+Alt+0", "Ocupa a tela toda"],
  ["tabs", "Ctrl+1…9", "Troca de anotação"],
  ["task", "Ctrl+Enter", "Cria a tarefa, ou marca e desmarca"],
  ["prompter", "Ctrl+Alt+P", "Teleprompter, com rolagem contínua"],
  ["notch", "Ctrl+Alt+N", "Faixa de três linhas no topo da tela"],
  ["copy", "Ctrl+Shift+Enter", "Copia tudo e limpa"],
  ["help", "Ctrl+/", "Todos os atalhos, dentro do app"],
  ["rescue", "Ctrl+Alt+G", "Resgate: desfaz todos os modos"],
];

const keycaps = (combo) =>
  combo
    .split(" · ")
    .map((group) => group.split("+").map((k) => `<kbd>${k}</kbd>`).join('<i>+</i>'))
    .join('<em>ou</em>');

function setupShortcuts() {
  const grid = $("#shortcuts");
  if (!grid) return;
  grid.innerHTML = SHORTCUTS.map(
    ([id, combo, label]) => `<button class="sc" type="button" data-demo="${id}">
      <span class="sc__stage" aria-hidden="true">
        <i class="sc__desk"></i>
        <i class="sc__win"><i class="sc__tabs"><b></b><b></b><b></b></i><i class="sc__txt"><s></s><s></s><s></s><s></s></i></i>
        <i class="sc__cursor"></i>
        <i class="sc__mark"></i>
      </span>
      <span class="sc__keys">${keycaps(combo)}</span>
      <span class="sc__label">${label}</span>
    </button>`
  ).join("");

  // Sem mouse não há "apontar": o toque liga a demonstração, e ela para
  // sozinha depois de alguns segundos.
  let timer = 0;
  grid.addEventListener("click", (e) => {
    const sc = e.target.closest(".sc");
    if (!sc) return;
    clearTimeout(timer);
    for (const other of $$(".sc.is-live", grid)) if (other !== sc) other.classList.remove("is-live");
    sc.classList.toggle("is-live");
    if (sc.classList.contains("is-live")) timer = setTimeout(() => sc.classList.remove("is-live"), 9000);
  });
}

/* --- Índice dos contextos, clicável ------------------------------------------
   Na camada, cada nome leva ao seu contexto: quem quiser ver a planilha não
   precisa passar pelo resto. */

function setupLayerIndex() {
  const grid = $("#camada-index");
  if (!grid) return;
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-layer]");
    if (!btn) return;
    const i = Number(btn.dataset.layer);
    const camada = scenes.find((x) => x.name === "camada");
    if (!camada) return;
    if (isStatic()) {
      camada.showLayer?.(i);
      $$("#camada-index button").forEach((b) => b.parentElement.classList.toggle("is-on", b === btn));
      return;
    }
    jumpTo(Math.round(camada.top + camada.total * (camada.beats[i] ?? 0)));
  });
}

/* --- Âncoras ------------------------------------------------------------------
   Um link para o manifesto tem de cair onde a primeira frase está visível, e
   não no começo de um palco ainda vazio. */

function anchorTarget(el) {
  const vh = innerHeight;
  const max = Math.max(0, document.documentElement.scrollHeight - vh);
  const scene = scenes.find((x) => x.el === el);
  const y = scene
    ? scene.top + scene.total * (scene.beats[0] ?? 0)
    : (() => {
        const r = el.getBoundingClientRect();
        const top = r.top + scrollY;
        return el.dataset.beat === "center" ? top + r.height / 2 - vh / 2 : top - 64;
      })();
  return Math.round(clamp(y, 0, max));
}

/**
 * Pula direto para um ponto da página.
 *
 * Quem clica em "Manifesto" quer o manifesto, e não as seis cenas que existem
 * entre ele e o topo passando em dois segundos. As cenas são refeitas no lugar
 * novo em vez de correrem até ele: `ready = false` faz cada uma assumir o
 * estado daquele ponto no quadro seguinte.
 */
let jumpTimer = 0;

function jumpTo(y) {
  anim = null;
  for (const s of scenes) s.ready = false;
  scrollTo(0, y);
  // Um piscar curto no lugar do trajeto: sem ele, o corte confunde; com uma
  // animação longa, vira o que a pessoa quis evitar.
  if (!isStatic()) {
    root.classList.remove("is-jump");
    void root.offsetWidth;
    root.classList.add("is-jump");
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => root.classList.remove("is-jump"), 400);
  }
  stepButton.update();
  kick();
}

function setupAnchors() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const el = document.getElementById(a.getAttribute("href").slice(1));
    if (!el) return;
    e.preventDefault();
    jumpTo(anchorTarget(el));
    // Quem chegou pelo teclado continua no fluxo: o foco vai para o destino.
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  });
}

/* --- Laço ------------------------------------------------------------------ */

let running = false;
let lastT = 0;

function frame(now) {
  if (isStatic()) {
    running = false;
    return;
  }
  const dt = Math.min(64, now - (lastT || now - 16.7));
  lastT = now;
  // Suavização curta: a rolagem por passos já chega com a própria curva, e
  // uma segunda camada de atraso faria a cena parecer presa à roda.
  const k = 1 - Math.pow(1 - 0.24, dt / 16.7);
  pointer.x += (pointer.tx - pointer.x) * k * 0.5;
  pointer.y += (pointer.ty - pointer.y) * k * 0.5;
  let busy = Math.abs(pointer.tx - pointer.x) > 0.001 || Math.abs(pointer.ty - pointer.y) > 0.001;

  const y = scrollY;
  const vh = innerHeight;
  for (const s of scenes) {
    const target = (y - s.top) / s.total;
    if (y + vh < s.top - vh || y > s.top + s.total + vh) {
      s.ready = false;
      continue;
    }
    if (!s.ready) {
      s.raw = target;
      s.ready = true;
    }
    s.raw += (target - s.raw) * k;
    if (Math.abs(target - s.raw) < 0.00005) s.raw = target;
    else busy = true;
    s.update(clamp(s.raw), s.raw);
  }

  if (busy) requestAnimationFrame(frame);
  else {
    running = false;
    lastT = 0;
  }
}

function kick() {
  if (running || isStatic()) return;
  running = true;
  requestAnimationFrame(frame);
}

/* --- Entradas únicas (fora dos palcos) ------------------------------------- */

function observeOnce(targets, cls, threshold, cb) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add(cls);
        cb?.(e.target);
        io.unobserve(e.target);
      }
    },
    { threshold }
  );
  targets.forEach((t) => io.observe(t));
}

function setupReveals() {
  $$(".principle, .facts, .privacy__text").forEach((el, i) => {
    el.classList.add("reveal");
    el.style.setProperty("--delay", `${(i % 3) * 120}ms`);
  });
  observeOnce($$(".reveal"), "is-in", 0.2);
  observeOnce($$(".statement"), "is-in", 0.55);
  observeOnce($$(".privacy"), "is-in", 0.45);
  observeOnce($$(".download"), "is-live", 0.5, (el) => {
    // O cursor pisca algumas vezes e some: a escrita terminou.
    setTimeout(() => el.classList.add("is-done"), 5200);
  });
}

/* --- Modo ------------------------------------------------------------------ */

function applyMode() {
  const next = modeQuery.matches;
  root.classList.toggle("static", next);
  anim = null;
  resetTouched();
  measure();
  if (next) {
    for (const s of scenes) s.enterStatic?.();
  } else {
    kick();
  }
  stepButton.update();
}

/* --- Início ---------------------------------------------------------------- */

$$(".harp[data-tabs]").forEach(harpChrome);
setupAccent();
setupReveals();
setupTheme();
setupShortcuts();
setupLayerIndex();
setupAnchors();
applyMode();

addEventListener(
  "scroll",
  () => {
    onScrollHeader();
    if (!anim) stepButton.update();
    kick();
  },
  { passive: true }
);
addEventListener("wheel", onWheel, { passive: false });
addEventListener("keydown", onKey);
addEventListener("resize", () => {
  measure();
  kick();
});
modeQuery.addEventListener("change", applyMode);
document.fonts?.ready.then(() => {
  measure();
  kick();
});
new ResizeObserver(() => {
  measure();
  kick();
}).observe(document.body);
