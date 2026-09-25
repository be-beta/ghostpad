/**
 * Janela de rascunho (Win+J).
 *
 * Enter guarda, copia e devolve o foco a quem estava antes; Shift+Enter quebra
 * linha; Esc desiste. O resto — guardar, limitar a dez, apagar ao encerrar —
 * mora no Rust (`jot.rs`), para que esconder esta janela nunca leve junto o que
 * ja foi guardado.
 */

import "../styles.css";
import "./jot.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { applyAccent, applyTheme, DEFAULT_ACCENT, DEFAULT_THEME } from "../core/theme";
import { detectLang, setLang, t } from "../core/i18n";
import { applyFont, DEFAULT_FONT } from "../core/fonts";
import type { Settings } from "../core/store";

const campo = document.getElementById("jot") as HTMLTextAreaElement;
const dica = document.getElementById("jot-hint") as HTMLParagraphElement;

/**
 * Tema, destaque, idioma e fonte da janela principal.
 *
 * Lidos a cada abertura, e nao uma vez: a pessoa pode ter trocado de tema desde
 * o ultimo rascunho, e um rascunho claro sobre um app escuro pareceria outro
 * programa.
 */
async function aplicarPreferencias(): Promise<void> {
  let salvo: Partial<Settings> | undefined;
  try {
    const store = await load("settings.json", { autoSave: false });
    salvo = (await store.get<Partial<Settings>>("settings")) ?? undefined;
  } catch {
    // Sem preferencias, vale o padrao: o rascunho precisa abrir de qualquer jeito.
  }

  const tema = salvo?.theme ?? DEFAULT_THEME;
  applyTheme(tema);
  applyAccent(salvo?.accent ?? DEFAULT_ACCENT, tema);
  setLang(salvo?.lang ?? detectLang());
  void applyFont(salvo?.font ?? DEFAULT_FONT);

  campo.placeholder = t("jot.placeholder");
  dica.textContent = t("jot.hint");
}

/** Altura de uma linha do campo, e quantas cabem antes de a janela parar de crescer. */
const LINHA = 21;
const MIN_LINHAS = 2;
const MAX_LINHAS = 8;
/** Altura da janela com duas linhas: folgas, campo e a linha de ajuda. */
const ALTURA_BASE = 76;

let linhasAtuais = MIN_LINHAS;

/**
 * Ajusta a janela ao texto: duas linhas no minimo, oito no maximo.
 *
 * Conta as linhas de verdade, inclusive as quebradas pela largura, e nao so os
 * Enter: um paragrafo longo tambem precisa de espaco. Quem cresce e a janela,
 * para cima — o canto de baixo fica onde estava.
 */
function ajustar(): void {
  campo.style.height = "auto";
  const linhas = Math.min(MAX_LINHAS, Math.max(MIN_LINHAS, Math.ceil(campo.scrollHeight / LINHA)));
  campo.style.height = `${linhas * LINHA}px`;
  if (linhas === linhasAtuais) return;
  linhasAtuais = linhas;
  void invoke("jot_fit", { height: ALTURA_BASE + (linhas - MIN_LINHAS) * LINHA });
}

function limpar(): void {
  campo.value = "";
  ajustar();
}

campo.addEventListener("input", ajustar);

/** Enter confirma, mas nao no meio de uma composicao (acentos, IME). */
campo.addEventListener("keydown", (event) => {
  if (event.isComposing) return;

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    const texto = campo.value;
    limpar();
    void invoke("jot_commit", { text: texto }).catch((error) =>
      console.error("[harp] falha ao guardar rascunho", error),
    );
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    limpar();
    void invoke("jot_cancel");
  }
});

void listen("harp://jot-open", async () => {
  limpar();
  await aplicarPreferencias();
  campo.focus();
});

void aplicarPreferencias();
