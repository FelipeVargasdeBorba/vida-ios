import { periodContains, type PayPeriod } from './domain/payPeriod';
import type { Day } from './domain/dates';
import type { BillRow, FinanceModel, GoalRow } from './financeModel';
import { snapshotOf } from './financeModel';
import { type AppState, newId } from './state';
import { store } from './store';

/** Nota dos aportes criados pelo checklist (para poder desfazer só esses). */
export const GOAL_NOTE = 'Set aside from checklist';
/** Nota usada antes de o app ser traduzido; aportes antigos continuam sendo reconhecidos. */
const LEGACY_GOAL_NOTE = 'Separado no checklist';
export const isGoalNote = (note: string) => note === GOAL_NOTE || note === LEGACY_GOAL_NOTE;

export function toggleTransfer(m: FinanceModel): void {
  store.update((s) => {
    if (m.transferCheck) s.checks = s.checks.filter((c) => c.id !== m.transferCheck?.id);
    else s.checks.push({ id: newId(), kind: 'savesTransfer', forDay: m.period.start });
  });
}

export function toggleBill(b: BillRow): void {
  store.update((s) => {
    if (b.check) s.checks = s.checks.filter((c) => c.id !== b.check?.id);
    else s.checks.push({ id: newId(), kind: 'bill', forDay: b.due, fixedId: b.fixed.id });
  });
}

/** Desfaz as transferências que o checklist registrou neste período. */
export function undoGoalTransfer(row: GoalRow, period: PayPeriod): void {
  store.update((s) => {
    s.contributions = s.contributions.filter((c) => !(c.goalId === row.goal.id && isGoalNote(c.note) && periodContains(period, c.day)));
  });
}

export function saveSnapshot(m: FinanceModel): void {
  store.update((s) => s.snapshots.unshift(snapshotOf(m, s)));
}

export function deleteGoal(id: string): void {
  store.update((s) => {
    s.goals = s.goals.filter((g) => g.id !== id);
    s.contributions = s.contributions.filter((c) => c.goalId !== id);
  });
}

export function deleteFixed(id: string): void {
  store.update((s) => {
    s.fixed = s.fixed.filter((f) => f.id !== id);
    s.checks = s.checks.filter((c) => c.fixedId !== id);
  });
}

export function deleteNoteList(id: string): void {
  store.update((s) => {
    s.noteLists = s.noteLists.filter((l) => l.id !== id);
    s.noteItems = s.noteItems.filter((i) => i.listId !== id);
  });
}

export function reorderGoals(ids: string[]): void {
  store.update((s) => ids.forEach((id, i) => { const g = s.goals.find((x) => x.id === id); if (g) g.priority = i; }));
}

export function resetCarry(period: PayPeriod): void {
  store.update((s) => { s.settings.carryFromDay = period.start; });
}

export const hasData = (s: AppState): boolean => s.transactions.length + s.goals.length + s.fixed.length > 0;

export function setSavesBalance(cents: number, today: Day): void {
  store.update((s) => { s.settings.savesBalance = cents; s.settings.savesBalanceUpdatedAt = today; });
}
