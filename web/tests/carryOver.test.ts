import { describe, expect, it } from 'vitest';
import { DEFAULT_SPENDING_ACCOUNT, type Category, percentsFor, presetById, split } from '../src/domain/budget';
import { type LedgerEntry, applyCarry, carry } from '../src/domain/carryOver';
import { periodContaining } from '../src/domain/payPeriod';
import { d, weekly } from './helpers';

const schedule = weekly(5); // sextas: 30 out, 6 nov, 13 nov, 20 nov de 2026
const percents = percentsFor(presetById('balanced'), 5);
const spending = new Set<Category>(DEFAULT_SPENDING_ACCOUNT);
const week = (day: number, month = 11) => periodContaining(d(2026, month, day), schedule);

const salary = (cents: number, m: number, day: number): LedgerEntry => ({ day: d(2026, m, day), cents, type: 'salary' });
const spend = (cents: number, category: Category, m: number, day: number): LedgerEntry => ({ day: d(2026, m, day), cents, type: 'expense', category });
const run = (entries: LedgerEntry[], before = week(6), since = -1e9, fixed: Partial<Record<Category, number>> = {}) =>
  carry(entries, before, since, schedule, percents, fixed, spending);

describe('sobra da conta de gastos', () => {
  it('a sobra da semana vai para a seguinte', () => {
    const entries = [salary(50_000, 10, 30), spend(5_000, 'lazer', 11, 1), salary(50_000, 11, 6)];
    expect(run(entries)).toBe(18_500);
    const targets = split(50_000, percents);
    const applied = applyCarry(18_500, targets, spending);
    expect(applied.lazer).toBe(12_500 + 18_500);
    expect(applied.alimentacao).toBe(targets.alimentacao);
    expect(applied.poupanca).toBe(targets.poupanca);
  });

  it('o gasto a mais é descontado da semana seguinte', () => {
    const entries = [salary(50_000, 10, 30), spend(30_000, 'lazer', 11, 2)];
    expect(run(entries)).toBe(-6_500);
    expect(applyCarry(-6_500, split(50_000, percents), spending).lazer).toBe(6_000);
  });

  it('acumula ao longo das semanas', () => {
    const entries = [
      salary(50_000, 10, 30), spend(20_000, 'alimentacao', 11, 1), // sobra 35,00
      salary(50_000, 11, 6), spend(23_500, 'lazer', 11, 7), // usou o plano todo
      salary(50_000, 11, 13), spend(25_000, 'outro', 11, 14), // passou 15,00
    ];
    expect(run(entries, week(6))).toBe(3_500);
    expect(run(entries, week(13))).toBe(3_500);
    expect(run(entries, week(20))).toBe(2_000);
  });

  it('só as categorias da conta de gastos contam', () => {
    const entries: LedgerEntry[] = [salary(50_000, 10, 30), spend(40_000, 'casa', 11, 1), { day: d(2026, 11, 2), cents: 99_000, type: 'otherIncome' }];
    expect(run(entries)).toBe(23_500);
  });

  it('fixo na conta de gastos conta como usado', () => {
    expect(run([salary(50_000, 10, 30)], week(6), -1e9, { transporte: 2_000 })).toBe(23_500 - 2_000);
  });

  it('nada antes do primeiro salário nem antes de zerar', () => {
    const entries = [spend(10_000, 'lazer', 10, 20), salary(50_000, 10, 30)];
    expect(run(entries, week(30, 10))).toBe(0);
    expect(run(entries, week(6))).toBe(23_500);
    expect(run(entries, week(6), week(6).start)).toBe(0);
  });

  it('a dívida nunca deixa um alvo negativo', () => {
    const targets = { casa: 0, fixos: 0, alimentacao: 2_000, transporte: 300, lazer: 1_000, outro: 500, poupanca: 0 };
    const applied = applyCarry(-3_000, targets, spending);
    expect([applied.lazer, applied.outro, applied.alimentacao, applied.transporte]).toEqual([0, 0, 500, 300]);
    expect(Math.min(...Object.values(applyCarry(-99_000, targets, spending)))).toBe(0);
  });

  it('a sobra vai para a primeira categoria da conta de gastos', () => {
    const t = { casa: 0, fixos: 0, alimentacao: 0, transporte: 0, lazer: 0, outro: 0, poupanca: 0 };
    expect(applyCarry(1_000, t, new Set<Category>(['alimentacao', 'transporte'])).alimentacao).toBe(1_000);
    expect(applyCarry(1_000, t, new Set<Category>())).toEqual(t);
  });
});
