import { type Day, dayFromYMD, daysInMonth, shiftMonth, ymd } from './dates';
import { type PayFrequency, type PayPeriod, payday, periodContains } from './payPeriod';

/** Situação de uma conta fixa no período. */
export type BillState =
  | { type: 'paid' }
  | { type: 'overdue'; days: number }
  | { type: 'dueToday' }
  | { type: 'upcoming'; days: number }
  /** Conta sem dia de vencimento definido. */
  | { type: 'noDate' };

/**
 * Data da conta que vale para o período. O dia é ajustado ao último dia do mês quando ele não existe.
 * Mensal: a ocorrência dentro do período. Semanal: a do mês em que o período começa.
 * Sem dia definido (0): início do período (mensal) ou do mês (semanal).
 */
export function occurrence(dueDay: number, period: PayPeriod, frequency: PayFrequency): Day {
  const { y, m } = ymd(period.start);
  if (dueDay <= 0) return frequency === 'monthly' ? period.start : payday(y, m, 1);
  const inStartMonth = payday(y, m, dueDay);
  if (frequency !== 'monthly' || periodContains(period, inStartMonth)) return inStartMonth;
  const n = shiftMonth(y, m, 1);
  const inNextMonth = payday(n.y, n.m, dueDay);
  return periodContains(period, inNextMonth) ? inNextMonth : inStartMonth;
}

/** A conta vence neste dia? (Dia ajustado ao último dia do mês.) */
export function isDue(dueDay: number, day: Day): boolean {
  if (dueDay <= 0) return false;
  const { y, m } = ymd(day);
  return Math.min(dueDay, daysInMonth(y, m)) === ymd(day).d;
}

export function billState(due: Day, hasDueDay: boolean, paid: boolean, today: Day): BillState {
  if (paid) return { type: 'paid' };
  if (!hasDueDay) return { type: 'noDate' };
  const days = due - today;
  if (days < 0) return { type: 'overdue', days: -days };
  return days === 0 ? { type: 'dueToday' } : { type: 'upcoming', days };
}

export { dayFromYMD };
