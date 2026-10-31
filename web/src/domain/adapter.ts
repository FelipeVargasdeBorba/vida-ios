import { type BudgetLine, type Category, CUTTABLE, effective } from './budget';

export interface AdaptationInput {
  lines: BudgetLine[];
  plannedSavings: number;
  /** Poupança exigida pelas metas neste período: piso protegido, nunca reduzido. */
  goalRequired: number;
  /** Ordem de corte; só categorias de `CUTTABLE` são consideradas. */
  flexibleOrder: Category[];
  foodMinimum: number;
  /** Dias até o próximo pagamento, contando hoje. */
  daysLeft: number;
}

export interface AdaptedLine {
  category: Category;
  original: number;
  adjusted: number;
  effective: number;
  remaining: number;
}

export interface AdaptationResult {
  lines: AdaptedLine[];
  originalSavings: number;
  adjustedSavings: number;
  savingsFloor: number;
  /** Excesso nas categorias + o que falta para a poupança cobrir as metas. */
  need: number;
  /** O que não deu para compensar nem cortando tudo que é flexível. */
  shortfall: number;
  dailyAllowance: number;
  isNeeded: boolean;
  isFeasible: boolean;
}

export function adapt(input: AdaptationInput): AdaptationResult {
  const floor = Math.max(0, input.goalRequired);
  const overspend = input.lines.reduce((a, l) => a + Math.max(0, effective(l) - l.target), 0);
  const savingsGap = Math.max(0, floor - input.plannedSavings);
  const need = overspend + savingsGap;

  // Categoria estourada absorve o que já foi gasto; o resto começa no alvo.
  const adjusted = new Map<Category, number>();
  for (const l of input.lines) adjusted.set(l.category, Math.max(l.target, effective(l)));
  let savings = Math.max(input.plannedSavings, floor);

  let left = need;
  const flexible = input.flexibleOrder.filter((c) => CUTTABLE.includes(c));
  for (const c of flexible) {
    if (left <= 0) break;
    const line = input.lines.find((l) => l.category === c);
    if (!line) continue;
    const minimum = Math.max(effective(line), c === 'alimentacao' ? input.foodMinimum : 0);
    const available = Math.max(0, (adjusted.get(c) ?? 0) - minimum);
    const take = Math.min(available, left);
    adjusted.set(c, (adjusted.get(c) ?? 0) - take);
    left -= take;
  }
  // Última reserva: poupança acima do piso das metas (o piso nunca é tocado).
  if (left > 0) {
    const take = Math.min(Math.max(0, savings - floor), left);
    savings -= take;
    left -= take;
  }

  const lines: AdaptedLine[] = input.lines.map((l) => {
    const adj = adjusted.get(l.category) ?? l.target;
    return { category: l.category, original: l.target, adjusted: adj, effective: effective(l), remaining: adj - effective(l) };
  });
  const flexibleLeft = lines.filter((l) => flexible.includes(l.category)).reduce((a, l) => a + Math.max(0, l.remaining), 0);
  return {
    lines,
    originalSavings: input.plannedSavings,
    adjustedSavings: savings,
    savingsFloor: floor,
    need,
    shortfall: left,
    dailyAllowance: Math.floor(flexibleLeft / Math.max(1, input.daysLeft)),
    isNeeded: need > 0,
    isFeasible: left === 0,
  };
}
