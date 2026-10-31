import { type Day, dayFromYMD, daysInMonth, isoWeekday, shiftMonth, ymd } from './dates';

export type PayFrequency = 'monthly' | 'weekly';

/** Do dia de pagamento (inclusive) até o próximo (exclusive). */
export interface PayPeriod {
  start: Day;
  end: Day;
}

export interface PaySchedule {
  frequency: PayFrequency;
  /** 1…31. Se o mês não tiver esse dia, usa o último dia do mês. */
  dayOfMonth: number;
  /** ISO: 1 = segunda … 7 = domingo. */
  weekday: number;
}

export const periodContains = (p: PayPeriod, day: Day) => day >= p.start && day < p.end;

/** Data do pagamento num mês, já ajustada ao último dia se necessário. */
export function payday(year: number, month: number, dayOfMonth: number): Day {
  const d = Math.min(Math.max(1, dayOfMonth), daysInMonth(year, month));
  return dayFromYMD(year, month, d);
}

function monthlyPayday(reference: Day, offset: number, schedule: PaySchedule): Day {
  const { y, m } = ymd(reference);
  const s = shiftMonth(y, m, offset);
  return payday(s.y, s.m, schedule.dayOfMonth);
}

export function periodContaining(day: Day, schedule: PaySchedule): PayPeriod {
  if (schedule.frequency === 'monthly') {
    const { y, m } = ymd(day);
    const thisMonth = payday(y, m, schedule.dayOfMonth);
    return day >= thisMonth
      ? { start: thisMonth, end: monthlyPayday(thisMonth, 1, schedule) }
      : { start: monthlyPayday(thisMonth, -1, schedule), end: thisMonth };
  }
  const diff = (isoWeekday(day) - schedule.weekday + 7) % 7;
  const start = day - diff;
  return { start, end: start + 7 };
}

export const nextPeriod = (p: PayPeriod, s: PaySchedule) => periodContaining(p.end, s);
export const previousPeriod = (p: PayPeriod, s: PaySchedule) => periodContaining(p.start - 1, s);

/** 0 quando hoje é dia de pagamento. */
export function daysUntilNextPayday(day: Day, schedule: PaySchedule): number {
  const p = periodContaining(day, schedule);
  return p.start === day ? 0 : p.end - day;
}

/** Dias restantes no período contando hoje (mínimo 1). */
export const daysLeftIn = (p: PayPeriod, day: Day) => Math.max(1, p.end - day);

/** Quantos períodos começam a partir do atual e antes do prazo. Mínimo 1. */
export function periodCount(current: PayPeriod, deadline: Day, schedule: PaySchedule): number {
  let p = current;
  let count = 0;
  while (p.start < deadline && count < 5000) {
    count += 1;
    p = nextPeriod(p, schedule);
  }
  return Math.max(1, count);
}

/** Início do n-ésimo período a partir do atual (0 = atual). */
export function periodStartAt(offset: number, current: PayPeriod, schedule: PaySchedule): Day {
  let p = current;
  for (let i = 0; i < Math.max(0, offset); i++) p = nextPeriod(p, schedule);
  return p.start;
}
