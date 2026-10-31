import { type Category, type Percents, split } from './budget';
import type { Day } from './dates';
import { type PayPeriod, type PaySchedule, periodContaining } from './payPeriod';

/** Lançamento reduzido ao que importa para a conta de gastos. */
export type LedgerEntry =
  | { day: Day; cents: number; type: 'salary' }
  | { day: Day; cents: number; type: 'otherIncome' }
  | { day: Day; cents: number; type: 'expense'; category: Category };

/**
 * Saldo acumulado da conta de gastos antes de `period`: soma de (parte do salário para gastos − usado) de cada
 * período anterior, desde o primeiro salário lançado a partir de `since`.
 * "Usado" segue a regra do gasto efetivo: `max(real, fixos)` nos períodos com salário; só o real nos sem salário.
 */
export function carry(
  entries: LedgerEntry[], before: PayPeriod, since: Day, schedule: PaySchedule, percents: Percents,
  fixedPerPeriod: Partial<Record<Category, number>>, spending: ReadonlySet<Category>,
): number {
  const relevant = entries.filter((e) => e.day >= since && e.day < before.start);
  const salaries = relevant.filter((e) => e.type === 'salary').map((e) => e.day);
  if (salaries.length === 0) return 0;
  const start = periodContaining(Math.min(...salaries), schedule).start;

  const income = new Map<Day, number>();
  const spent = new Map<Day, Partial<Record<Category, number>>>();
  for (const e of relevant) {
    if (e.day < start) continue;
    const key = periodContaining(e.day, schedule).start;
    if (e.type === 'salary') income.set(key, (income.get(key) ?? 0) + Math.max(0, e.cents));
    else if (e.type === 'expense') {
      const m = spent.get(key) ?? {};
      m[e.category] = (m[e.category] ?? 0) + e.cents;
      spent.set(key, m);
    }
  }

  let total = 0;
  for (const key of new Set([...income.keys(), ...spent.keys()])) {
    const salary = income.get(key) ?? 0;
    const targets = split(salary, percents);
    for (const c of spending) {
      const real = spent.get(key)?.[c] ?? 0;
      const used = salary > 0 ? Math.max(real, fixedPerPeriod[c] ?? 0) : real;
      total += (targets[c] ?? 0) - used;
    }
  }
  return total;
}

/** Onde a sobra entra (e de onde a falta sai), na ordem: Lazer, Outro, Alimentação, Transporte. */
export const CARRY_ORDER: Category[] = ['lazer', 'outro', 'alimentacao', 'transporte'];

/**
 * Sobra entra inteira na primeira categoria da conta de gastos. Falta é descontada na ordem, sem deixar
 * nenhum alvo negativo; o que não couber continua no saldo e aparece no período seguinte.
 */
export function applyCarry(
  amount: number, targets: Record<Category, number>, spending: ReadonlySet<Category>,
): Record<Category, number> {
  const cats = CARRY_ORDER.filter((c) => spending.has(c));
  const first = cats[0];
  if (amount === 0 || first === undefined) return targets;
  const result = { ...targets };
  if (amount > 0) {
    result[first] = (result[first] ?? 0) + amount;
    return result;
  }
  let debt = -amount;
  for (const c of cats) {
    if (debt <= 0) break;
    const take = Math.min(debt, Math.max(0, result[c] ?? 0));
    result[c] = (result[c] ?? 0) - take;
    debt -= take;
  }
  return result;
}
