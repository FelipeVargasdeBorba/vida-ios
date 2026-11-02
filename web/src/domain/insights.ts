import type { Day } from './dates';
import type { PayPeriod } from './payPeriod';

export interface PacePoint {
  day: Day;
  /** Gasto acumulado até o fim do dia; null nos dias que ainda não chegaram. */
  spent: number | null;
  /** Quanto já poderia ter sido gasto se o orçamento fosse gasto de forma uniforme. */
  ideal: number;
}

/** Gasto acumulado dia a dia no período, ao lado do ritmo uniforme do orçamento. */
export function paceSeries(period: PayPeriod, today: Day, budget: number, expenses: { day: Day; amount: number }[]): PacePoint[] {
  const n = Math.max(1, period.end - period.start);
  const byDay = new Map<Day, number>();
  for (const e of expenses) if (e.day >= period.start && e.day < period.end) byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.amount);
  const points: PacePoint[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const day = period.start + i;
    acc += byDay.get(day) ?? 0;
    points.push({ day, spent: day <= today ? acc : null, ideal: Math.round((budget * (i + 1)) / n) });
  }
  return points;
}

/** Acumulado dos aportes de uma meta, em ordem de data, começando em zero. */
export function cumulative(items: { day: Day; amount: number }[]): { day: Day; total: number }[] {
  let total = 0;
  return [...items].sort((a, b) => a.day - b.day).map((x) => ({ day: x.day, total: (total += x.amount) }));
}
