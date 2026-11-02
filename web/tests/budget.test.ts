import { describe, expect, it } from 'vitest';
import {
  type BudgetLine, PRESETS, effective, isOver, lineOf, percentsFor, perPeriod, periodIncome,
  presetById, remaining, split, summarize, fixedOver,
} from '../src/domain/budget';
import { parseCents } from '../src/domain/money';

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const balanced = () => percentsFor(presetById('balanced'));

describe('orçamento', () => {
  it('todos os modelos somam 100', () => {
    for (const p of PRESETS) {
      expect(p.values.reduce((a, b) => a + b, 0)).toBe(100);
      expect(sum(percentsFor(p))).toBe(100);
    }
  });

  it('"Outro" é a única categoria flexível além de alimentação e transporte', () => {
    expect(percentsFor(presetById('balanced'))).toEqual({ casa: 28, alimentacao: 12, fixos: 5, transporte: 5, outro: 30, poupanca: 20 });
    expect(percentsFor(presetById('extreme50'))).toMatchObject({ outro: 4, poupanca: 50 });
  });

  it('divisão mensal do equilibrado', () => {
    const t = split(200_000, balanced());
    expect(t).toMatchObject({ casa: 56_000, alimentacao: 24_000, fixos: 10_000, transporte: 10_000, outro: 60_000, poupanca: 40_000 });
  });

  it('a soma é exata com centavos quebrados', () => {
    for (const income of [100_001, 33_333, 1, 99, 123_457]) {
      for (const p of PRESETS) expect(sum(split(income, percentsFor(p)))).toBe(income);
    }
  });

  it('converte fixo mensal para semanal', () => {
    expect(perPeriod(100_000, 'monthly')).toBe(100_000);
    expect(perPeriod(100_000, 'weekly')).toBe(23_077);
    expect(perPeriod(80_000, 'weekly')).toBe(18_462);
    expect(perPeriod(5_200, 'weekly')).toBe(1_200);
  });

  it('resumo mensal e semanal', () => {
    const p = balanced();
    const m = summarize(200_000, split(200_000, p), { casa: 80_000 }, { alimentacao: 5_000 });
    expect(m.savings).toBe(40_000);
    expect(m.totalFixed).toBe(80_000);
    expect(isOver(lineOf(m, 'casa')!)).toBe(true);
    expect(fixedOver(lineOf(m, 'casa')!)).toBe(true);
    expect(remaining(lineOf(m, 'alimentacao')!)).toBe(19_000);

    const w = summarize(50_000, split(50_000, p), { casa: perPeriod(80_000, 'weekly') }, {});
    expect(w.savings).toBe(10_000);
    expect(lineOf(w, 'casa')!.target).toBe(14_000);
    expect(w.totalFixed).toBe(18_462);
  });

  it('gasto efetivo usa o fixo até lançar o real', () => {
    const line: BudgetLine = { category: 'casa', target: 60_000, fixed: 50_000, spent: 0 };
    expect(effective(line)).toBe(50_000);
    expect(isOver(line)).toBe(false);
    const paid = { ...line, spent: 65_000 };
    expect(effective(paid)).toBe(65_000);
    expect(isOver(paid)).toBe(true);
  });

  it('renda do período conta só salário', () => {
    expect(periodIncome([])).toBe(0);
    expect(periodIncome([{ cents: 150_000, isSalary: true }, { cents: 20_000, isSalary: false }, { cents: 30_000, isSalary: true }])).toBe(180_000);
    expect(periodIncome([{ cents: 50_000, isSalary: false }])).toBe(0);
  });

  it('lê valores digitados', () => {
    expect(parseCents('12,50')).toBe(1250);
    expect(parseCents('12.5')).toBe(1250);
    expect(parseCents('1.234,56')).toBe(123_456);
    expect(parseCents('1,234.56')).toBe(123_456);
    expect(parseCents('5000')).toBe(500_000);
    expect(parseCents('1.000')).toBe(100_000);
    expect(parseCents('')).toBeNull();
  });
});
