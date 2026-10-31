import { describe, expect, it } from 'vitest';
import { isoWeekday } from '../src/domain/dates';
import {
  daysLeftIn, daysUntilNextPayday, nextPeriod, payday, periodContaining, periodContains, previousPeriod,
} from '../src/domain/payPeriod';
import { d, monthly, weekly } from './helpers';

const period = (day: number, s = monthly(1)) => periodContaining(day, s);

describe('períodos de pagamento', () => {
  it('mensal em dia comum', () => {
    const p = period(d(2026, 10, 30));
    expect(p).toEqual({ start: d(2026, 10, 1), end: d(2026, 11, 1) });
    expect(periodContains(p, d(2026, 10, 31))).toBe(true);
    expect(periodContains(p, d(2026, 11, 1))).toBe(false);
  });

  it('o dia de pagamento é o primeiro dia do período', () => {
    expect(period(d(2026, 10, 15), monthly(15))).toEqual({ start: d(2026, 10, 15), end: d(2026, 11, 15) });
  });

  it('dia 31 em meses curtos', () => {
    expect(period(d(2025, 2, 15), monthly(31))).toEqual({ start: d(2025, 1, 31), end: d(2025, 2, 28) });
    expect(period(d(2025, 2, 28), monthly(31))).toEqual({ start: d(2025, 2, 28), end: d(2025, 3, 31) });
    expect(period(d(2026, 4, 30), monthly(31))).toEqual({ start: d(2026, 4, 30), end: d(2026, 5, 31) });
    expect(period(d(2026, 4, 29), monthly(31))).toEqual({ start: d(2026, 3, 31), end: d(2026, 4, 30) });
  });

  it('ano bissexto', () => {
    for (const day of [29, 30, 31]) {
      expect(payday(2024, 2, day)).toBe(d(2024, 2, 29));
      expect(payday(2025, 2, day)).toBe(d(2025, 2, 28));
    }
    expect(period(d(2024, 2, 29), monthly(30))).toEqual({ start: d(2024, 2, 29), end: d(2024, 3, 30) });
    expect(period(d(2024, 2, 28), monthly(29))).toEqual({ start: d(2024, 1, 29), end: d(2024, 2, 29) });
    expect(period(d(2025, 3, 1), monthly(29))).toEqual({ start: d(2025, 2, 28), end: d(2025, 3, 29) });
  });

  it('virada de ano', () => {
    expect(period(d(2026, 1, 10), monthly(15))).toEqual({ start: d(2025, 12, 15), end: d(2026, 1, 15) });
    expect(period(d(2026, 12, 20), monthly(15))).toEqual({ start: d(2026, 12, 15), end: d(2027, 1, 15) });
  });

  it('próximo e anterior', () => {
    const p = period(d(2025, 2, 10), monthly(31));
    expect(nextPeriod(p, monthly(31))).toEqual({ start: d(2025, 2, 28), end: d(2025, 3, 31) });
    expect(previousPeriod(p, monthly(31))).toEqual({ start: d(2024, 12, 31), end: d(2025, 1, 31) });
  });

  it('semanal', () => {
    expect(period(d(2026, 10, 30), weekly(5))).toEqual({ start: d(2026, 10, 30), end: d(2026, 11, 6) });
    expect(period(d(2026, 11, 5), weekly(5))).toEqual({ start: d(2026, 10, 30), end: d(2026, 11, 6) });
    expect(period(d(2026, 11, 1), weekly(1))).toEqual({ start: d(2026, 10, 26), end: d(2026, 11, 2) });
  });

  it('dias até o próximo pagamento', () => {
    expect(daysUntilNextPayday(d(2026, 10, 30), monthly(1))).toBe(2);
    expect(daysUntilNextPayday(d(2026, 11, 1), monthly(1))).toBe(0);
    expect(daysUntilNextPayday(d(2026, 10, 28), weekly(5))).toBe(2);
    expect(daysUntilNextPayday(d(2025, 2, 20), monthly(31))).toBe(8);
  });

  it('dias restantes contam hoje', () => {
    const p = period(d(2026, 10, 30));
    expect(daysLeftIn(p, d(2026, 10, 30))).toBe(2);
    expect(daysLeftIn(p, d(2026, 10, 1))).toBe(31);
  });

  it('dia da semana ISO', () => {
    expect(isoWeekday(d(2026, 10, 26))).toBe(1);
    expect(isoWeekday(d(2026, 11, 1))).toBe(7);
    expect(isoWeekday(d(1970, 1, 1))).toBe(4);
  });
});
