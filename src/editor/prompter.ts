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
  start(): void;
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
        stop();
        options.onEnd();
        return;
      }

      carry += speed * elapsed;
      const whole = Math.floor(carry);
      if (whole > 0) {
        carry -= whole;
        scroller.scrollTop = Math.min(limit, scroller.scrollTop + whole);
      }

      if (scroller.scrollTop >= limit) {
        stop();
        options.onEnd();
        return;
      }
    }

    frame = requestAnimationFrame(step);
  };

  function start(): void {
    if (active) return;
    active = true;
    paused = false;
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
