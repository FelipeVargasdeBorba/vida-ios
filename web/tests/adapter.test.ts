import { describe, expect, it } from 'vitest';
import { adapt } from '../src/domain/adapter';
import { type BudgetLine, type Category, DEFAULT_FLEXIBLE_ORDER } from '../src/domain/budget';

/** Renda 2000, Equilibrado: casa 560, alim 240, fixos 100, transp 100, outro 600, poup 400. */
function lines(o: { alim?: number; transp?: number; outro?: number } = {}): BudgetLine[] {
  return [
    { category: 'casa', target: 56_000, fixed: 56_000, spent: 0 },
    { category: 'fixos', target: 10_000, fixed: 8_000, spent: 0 },
    { category: 'alimentacao', target: 24_000, fixed: 0, spent: o.alim ?? 5_000 },
    { category: 'transporte', target: 10_000, fixed: 0, spent: o.transp ?? 2_000 },
    { category: 'outro', target: 60_000, fixed: 0, spent: o.outro ?? 0 },
  ];
}

function run(ls: BudgetLine[], o: { planned?: number; required?: number; order?: Category[]; foodMin?: number; days?: number } = {}) {
  return adapt({
    lines: ls, plannedSavings: o.planned ?? 40_000, goalRequired: o.required ?? 40_000,
    flexibleOrder: o.order ?? DEFAULT_FLEXIBLE_ORDER, foodMinimum: o.foodMin ?? 0, daysLeft: o.days ?? 10,
  });
}
const adj = (r: ReturnType<typeof run>, c: Category) => r.lines.find((l) => l.category === c)?.adjusted;

describe('adaptação do plano', () => {
  it('nada a adaptar', () => {
    const r = run(lines({ outro: 10_000 }));
    expect(r.isNeeded).toBe(false);
    expect(r.isFeasible).toBe(true);
    for (const l of r.lines) expect(l.adjusted).toBe(l.original);
    expect(r.adjustedSavings).toBe(40_000);
  });

  it('estouro de Outro corta os demais na ordem', () => {
    const r = run(lines({ outro: 70_000 }));
    expect(r.need).toBe(10_000);
    expect(r.isFeasible).toBe(true);
    expect(adj(r, 'outro')).toBe(70_000);
    expect(adj(r, 'transporte')).toBe(2_000);
    expect(adj(r, 'alimentacao')).toBe(22_000);
    expect(r.adjustedSavings).toBe(40_000);
  });

  it('respeita a ordem personalizada', () => {
    const r = run(lines({ outro: 70_000 }), { order: ['alimentacao', 'outro', 'transporte'] });
    expect(adj(r, 'alimentacao')).toBe(14_000);
    expect(adj(r, 'transporte')).toBe(10_000);
  });

  it('categoria não flexível não é cortada', () => {
    const r = run(lines({ outro: 70_000 }), { order: ['alimentacao'] });
    expect(adj(r, 'transporte')).toBe(10_000);
    expect(adj(r, 'alimentacao')).toBe(14_000);
  });

  it('casa e fixos nunca são cortados', () => {
    const r = run(lines({ outro: 200_000 }), { order: ['casa', 'fixos', 'outro', 'transporte', 'alimentacao'] });
    expect(adj(r, 'casa')).toBe(56_000);
    expect(adj(r, 'fixos')).toBe(10_000);
  });

  it('piso das metas é protegido e a falta entra no que compensar', () => {
    const r = run(lines(), { planned: 40_000, required: 50_000 });
    expect(r.need).toBe(10_000);
    expect(r.adjustedSavings).toBe(50_000);
    expect(r.savingsFloor).toBe(50_000);
    expect(adj(r, 'outro')).toBe(50_000);
  });

  it('poupança acima do piso é a última reserva', () => {
    const r = run(lines({ outro: 90_000, alim: 24_000, transp: 10_000 }), { planned: 40_000, required: 30_000 });
    expect(r.need).toBe(30_000);
    expect(r.adjustedSavings).toBe(30_000);
    expect(r.shortfall).toBe(20_000);
    expect(r.adjustedSavings).toBeGreaterThanOrEqual(r.savingsFloor);
  });

  it('mínimo de alimentação', () => {
    const r = run(lines({ outro: 90_000 }), { foodMin: 20_000 });
    expect(adj(r, 'alimentacao')).toBe(20_000);
    expect(r.shortfall).toBe(30_000 - 8_000 - 4_000);
  });

  it('caso impossível informa a falta e mantém o piso', () => {
    const r = run(lines({ outro: 200_000 }), { planned: 40_000, required: 40_000 });
    expect(r.isFeasible).toBe(false);
    expect(r.need).toBe(140_000);
    expect(r.shortfall).toBe(140_000 - 27_000);
    expect(r.adjustedSavings).toBe(40_000);
    expect(r.dailyAllowance).toBe(0);
  });

  it('valor por dia', () => {
    expect(run(lines(), { days: 10 }).dailyAllowance).toBe(8_700);
  });
});
