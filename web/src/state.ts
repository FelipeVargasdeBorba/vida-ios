import { type Category, DEFAULT_FLEXIBLE_ORDER, DEFAULT_SPENDING_ACCOUNT, type PresetId } from './domain/budget';
import type { AgendaKind } from './domain/agenda';
import type { Day } from './domain/dates';
import type { Currency } from './domain/money';
import type { PayFrequency } from './domain/payPeriod';

export interface Settings {
  currency: Currency;
  frequency: PayFrequency;
  payDayOfMonth: number;
  /** ISO: 1 = segunda … 7 = domingo. */
  payWeekday: number;
  preset: PresetId;
  /** Pontos percentuais tirados do Lazer para "Outro". */
  outroPoints: number;
  adaptEnabled: boolean;
  flexibleOrder: Category[];
  foodMinimum: number;
  /** Início do período em que o atraso da meta foi aceito. */
  acceptedShortfallPeriodStart: Day | null;
  /** Categorias cujo dinheiro fica na conta de gastos; o resto vai para saves. */
  spendingAccount: Category[];
  /** Quanto já existe na carteira de saves (informado pelo usuário). */
  savesBalance: number;
  savesBalanceUpdatedAt: Day | null;
  /** A sobra da conta de gastos só conta a partir desta data ("zerar sobra"). */
  carryFromDay: Day | null;
  /** Hora dos lembretes exportados para o calendário, em minutos desde a meia-noite. */
  reminderMinutes: number;
  /** Quando o último backup foi exportado (ms), ou null. */
  lastBackupAt: number | null;
}

export interface FixedExpense {
  id: string;
  name: string;
  category: Category;
  monthly: number;
  /** Dia do mês em que vence (1…31); 0 = sem data. */
  dueDay: number;
  remindOn: boolean;
}

export interface Tx {
  id: string;
  kind: 'expense' | 'income';
  source: 'salary' | 'other';
  amount: number;
  day: Day;
  category: Category;
  note: string;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  deadline: Day;
  /** Menor = mais prioritária. */
  priority: number;
}

export interface Contribution {
  id: string;
  goalId: string;
  amount: number;
  day: Day;
  note: string;
}

export interface Check {
  id: string;
  kind: 'bill' | 'savesTransfer';
  /** Conta: vencimento a que se refere. Transferência: início do período. */
  forDay: Day;
  fixedId?: string;
}

export interface Snapshot {
  id: string;
  savedAt: number;
  periodStart: Day;
  periodEnd: Day;
  currency: Currency;
  frequency: PayFrequency;
  preset: PresetId;
  income: number;
  savingsPlanned: number;
  adaptEnabled: boolean;
  totalFixed: number;
  free: number;
  totalSpent: number;
  incomeLogged: number;
  lines: { category: Category; target: number; fixed: number; spent: number; adjusted: number | null }[];
  goals: { name: string; saved: number; target: number; requiredThisPeriod: number; contributedThisPeriod: number }[];
  adjustedSavings: number | null;
  shortfall: number | null;
  dailyAllowance: number | null;
  shortfallAccepted: boolean;
}

export interface WorkDay {
  weekday: number;
  isOn: boolean;
  startMinutes: number;
  endMinutes: number;
}

export interface AgendaItem {
  id: string;
  title: string;
  kind: AgendaKind;
  startMinutes: number;
  endMinutes: number;
  /** Bit 0 = segunda … bit 6 = domingo. */
  weekdaysMask: number;
  isOneTime: boolean;
  oneTimeDay: Day;
  hasDateRange: boolean;
  rangeStart: Day;
  rangeEnd: Day;
  notifyMinutesBefore: number;
}

export interface NoteList {
  id: string;
  name: string;
  sortOrder: number;
}

export interface NoteItem {
  id: string;
  listId: string;
  text: string;
  isDone: boolean;
  createdAt: number;
  doneAt: number | null;
}

export interface AppState {
  version: 1;
  settings: Settings;
  fixed: FixedExpense[];
  transactions: Tx[];
  goals: Goal[];
  contributions: Contribution[];
  checks: Check[];
  snapshots: Snapshot[];
  workDays: WorkDay[];
  agenda: AgendaItem[];
  noteLists: NoteList[];
  noteItems: NoteItem[];
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function defaultState(): AppState {
  return {
    version: 1,
    settings: {
      currency: 'EUR', frequency: 'monthly', payDayOfMonth: 1, payWeekday: 5, preset: 'balanced', outroPoints: 5,
      adaptEnabled: false, flexibleOrder: [...DEFAULT_FLEXIBLE_ORDER], foodMinimum: 0, acceptedShortfallPeriodStart: null,
      spendingAccount: [...DEFAULT_SPENDING_ACCOUNT], savesBalance: 0, savesBalanceUpdatedAt: null, carryFromDay: null, reminderMinutes: 540, lastBackupAt: null,
    },
    fixed: [], transactions: [], goals: [], contributions: [], checks: [], snapshots: [],
    workDays: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, isOn: false, startMinutes: 540, endMinutes: 1080 })),
    agenda: [],
    noteLists: [
      { id: newId(), name: 'Compras', sortOrder: 0 },
      { id: newId(), name: 'Deveres', sortOrder: 1 },
    ],
    noteItems: [],
  };
}
