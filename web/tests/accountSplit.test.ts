import { describe, expect, it } from 'vitest';
import { splitAccounts, wallet } from '../src/domain/accountSplit';
import { DEFAULT_SPENDING_ACCOUNT, type PresetId, percentsFor, presetById, PRESETS, split } from '../src/domain/budget';

const defaults = new Set(DEFAULT_SPENDING_ACCOUNT);
const targets = (income: number, preset: PresetId = 'balanced', outro = 5) => split(income, percentsFor(presetById(preset), outro));
const kinds = (xs: { kind: { type: string } }[]) => xs.map((x) => x.kind.type);

describe('divisão entre contas', () => {
  it('o dia a dia fica na conta de gastos', () => {
    const s = splitAccounts(targets(200_000), defaults, []);
    expect(s.spending.map((x) => (x.kind.type === 'category' ? x.kind.category : x.kind.type)))
      .toEqual(['alimentacao', 'transporte', 'lazer', 'outro']);
    expect(s.spendingTotal).toBe(94_000);
    expect(s.saves.map((x) => (x.kind.type === 'category' ? x.kind.category : x.kind.type))).toEqual(['casa', 'fixos', 'reserve']);
    expect(s.savesTotal).toBe(106_000);
  });

  it('as fatias sempre somam a renda', () => {
    for (const income of [1, 99, 33_333, 123_457, 250_000]) {
      for (const p of PRESETS) {
        const s = splitAccounts(targets(income, p.id), defaults, [{ name: 'A', allocation: Math.floor(income / 7) }, { name: 'B', allocation: income }]);
        expect(s.spendingTotal + s.savesTotal + s.goalsTotal).toBe(income);
        expect(s.movedOut).toBe(income - s.spendingTotal);
      }
    }
  });

  it('cada meta tem a sua conta e o resto é reserva em saves', () => {
    const s = splitAccounts(targets(200_000), defaults, [
      { name: 'Viagem', allocation: 25_000 }, { name: 'Carro', allocation: 10_000 }, { name: 'Sem aporte', allocation: 0 },
    ]);
    expect(s.goals.map((g) => g.amount)).toEqual([25_000, 10_000]);
    expect(s.goals.map((g) => g.title)).toEqual(['Viagem', 'Carro']);
    expect(s.goals.every((g) => g.account === 'goal')).toBe(true);
    expect(kinds(s.saves)).not.toContain('goal');
    expect(s.saves.at(-1)?.kind.type).toBe('reserve');
    expect(s.saves.at(-1)?.amount).toBe(5_000);
  });

  it('as metas nunca levam mais que a poupança', () => {
    const s = splitAccounts(targets(200_000), defaults, [{ name: 'Grande', allocation: 30_000 }, { name: 'Maior', allocation: 30_000 }]);
    expect(s.goalsTotal).toBe(40_000);
    expect(s.goals.at(-1)?.amount).toBe(10_000);
    expect(kinds(s.saves)).not.toContain('reserve');
  });

  it('contas pagas saem de saves', () => {
    const s = splitAccounts(targets(200_000), defaults, [{ name: 'Viagem', allocation: 10_000 }]);
    expect(s.savesBills).toBe(66_000);
    expect(s.savesKept).toBe(30_000);
    expect(s.savesTotal).toBe(96_000);
    expect(s.goalsTotal).toBe(10_000);
  });

  it('categoria movida para saves', () => {
    const s = splitAccounts(targets(200_000), new Set(['alimentacao', 'lazer', 'outro'] as const), []);
    expect(s.spending.some((x) => x.kind.type === 'category' && x.kind.category === 'transporte')).toBe(false);
    expect(s.saves.some((x) => x.kind.type === 'category' && x.kind.category === 'transporte')).toBe(true);
  });

  it('alvos zerados ficam de fora', () => {
    const s = splitAccounts(targets(200_000, 'extreme50'), defaults, []);
    expect(s.all.some((x) => x.kind.type === 'category' && x.kind.category === 'lazer')).toBe(false);
  });

  it('carteira de saves', () => {
    const s = splitAccounts(targets(200_000), defaults, [{ name: 'Faculdade', allocation: 15_000 }]);
    const w = wallet(500_000, s);
    expect(w.incoming).toBe(91_000);
    expect(w.bills).toBe(66_000);
    expect(w.afterPeriod).toBe(525_000);
  });
});
