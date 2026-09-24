/**
 * Atualizacao dentro do app.
 *
 * O Harp e distribuido fora de loja, entao ninguem atualiza por voce: sem isto,
 * cada correcao dependeria da pessoa lembrar de visitar o repositorio. A versao
 * mais recente e descrita num `latest.json` publicado junto do release, e o
 * instalador vem assinado com uma chave que so existe no GitHub Actions — quem
 * trocasse o arquivo no caminho nao conseguiria assina-lo.
 *
 * A checagem e silenciosa de proposito. Um app que promete nao interromper nao
 * pode abrir uma janela avisando que existe versao nova: aparece um ponto na
 * barra, e a pessoa clica quando quiser.
 */

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Espera antes da primeira checagem.
 *
 * Abrir o app e o momento em que a pessoa quer escrever. A rede pode esperar
 * meio minuto.
 */
const FIRST_CHECK_MS = 30_000;

/** Entre checagens, para quem deixa o app aberto por dias. */
const INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface UpdateInfo {
  version: string;
  notes?: string;
}

/**
 * Procura uma versao nova sem incomodar.
 *
 * Erro aqui nunca vira aviso: falta de rede, GitHub fora do ar ou release
 * malformado nao sao problema de quem so queria anotar alguma coisa.
 */
async function look(): Promise<Update | null> {
  try {
    return await check();
  } catch (error) {
    console.error("[harp] falha ao procurar atualizacao", error);
    return null;
  }
}

export interface UpdateWatcher {
  /** Versao encontrada, ou null enquanto nao houver nenhuma. */
  pending(): UpdateInfo | null;
  /**
   * Baixa, instala e reinicia. So retorna em caso de falha — no caminho feliz o
   * app e substituido antes disso.
   */
  install(onProgress: (fraction: number) => void): Promise<void>;
}

/**
 * Passa a vigiar novas versoes e avisa o chamador quando achar uma.
 *
 * Em desenvolvimento nao ha nada para achar (o `latest.json` fala de versoes
 * publicadas), entao a checagem simplesmente nao encontra nada e o ponto nunca
 * aparece.
 */
export function watchForUpdates(onFound: () => void): UpdateWatcher {
  let found: Update | null = null;

  const procurar = async () => {
    if (found) return;
    found = await look();
    if (found) onFound();
  };

  window.setTimeout(() => {
    void procurar();
    window.setInterval(() => void procurar(), INTERVAL_MS);
  }, FIRST_CHECK_MS);

  return {
    pending: () => (found ? { version: found.version, notes: found.body } : null),
    install: async (onProgress) => {
      if (!found) return;

      let baixado = 0;
      let total = 0;

      await found.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          baixado += event.data.chunkLength;
          onProgress(total > 0 ? baixado / total : 0);
        } else if (event.event === "Finished") {
          onProgress(1);
        }
      });

      // O instalador ja rodou; reiniciar e o que faz a versao nova aparecer.
      await relaunch();
    },
  };
}
