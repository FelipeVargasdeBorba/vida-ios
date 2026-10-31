import { describe, expect, it } from 'vitest';
import { billState, isDue, occurrence } from '../src/domain/bills';
import { periodContaining } from '../src/domain/payPeriod';
import { d, monthly, weekly } from './helpers';

describe('contas fixas', () => {
  it('mensal: o vencimento cai dentro do período', () => {
    // Período de 25 out a 24 nov: dia 5 é em novembro, dia 28 é em outubro.
    const p = periodContaining(d(2026, 10, 30), monthly(25));
    expect(occurrence(5, p, 'monthly')).toBe(d(2026, 11, 5));
    expect(occurrence(28, p, 'monthly')).toBe(d(2026, 10, 28));
    expect(occurrence(25, p, 'monthly')).toBe(d(2026, 10, 25));
  });

  it('dia 31 vai para o último dia do mês', () => {
    const p = periodContaining(d(2027, 2, 10), monthly(1));
    expect(occurrence(31, p, 'monthly')).toBe(d(2027, 2, 28));
  });

  it('sem data usa o início do período', () => {
    expect(occurrence(0, periodContaining(d(2026, 10, 30), monthly(25)), 'monthly')).toBe(d(2026, 10, 25));
  });

  it('semanal usa o mês em que o período começa', () => {
    const p = periodContaining(d(2026, 10, 30), weekly(5));
    expect(occurrence(5, p, 'weekly')).toBe(d(2026, 10, 5));
    expect(occurrence(0, p, 'weekly')).toBe(d(2026, 10, 1));
  });

  it('vence neste dia?', () => {
    expect(isDue(5, d(2026, 11, 5))).toBe(true);
    expect(isDue(5, d(2026, 11, 6))).toBe(false);
    expect(isDue(31, d(2026, 11, 30))).toBe(true);
    expect(isDue(0, d(2026, 11, 1))).toBe(false);
  });

  it('situação da conta', () => {
    const due = d(2026, 11, 5);
    expect(billState(due, true, true, d(2026, 11, 9))).toEqual({ type: 'paid' });
    expect(billState(due, true, false, d(2026, 11, 7))).toEqual({ type: 'overdue', days: 2 });
    expect(billState(due, true, false, d(2026, 11, 5))).toEqual({ type: 'dueToday' });
    expect(billState(due, true, false, d(2026, 11, 1))).toEqual({ type: 'upcoming', days: 4 });
    expect(billState(due, false, false, d(2026, 11, 1))).toEqual({ type: 'noDate' });
  });
});
