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

export const SPEED_MIN = 2;
export const SPEED_MAX = 150;

/**
 * Passo variavel: fino embaixo, grosso em cima.
 *
 * A diferenca entre 8 e 13 px/s muda completamente a leitura; entre 100 e 105,
 * ninguem percebe. Um passo unico serviria mal aos dois extremos.
 */
export function speedStep(speed: number): number {
  if (speed < 20) return 1;
  if (speed < 60) return 5;
  return 10;
}

export interface Prompter {
  state(): PrompterState;
  /** `paused` decide se ja sai rolando ou espera o usuario mandar. */
  start(paused?: boolean): void;
  stop(): void;
  togglePause(): void;
  /** `direction` e -1 ou 1. */
  nudgeSpeed(direction: number): void;
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
  // Velocidade de leitura confortavel em voz alta. A anterior (25) obrigava a
  // pausar a cada poucas linhas.
  let speed = 10;

  let frame = 0;
  let lastTime = 0;
  /** Ja chegou ao fim: evita repetir o aviso e tentar rolar o que acabou. */
  let atEnd = false;
  /**
   * Posicao de rolagem em numero fracionario.
   *
   * `scrollTop` guarda fracao, mas ler de volta e arredondar a cada quadro
   * faria o texto andar de pixel em pixel — visivel como tremor justamente nas
   * velocidades baixas, onde cada quadro avanca menos de um pixel. A conta fica
   * aqui, com precisao, e o DOM recebe o valor continuo.
   */
  let position = 0;

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

      position = Math.min(limit, position + speed * elapsed);
      scroller.scrollTop = position;

      if (position >= limit) {
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
    position = options.scroller().scrollTop;
    // Comeca parado por padrao: ligar o teleprompter e se preparar para ler,
    // nao comecar a ler. Sem isso a primeira linha ja saia descendo.
    paused = pausedInicial;
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
      // A pessoa pode ter rolado o texto na mao durante a pausa.
      if (!paused) position = options.scroller().scrollTop;
      notify();
    },
    /** `direction` e -1 ou 1; o tamanho do passo sai da velocidade atual. */
    nudgeSpeed(direction: number) {
      const step = speedStep(direction > 0 ? speed : speed - 0.1);
      speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed + Math.sign(direction) * step));
      notify();
    },
  };
}
