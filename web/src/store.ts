import { type AppState, defaultState } from './state';

const KEY = 'vida.state.v1';

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const merged = (c: string) => (c === 'lazer' ? 'outro' : c);

/** "Lazer" e "Outro" viraram uma só categoria: dados antigos passam a usar só "Outro". */
export function mergeLeisure(s: AppState): AppState {
  const cat = <T extends { category: string }>(x: T): T => ({ ...x, category: merged(x.category) } as T);
  const st = s.settings as unknown as Record<string, unknown>;
  delete st.outroPoints;
  s.settings.spendingAccount = uniq(s.settings.spendingAccount.map(merged)) as AppState['settings']['spendingAccount'];
  s.settings.flexibleOrder = uniq(s.settings.flexibleOrder.map(merged)) as AppState['settings']['flexibleOrder'];
  s.fixed = s.fixed.map(cat);
  s.transactions = s.transactions.map(cat);
  s.snapshots = s.snapshots.map((snap) => {
    const lines: AppState['snapshots'][number]['lines'] = [];
    for (const l of snap.lines.map(cat)) {
      const same = lines.find((x) => x.category === l.category);
      if (!same) { lines.push(l); continue; }
      same.adjusted = same.adjusted === null && l.adjusted === null ? null : (same.adjusted ?? same.target) + (l.adjusted ?? l.target);
      same.target += l.target; same.fixed += l.fixed; same.spent += l.spent;
    }
    return { ...snap, lines };
  });
  return s;
}

/** Completa o que faltar com os valores padrão, para versões antigas dos dados continuarem abrindo. */
export function normalize(raw: unknown): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  return mergeLeisure({
    ...base,
    ...r,
    version: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    workDays: r.workDays?.length === 7 ? r.workDays : base.workDays,
    noteLists: r.noteLists ?? base.noteLists,
  });
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
