import { type Day, monthsBetween } from './dates';
import { PRESETS_BY_AGGRESSIVENESS, type Preset, percentsFor, savingsPercent, split } from './budget';
import { type PayPeriod, type PaySchedule, periodCount, periodStartAt } from './payPeriod';

export interface GoalInput {
  targetCents: number;
  deadline: Day;
  /** Guardado antes do início do período atual. */
  savedBeforePeriod: number;
  /** Aportado dentro do período atual. */
  savedInPeriod: number;
}

export interface GoalStatus {
  saved: number;
  target: number;
  periodsRemaining: number;
  monthsRemaining: number;
  /** Quanto este período precisa guardar (fixo durante o período). */
  requiredThisPeriod: number;
  contributedThisPeriod: number;
  isOverdue: boolean;
  remaining: number;
  isComplete: boolean;
  remainingThisPeriod: number;
  progress: number;
}

export function goalStatus(goal: GoalInput, period: PayPeriod, schedule: PaySchedule, today: Day): GoalStatus {
  const periods = periodCount(period, goal.deadline, schedule);
  const remainingAtStart = Math.max(0, goal.targetCents - goal.savedBeforePeriod);
  const required = Math.ceil(remainingAtStart / periods);
  const saved = goal.savedBeforePeriod + goal.savedInPeriod;
  return {
    saved,
    target: goal.targetCents,
    periodsRemaining: periods,
    monthsRemaining: Math.max(0, monthsBetween(today, goal.deadline)),
    requiredThisPeriod: required,
    contributedThisPeriod: goal.savedInPeriod,
    isOverdue: goal.deadline < period.start,
    remaining: Math.max(0, goal.targetCents - saved),
    isComplete: saved >= goal.targetCents,
    remainingThisPeriod: Math.max(0, required - goal.savedInPeriod),
    progress: goal.targetCents > 0 ? Math.min(1, saved / goal.targetCents) : 1,
  };
}

/** Distribui um valor entre exigências já ordenadas por prioridade: cada uma é coberta inteira antes da próxima. */
export function allocate(amount: number, requirements: number[]): number[] {
  let left = Math.max(0, amount);
  return requirements.map((req) => {
    const take = Math.min(left, Math.max(0, req));
    left -= take;
    return take;
  });
}

export interface SavingsCheck {
  planned: number;
  required: number;
  /** Plano mais leve que já cobre o exigido, se o atual não cobrir. */
  suggestion: Preset | null;
  shortfall: number;
  isEnough: boolean;
}

const savingsOf = (income: number, preset: Preset) =>
  split(income, percentsFor(preset)).poupanca;

export function checkSavings(income: number, preset: Preset, required: number): SavingsCheck {
  const planned = savingsOf(income, preset);
  const base = { planned, required, shortfall: Math.max(0, required - planned), isEnough: planned >= required };
  if (planned >= required) return { ...base, suggestion: null };
  const suggestion =
    PRESETS_BY_AGGRESSIVENESS.find(
      (p) => savingsPercent(p) > savingsPercent(preset) && savingsOf(income, p) >= required,
    ) ?? null;
  return { ...base, suggestion };
}

/** Próximo plano mais agressivo (mais poupança) que o atual. */
export const moreAggressive = (preset: Preset): Preset | null =>
  PRESETS_BY_AGGRESSIVENESS.find((p) => savingsPercent(p) > savingsPercent(preset)) ?? null;

/** Novo prazo que reduz a exigência do período em `reduceBy`, ou null se a meta sozinha não cobre. */
export function extendedDeadline(
  remainingAtStart: number, required: number, reduceBy: number, period: PayPeriod, schedule: PaySchedule,
): Day | null {
  const newRequired = required - reduceBy;
  if (reduceBy <= 0 || newRequired <= 0 || remainingAtStart <= 0) return null;
  const periods = Math.ceil(remainingAtStart / newRequired);
  return periodStartAt(periods, period, schedule);
}
