/**
 * Motor do teleprompter.
 *
 * Rola o texto sozinho, a velocidade constante, para quem le em camera. Usa
 * `requestAnimationFrame` com acumulador fracionario: `scrollTop` so aceita
 * inteiros, e arredondar a cada quadro faria a leitura tremer — justamente o
 * que um teleprompter nao pode fazer.
 */

export interface PrompterState {
  active: boolean;
  paused: boolean;
  /** Pixels por segundo. */
  speed: number;
}

export const SPEED_MIN = 10;
export const SPEED_MAX = 150;
export const SPEED_STEP = 5;

export interface Prompter {
  state(): PrompterState;
  /** `paused` decide se ja sai rolando ou espera o usuario mandar. */
  start(paused?: boolean): void;
  stop(): void;
  togglePause(): void;
  nudgeSpeed(delta: number): void;
}

export interface PrompterOptions {
  /** Elemento que rola; consultado a cada uso porque o editor pode ser recriado. */
  scroller: () => HTMLElement;
  /** Avisa mudancas de estado, para a interface refletir. */
  onChange: (state: PrompterState) => void;
  /** Chamado quando o texto chega ao fim. */
  onEnd: () => void;
}

export function createPrompter(options: PrompterOptions): Prompter {
  let active = false;
  let paused = false;
  let speed = 25;

  let frame = 0;
  let lastTime = 0;
  /** Ja chegou ao fim: evita repetir o aviso e tentar rolar o que acabou. */
  let atEnd = false;
  /** Sobra de pixel do quadro anterior, para o movimento nao travar. */
  let carry = 0;

  const notify = () => options.onChange({ active, paused, speed });

  const step = (time: number) => {
    if (!active) return;

    const elapsed = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;

    if (!paused) {
      const scroller = options.scroller();
      const limit = scroller.scrollHeight - scroller.clientHeight;

      if (limit <= 0) {
        // Texto menor que a janela: nao ha o que rolar.
        reachEnd();
        return;
      }

      carry += speed * elapsed;
      const whole = Math.floor(carry);
      if (whole > 0) {
        carry -= whole;
        scroller.scrollTop = Math.min(limit, scroller.scrollTop + whole);
      }

      if (scroller.scrollTop >= limit) {
        reachEnd();
        return;
      }
    }

    frame = requestAnimationFrame(step);
  };

  /**
   * Chegou ao fim: pausa, nao encerra.
   *
   * Encerrar tirava a folga de leitura e a ultima linha saltava do centro
   * justamente no momento de le-la. Pausado, o modo continua de pe: a ultima
   * linha fica no ponto de leitura ate a pessoa decidir o que fazer.
   */
  function reachEnd(): void {
    paused = true;
    lastTime = 0;
    notify();
    if (!atEnd) {
      atEnd = true;
      options.onEnd();
    }
    frame = requestAnimationFrame(step);
  }

  function start(pausedInicial = true): void {
    if (active) return;
    active = true;
    atEnd = false;
    // Comeca parado por padrao: ligar o teleprompter e se preparar para ler,
    // nao comecar a ler. Sem isso a primeira linha ja saia descendo.
    paused = pausedInicial;
    carry = 0;
    lastTime = 0;
    frame = requestAnimationFrame(step);
    notify();
  }

  function stop(): void {
    if (!active) return;
    active = false;
    paused = false;
    cancelAnimationFrame(frame);
    notify();
  }

  return {
    state: () => ({ active, paused, speed }),
    start,
    stop,
    togglePause() {
      if (!active) return;
      // No fim do texto nao ha o que retomar: insistir so repetiria o aviso.
      if (atEnd && paused) return;
      paused = !paused;
      // Zera o relogio: sem isto, o tempo parado viraria um salto ao voltar.
      lastTime = 0;
      notify();
    },
    nudgeSpeed(delta: number) {
      speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed + delta));
      notify();
    },
  };
}
