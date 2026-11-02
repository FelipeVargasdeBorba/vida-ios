import { type AccountSplit, splitAccounts, wallet as makeWallet, type WalletOverview } from './domain/accountSplit';
import { type AdaptationResult, adapt } from './domain/adapter';
import { type BillState, billState, occurrence } from './domain/bills';
import {
  type BudgetSummary, type Category, type CentsByCategory, percentsFor, perPeriod, periodIncome, presetById, split,
  summarize, totalSpent,
} from './domain/budget';
import { CARRY_ORDER, type LedgerEntry, applyCarry, carry as computeCarry } from './domain/carryOver';
import type { Day } from './domain/dates';
import { type GoalStatus, type SavingsCheck, allocate, checkSavings, goalStatus } from './domain/goals';
import type { Currency } from './domain/money';
import {
  type PayPeriod, type PaySchedule, daysLeftIn, daysUntilNextPayday, periodContaining, periodContains,
} from './domain/payPeriod';
import type { AppState, Check, FixedExpense, Goal, Snapshot } from './state';
import { newId } from './state';

export interface GoalRow {
  goal: Goal;
  status: GoalStatus;
  /** Parte da poupança do plano deste período destinada à meta (por prioridade). */
  allocation: number;
  /** Quanto ainda transferir para a conta da meta neste período. */
  toMove: number;
  isDone: boolean;
  /** O que já foi transferido neste período. */
  transferred: number;
  /** O que a meta recebe: o plano, ou o transferido de fato se for maior. */
  effectiveAllocation: number;
}

export interface BillRow {
  fixed: FixedExpense;
  /** Vencimento que vale para este período. */
  due: Day;
  state: BillState;
  check: Check | null;
  title: string;
}

export interface FinanceModel {
  period: PayPeriod;
  schedule: PaySchedule;
  currency: Currency;
  today: Day;
  daysUntilPayday: number;
  daysLeft: number;
  /** Sobra (+) ou falta (−) da conta de gastos vinda dos períodos anteriores, já somada aos alvos. */
  carry: number;
  carryCategory: Category | null;
  /** Soma dos salários lançados no período: é a renda que o plano divide. */
  income: number;
  summary: BudgetSummary;
  goals: GoalRow[];
  goalRequired: number;
  savingsCheck: SavingsCheck;
  adaptation: AdaptationResult | null;
  incomeLogged: number;
  contributedThisPeriod: number;
  shortfallAccepted: boolean;
  split: AccountSplit;
  /** Já gasto nas categorias da conta de gastos neste período. */
  spendingSpent: number;
  /** Valor atual da conta de gastos: o que cabe no período menos o que já foi gasto (negativo = estourou). */
  spendingLeft: number;
  wallet: WalletOverview;
  bills: BillRow[];
  transferCheck: Check | null;
}

export const scheduleOf = (s: AppState): PaySchedule => ({
  frequency: s.settings.frequency, dayOfMonth: s.settings.payDayOfMonth, weekday: s.settings.payWeekday,
});

export const currentPeriod = (s: AppState, today: Day) => periodContaining(today, scheduleOf(s));

export function ledgerOf(s: AppState): LedgerEntry[] {
  return s.transactions.map((t): LedgerEntry =>
    t.kind === 'expense'
      ? { day: t.day, cents: t.amount, type: 'expense', category: t.category }
      : { day: t.day, cents: t.amount, type: t.source === 'salary' ? 'salary' : 'otherIncome' });
}

/** Tudo que as telas de finanças mostram para um período, calculado uma vez por atualização dos dados. */
export function makeFinanceModel(s: AppState, today: Day, period: PayPeriod = currentPeriod(s, today)): FinanceModel {
  const { settings } = s;
  const schedule = scheduleOf(s);
  const spendingAccount = new Set(settings.spendingAccount);
  const preset = presetById(settings.preset);
  const percents = percentsFor(preset);

  const inPeriod = s.transactions.filter((t) => periodContains(period, t.day));
  const spent: CentsByCategory = {};
  let incomeLogged = 0;
  const entries: { cents: number; isSalary: boolean }[] = [];
  for (const t of inPeriod) {
    if (t.kind === 'income') {
      incomeLogged += t.amount;
      entries.push({ cents: t.amount, isSalary: t.source === 'salary' });
    } else {
      spent[t.category] = (spent[t.category] ?? 0) + t.amount;
    }
  }
  const income = periodIncome(entries);

  const fixedBy: CentsByCategory = {};
  for (const f of s.fixed) fixedBy[f.category] = (fixedBy[f.category] ?? 0) + perPeriod(f.monthly, settings.frequency);

  const carry = computeCarry(ledgerOf(s), period, settings.carryFromDay ?? -1e9, schedule, percents, fixedBy, spendingAccount);
  const targets = applyCarry(carry, split(income, percents), spendingAccount);
  const summary = summarize(income, targets, fixedBy, spent);

  // Aportes separados em "antes do período" e "no período" por meta.
  const before = new Map<string, number>();
  const inside = new Map<string, number>();
  let contributedThisPeriod = 0;
  for (const c of s.contributions) {
    if (c.day < period.start) before.set(c.goalId, (before.get(c.goalId) ?? 0) + c.amount);
    else {
      inside.set(c.goalId, (inside.get(c.goalId) ?? 0) + c.amount);
      if (periodContains(period, c.day)) contributedThisPeriod += c.amount;
    }
  }
  const goals = [...s.goals].sort((a, b) => a.priority - b.priority);
  const statuses = goals.map((g) =>
    goalStatus({ targetCents: g.target, deadline: g.deadline, savedBeforePeriod: before.get(g.id) ?? 0, savedInPeriod: inside.get(g.id) ?? 0 },
      period, schedule, today));
  const allocations = allocate(summary.savings, statuses.map((st) => st.requiredThisPeriod));
  const rows: GoalRow[] = goals.map((goal, i) => {
    const status = statuses[i]!;
    const allocation = allocations[i] ?? 0;
    const transferred = status.contributedThisPeriod;
    const toMove = Math.max(0, allocation - transferred);
    return { goal, status, allocation, toMove, isDone: allocation > 0 && toMove === 0, transferred, effectiveAllocation: Math.max(allocation, transferred) };
  });
  const goalRequired = statuses.reduce((a, st) => a + st.requiredThisPeriod, 0);

  const accountSplit = splitAccounts({ ...targets, poupanca: summary.savings }, spendingAccount,
    rows.map((r) => ({ name: r.goal.name, allocation: r.effectiveAllocation })));

  const spendingSpent = summary.lines.filter((l) => spendingAccount.has(l.category)).reduce((a, l) => a + l.spent, 0);

  const bills: BillRow[] = s.fixed.map((f) => {
    const due = occurrence(f.dueDay, period, settings.frequency);
    const check = s.checks.find((c) => c.kind === 'bill' && c.forDay === due && c.fixedId === f.id) ?? null;
    return { fixed: f, due, check, title: f.name || f.category, state: billState(due, f.dueDay > 0, check !== null, today) };
  }).sort((a, b) => {
    const aDated = a.fixed.dueDay > 0, bDated = b.fixed.dueDay > 0;
    if (aDated !== bDated) return aDated ? -1 : 1;
    return a.due !== b.due ? a.due - b.due : a.title.localeCompare(b.title);
  });

  const daysLeft = daysLeftIn(period, today);
  const adaptation = settings.adaptEnabled
    ? adapt({ lines: summary.lines, plannedSavings: summary.savings, goalRequired, flexibleOrder: settings.flexibleOrder, foodMinimum: settings.foodMinimum, daysLeft })
    : null;

  return {
    period, schedule, currency: settings.currency, today,
    daysUntilPayday: daysUntilNextPayday(today, schedule), daysLeft,
    carry, carryCategory: CARRY_ORDER.find((c) => spendingAccount.has(c)) ?? null,
    income, summary, goals: rows, goalRequired,
    savingsCheck: checkSavings(income, preset, goalRequired),
    adaptation, incomeLogged, contributedThisPeriod,
    shortfallAccepted: settings.acceptedShortfallPeriodStart === period.start,
    split: accountSplit,
    spendingSpent, spendingLeft: accountSplit.spendingTotal - spendingSpent,
    wallet: makeWallet(settings.savesBalance, accountSplit),
    bills,
    transferCheck: s.checks.find((c) => c.kind === 'savesTransfer' && c.forDay === period.start) ?? null,
  };
}

/** Foto do período para o histórico. */
export function snapshotOf(m: FinanceModel, s: AppState): Snapshot {
  const { settings } = s;
  return {
    id: newId(), savedAt: Date.now(), periodStart: m.period.start, periodEnd: m.period.end,
    currency: m.currency, frequency: settings.frequency, preset: settings.preset,
    income: m.summary.income, savingsPlanned: m.summary.savings, adaptEnabled: m.adaptation !== null,
    totalFixed: m.summary.totalFixed, free: m.summary.income - m.summary.totalFixed - m.summary.savings,
    totalSpent: totalSpent(m.summary), incomeLogged: m.incomeLogged,
    lines: m.summary.lines.map((l) => ({
      category: l.category, target: l.target, fixed: l.fixed, spent: l.spent,
      adjusted: m.adaptation?.lines.find((a) => a.category === l.category)?.adjusted ?? null,
    })),
    goals: m.goals.map((g) => ({
      name: g.goal.name, saved: g.status.saved, target: g.status.target,
      requiredThisPeriod: g.status.requiredThisPeriod, contributedThisPeriod: g.status.contributedThisPeriod,
    })),
    adjustedSavings: m.adaptation?.adjustedSavings ?? null, shortfall: m.adaptation?.shortfall ?? null,
    dailyAllowance: m.adaptation?.dailyAllowance ?? null, shortfallAccepted: m.shortfallAccepted,
  };
}
