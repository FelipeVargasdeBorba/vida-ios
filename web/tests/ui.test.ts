// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { dayFromYMD } from '../src/domain/dates';
import { defaultState, newId } from '../src/state';
import { makeFinanceModel } from '../src/financeModel';
import { store } from '../src/store';
import { agendaAllView, agendaView, workView } from '../src/ui/agenda';
import { adaptationView, dashboard, fixedView, goalDetailView, goalsView, historyDetailView, historyView, transactionsView } from '../src/ui/finance';
import { noteListView, notesView } from '../src/ui/notes';
import { backupView, setupView } from '../src/ui/settings';

const today = dayFromYMD(2026, 11, 10);

function seed(): string {
  const s = defaultState();
  const goalId = newId();
  s.transactions.push({ id: newId(), kind: 'income', source: 'salary', amount: 200000, day: today - 3, category: 'outro', note: '' });
  s.transactions.push({ id: newId(), kind: 'expense', source: 'other', amount: 4500, day: today - 1, category: 'alimentacao', note: 'mercado' });
  s.fixed.push({ id: newId(), name: 'Aluguel', category: 'casa', monthly: 60000, dueDay: 5, remindOn: true });
  s.goals.push({ id: goalId, name: 'Viagem', target: 120000, deadline: dayFromYMD(2027, 6, 1), priority: 0 });
  s.settings.adaptEnabled = true;
  store.replace(s);
  return goalId;
}

describe('telas', () => {
  it('desenham sem erro com dados', () => {
    const goalId = seed();
    const ctx = (path: string[] = []) => ({ today, path });
    const views = [
      dashboard(ctx()), transactionsView(ctx()), fixedView(ctx()), goalsView(ctx()), goalDetailView(ctx(['goal', goalId])),
      historyView(), adaptationView(ctx()), setupView(ctx()), backupView(), agendaView(ctx()), agendaAllView(ctx()), workView(),
      notesView(ctx()), noteListView(ctx(['list', store.state.noteLists[0]!.id])),
    ];
    for (const v of views) expect(v.el.textContent?.length).toBeGreaterThan(0);
    expect(views[0]!.el.textContent).toContain('Checklist');
    expect(views[0]!.el.textContent).toContain('Aluguel');
  });

  it('mostra o saldo da conta de gastos e os gráficos interativos', () => {
    const goalId = seed();
    store.update((s) => {
      s.contributions.push({ id: newId(), goalId, amount: 5000, day: today - 5, note: '' }, { id: newId(), goalId, amount: 7000, day: today - 2, note: '' });
    });
    const m = makeFinanceModel(store.state, today);
    expect(m.spendingSpent).toBe(4500);
    expect(m.spendingLeft).toBe(m.split.spendingTotal - 4500);
    const home = dashboard({ today, path: [] }).el;
    expect(home.textContent).toContain('Conta de gastos agora');
    expect(home.querySelector('svg.chart')).not.toBeNull();
    const arc = home.querySelector('.donut-arc.pickable') as SVGElement;
    arc.dispatchEvent(new Event('click'));
    expect(home.querySelector('.donut-text')?.textContent).toContain('do salário');
    const goal = goalDetailView({ today, path: ['goal', goalId] }).el;
    expect(goal.querySelector('svg.chart')).not.toBeNull();
    const chart = goal.querySelector('svg.chart') as SVGElement;
    chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(goal.querySelector('.readout')?.textContent).toContain('Guardado');
  });

  it('mostra o pedido de salário sem entradas', () => {
    store.replace(defaultState());
    expect(dashboard({ today, path: [] }).el.textContent).toContain('Recebeu o salário?');
    expect(historyDetailView({ today, path: ['history', 'x'] }).el.textContent).toContain('Não encontrado');
  });
});
