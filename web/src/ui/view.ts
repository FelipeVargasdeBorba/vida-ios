import type { Day } from '../domain/dates';

export interface View {
  title: string;
  el: HTMLElement;
  /** Botões à direita do título. */
  actions?: HTMLElement[];
  /** Mostra o botão de voltar. */
  back?: boolean;
}

export interface Ctx {
  today: Day;
  /** Partes do caminho depois da aba, ex.: ['goal', 'abc']. */
  path: string[];
}

export const hrefTo = (...parts: string[]) => `#/${parts.join('/')}`;
