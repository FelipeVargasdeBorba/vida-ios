import { describe, expect, it } from 'vitest';
import { cumulative, paceSeries } from '../src/domain/insights';
import { d } from './helpers';

describe('paceSeries', () => {
  const period = { start: d(2026, 11, 1), end: d(2026, 11, 11) };
  it('acumula o gasto por dia e deixa o futuro vazio', () => {
    const s = paceSeries(period, d(2026, 11, 3), 1000, [
      { day: d(2026, 11, 1), amount: 100 }, { day: d(2026, 11, 3), amount: 50 }, { day: d(2026, 11, 3), amount: 25 },
      { day: d(2026, 10, 30), amount: 999 }, { day: d(2026, 11, 11), amount: 999 },
    ]);
    expect(s).toHaveLength(10);
    expect(s.slice(0, 4).map((p) => p.spent)).toEqual([100, 100, 175, null]);
    expect(s[9]?.ideal).toBe(1000);
    expect(s[0]?.ideal).toBe(100);
  });
  it('funciona com orçamento zero', () => {
    expect(paceSeries(period, d(2026, 11, 1), 0, []).every((p) => p.ideal === 0)).toBe(true);
  });
});

describe('cumulative', () => {
  it('ordena por data e soma', () => {
    expect(cumulative([{ day: 5, amount: 20 }, { day: 2, amount: 10 }])).toEqual([{ day: 2, total: 10 }, { day: 5, total: 30 }]);
  });
});
