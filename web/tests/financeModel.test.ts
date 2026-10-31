import { describe, expect, it } from 'vitest';
import { makeFinanceModel } from '../src/financeModel';
import { type AppState, defaultState } from '../src/state';
import { d } from './helpers';

function state(over: (s: AppState) => void): AppState {
  const s = defaultState();
  over(s);
  return s;
}

describe('modelo de finanças', () => {
  it('sem salário lançado não há renda nem divisão', () => {
    const m = makeFinanceModel(defaultState(), d(2026, 10, 30));
    expect(m.income).toBe(0);
    expect(m.split.all).toEqual([]);
  });

  it('só o salário define a renda do período', () => {
    const s = state((x) => {
      x.transactions.push(
        { id: 'a', kind: 'income', source: 'salary', amount: 200_000, day: d(2026, 10, 1), category: 'outro', note: '' },
        { id: 'b', kind: 'income', source: 'other', amount: 50_000, day: d(2026, 10, 2), category: 'outro', note: '' },
        { id: 'c', kind: 'income', source: 'salary', amount: 999, day: d(2026, 9, 1), category: 'outro', note: '' },
      );
    });
    const m = makeFinanceModel(s, d(2026, 10, 30));
    expect(m.income).toBe(200_000);
    expect(m.incomeLogged).toBe(250_000);
  });

  it('semana 2 recebe a sobra da semana 1 (simulação)', () => {
    const s = state((x) => {
      x.settings.frequency = 'weekly';
      x.settings.payWeekday = 5;
      x.transactions.push(
        { id: '1', kind: 'income', source: 'salary', amount: 50_000, day: d(2026, 10, 30), category: 'outro', note: '' },
        { id: '2', kind: 'expense', source: 'salary', amount: 5_000, day: d(2026, 11, 1), category: 'lazer', note: '' },
        { id: '3', kind: 'income', source: 'salary', amount: 50_000, day: d(2026, 11, 6), category: 'outro', note: '' },
      );
    });
    const w1 = makeFinanceModel(s, d(2026, 11, 5));
    const w2 = makeFinanceModel(s, d(2026, 11, 6));
    expect(w1.split.spendingTotal).toBe(23_500);
    expect(w2.carry).toBe(18_500);
    expect(w2.summary.lines.find((l) => l.category === 'lazer')?.target).toBe(31_000);
    expect(w2.split.spendingTotal).toBe(42_000);
    expect(w2.split.savesTotal).toBe(w1.split.savesTotal);
  });
});

describe('transferência para a meta', () => {
  const base = (transferred: number | null) => state((x) => {
    x.transactions.push({ id: 's', kind: 'income', source: 'salary', amount: 200_000, day: d(2026, 10, 1), category: 'outro', note: '' });
    x.goals.push({ id: 'g', name: 'Faculdade', target: 120_000, deadline: d(2027, 9, 30), priority: 0 });
    if (transferred !== null) x.contributions.push({ id: 'c', goalId: 'g', amount: transferred, day: d(2026, 10, 5), note: '' });
  });
  const today = d(2026, 10, 30);

  it('valor do plano quando nada foi transferido', () => {
    const row = makeFinanceModel(base(null), today).goals[0]!;
    expect(row.allocation).toBeGreaterThan(0);
    expect(row.toMove).toBe(row.allocation);
    expect(row.effectiveAllocation).toBe(row.allocation);
  });

  it('transferir mais que o plano é o que vale', () => {
    const plan = makeFinanceModel(base(null), today).goals[0]!.allocation;
    const m = makeFinanceModel(base(plan + 200), today);
    const row = m.goals[0]!;
    expect(row.isDone).toBe(true);
    expect(row.toMove).toBe(0);
    expect(row.transferred).toBe(plan + 200);
    expect(m.split.goals[0]?.amount).toBe(plan + 200);
    expect(m.split.spendingTotal + m.split.savesTotal + m.split.goalsTotal).toBe(200_000);
    expect(m.split.savesKept).toBeLessThan(40_000 - plan);
  });

  it('transferir menos deixa a diferença pendente', () => {
    const plan = makeFinanceModel(base(null), today).goals[0]!.allocation;
    const row = makeFinanceModel(base(plan - 300), today).goals[0]!;
    expect(row.isDone).toBe(false);
    expect(row.toMove).toBe(300);
    expect(row.effectiveAllocation).toBe(plan);
  });

  it('a exigência fica fixa no período e o guardado conta', () => {
    const a = makeFinanceModel(base(null), today).goals[0]!.status;
    const b = makeFinanceModel(base(20_000), today).goals[0]!.status;
    expect(b.requiredThisPeriod).toBe(a.requiredThisPeriod);
    expect(b.saved).toBe(20_000);
    expect(b.remaining).toBe(100_000);
  });
});

describe('contas do checklist', () => {
  it('lista o vencimento do período e respeita o pago', () => {
    const s = state((x) => {
      x.fixed.push({ id: 'f', name: 'Aluguel', category: 'casa', monthly: 70_000, dueDay: 5, remindOn: true });
    });
    const today = d(2026, 10, 30);
    const open = makeFinanceModel(s, today).bills[0]!;
    expect(open.due).toBe(d(2026, 10, 5));
    expect(open.state).toEqual({ type: 'overdue', days: 25 });
    s.checks.push({ id: 'k', kind: 'bill', forDay: open.due, fixedId: 'f' });
    expect(makeFinanceModel(s, today).bills[0]!.state).toEqual({ type: 'paid' });
  });
});
