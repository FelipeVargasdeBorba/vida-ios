import { describe, expect, it } from 'vitest';
import { presetById } from '../src/domain/budget';
import { allocate, checkSavings, extendedDeadline, goalStatus } from '../src/domain/goals';
import { type PaySchedule, periodContaining, periodCount } from '../src/domain/payPeriod';
import { d, monthly, weekly } from './helpers';

function status(target: number, deadline: number, today: number, schedule: PaySchedule, before = 0, inside = 0) {
  return goalStatus({ targetCents: target, deadline, savedBeforePeriod: before, savedInPeriod: inside },
    periodContaining(today, schedule), schedule, today);
}

describe('metas', () => {
  it('12 meses, mensal', () => {
    const s = status(500_000, d(2027, 10, 1), d(2026, 10, 1), monthly(1));
    expect(s.periodsRemaining).toBe(12);
    expect(s.requiredThisPeriod).toBe(41_667);
    expect(s.monthsRemaining).toBe(12);
    expect(s.remaining).toBe(500_000);
  });

  it('no meio do período, o período atual conta', () => {
    const s = status(500_000, d(2027, 10, 30), d(2026, 10, 30), monthly(1));
    expect(s.periodsRemaining).toBe(13);
    expect(s.requiredThisPeriod).toBe(38_462);
  });

  it('exigência semanal', () => {
    const s = status(100_000, d(2026, 12, 25), d(2026, 10, 30), weekly(5));
    expect(s.periodsRemaining).toBe(8);
    expect(s.requiredThisPeriod).toBe(12_500);
  });

  it('a exigência fica fixa dentro do período', () => {
    const base = status(120_000, d(2027, 10, 1), d(2026, 10, 5), monthly(1));
    const after = status(120_000, d(2027, 10, 1), d(2026, 10, 5), monthly(1), 0, 4_000);
    expect(base.requiredThisPeriod).toBe(10_000);
    expect(after.requiredThisPeriod).toBe(10_000);
    expect(after.remainingThisPeriod).toBe(6_000);
    expect(after.saved).toBe(4_000);
  });

  it('aportes passados reduzem a exigência', () => {
    expect(status(120_000, d(2027, 10, 1), d(2026, 10, 5), monthly(1), 60_000).requiredThisPeriod).toBe(5_000);
  });

  it('atrasada e concluída', () => {
    const overdue = status(100_000, d(2026, 9, 1), d(2026, 10, 5), monthly(1), 20_000);
    expect(overdue.isOverdue).toBe(true);
    expect(overdue.periodsRemaining).toBe(1);
    expect(overdue.requiredThisPeriod).toBe(80_000);
    const done = status(100_000, d(2027, 9, 1), d(2026, 10, 5), monthly(1), 100_000);
    expect(done.isComplete).toBe(true);
    expect(done.requiredThisPeriod).toBe(0);
  });

  it('distribui por prioridade', () => {
    expect(allocate(400, [300, 200])).toEqual([300, 100]);
    expect(allocate(1_000, [300, 200])).toEqual([300, 200]);
    expect(allocate(0, [300])).toEqual([0]);
  });

  it('sugere o plano mais leve que cobre', () => {
    const balanced = presetById('balanced');
    const ok = checkSavings(200_000, balanced, 40_000);
    expect(ok.isEnough).toBe(true);
    expect(ok.suggestion).toBeNull();
    const short = checkSavings(200_000, balanced, 50_000);
    expect(short.isEnough).toBe(false);
    expect(short.shortfall).toBe(10_000);
    expect(short.suggestion?.id).toBe('saver30');
    expect(checkSavings(200_000, balanced, 120_000).suggestion).toBeNull();
  });

  it('prazo estendido', () => {
    const p = periodContaining(d(2026, 10, 1), monthly(1));
    const dl = extendedDeadline(120_000, 10_000, 2_000, p, monthly(1));
    expect(dl).toBe(d(2028, 1, 1));
    expect(periodCount(p, dl!, monthly(1))).toBe(15);
    expect(extendedDeadline(120_000, 10_000, 10_000, p, monthly(1))).toBeNull();
  });
});
