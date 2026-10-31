import { type AppState, defaultState } from './state';

const KEY = 'vida.state.v1';

/** Completa o que faltar com os valores padrão, para versões antigas dos dados continuarem abrindo. */
export function normalize(raw: unknown): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  return {
    ...base,
    ...r,
    version: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    workDays: r.workDays?.length === 7 ? r.workDays : base.workDays,
    noteLists: r.noteLists ?? base.noteLists,
  };
}

function read(): AppState {
  try {
    const text = localStorage.getItem(KEY);
    return text ? normalize(JSON.parse(text)) : defaultState();
  } catch {
    return defaultState();
  }
}

type Listener = () => void;

class Store {
  state: AppState = read();
  private listeners = new Set<Listener>();
  /** Falha ao gravar (armazenamento cheio ou bloqueado): a tela avisa. */
  saveError = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Altera o estado, grava e avisa as telas. */
  update(mutate: (s: AppState) => void): void {
    mutate(this.state);
    this.persist();
    this.listeners.forEach((fn) => fn());
  }

  replace(next: unknown): void {
    this.state = normalize(next);
    this.persist();
    this.listeners.forEach((fn) => fn());
  }

  exportJson(): string {
    return JSON.stringify(this.state, null, 2);
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
      this.saveError = false;
    } catch {
      this.saveError = true;
    }
  }
}

export const store = new Store();

/** Pede ao navegador para não apagar os dados (importante no iPhone). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
