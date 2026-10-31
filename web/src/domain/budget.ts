import type { PayFrequency } from './payPeriod';

export type Category = 'casa' | 'fixos' | 'alimentacao' | 'transporte' | 'lazer' | 'outro' | 'poupanca';

/** Ordem fixa: o desempate do maior resto depende dela. */
export const ALL_CATEGORIES: Category[] = ['casa', 'fixos', 'alimentacao', 'transporte', 'lazer', 'outro', 'poupanca'];
/** Categorias onde se gasta (tudo menos poupança). */
export const SPENDING: Category[] = ['casa', 'fixos', 'alimentacao', 'transporte', 'lazer', 'outro'];
/** Categorias que podem ser cortadas na adaptação. */
export const CUTTABLE: Category[] = ['lazer', 'outro', 'transporte', 'alimentacao'];
export const DEFAULT_FLEXIBLE_ORDER: Category[] = ['lazer', 'outro', 'transporte', 'alimentacao'];
/** Gastos do dia a dia que costumam ficar na conta de gastos. */
export const DEFAULT_SPENDING_ACCOUNT: Category[] = ['alimentacao', 'transporte', 'lazer', 'outro'];

export const CATEGORY_TITLE: Record<Category, string> = {
  casa: 'Casa', fixos: 'Gastos fixos', alimentacao: 'Alimentação', transporte: 'Transporte',
  lazer: 'Lazer', outro: 'Outro', poupanca: 'Poupança',
};

/** Nome no registro de transações. */
export const TRANSACTION_TITLE: Record<Category, string> = {
  ...CATEGORY_TITLE, casa: 'Casa/aluguel', lazer: 'Entretenimento',
};

export const CATEGORY_ICON: Record<Category, string> = {
  casa: '🏠', fixos: '📌', alimentacao: '🛒', transporte: '🚆', lazer: '🎭', outro: '⋯', poupanca: '💰',
};

export type PresetId = 'balanced' | 'moreLeisure' | 'saver30' | 'aggressive40' | 'extreme50';

export interface Preset {
  id: PresetId;
  title: string;
  /** Casa, Alimentação, Fixos, Transporte, Lazer, Poupança. Cada um soma 100. */
  values: [number, number, number, number, number, number];
}

export const PRESETS: Preset[] = [
  { id: 'balanced', title: 'Equilibrado 50/30/20', values: [28, 12, 5, 5, 30, 20] },
  { id: 'moreLeisure', title: 'Mais lazer', values: [35, 13, 5, 7, 30, 10] },
  { id: 'saver30', title: 'Poupador 30%', values: [30, 12, 8, 5, 15, 30] },
  { id: 'aggressive40', title: 'Agressivo 40%', values: [30, 12, 8, 5, 5, 40] },
  { id: 'extreme50', title: 'Extremo 50%', values: [28, 10, 5, 3, 4, 50] },
];

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;

export type Percents = Record<Category, number>;

export function basePercents(p: Preset): Percents {
  const [casa, alimentacao, fixos, transporte, lazer, poupanca] = p.values;
  return { casa, alimentacao, fixos, transporte, lazer, outro: 0, poupanca };
}

/** Percentuais com a fatia de "Outro" tirada do Lazer (limitada ao próprio Lazer). */
export function percentsFor(p: Preset, outroPoints: number): Percents {
  const out = basePercents(p);
  const outro = Math.min(Math.max(0, outroPoints), out.lazer);
  out.lazer -= outro;
  out.outro = outro;
  return out;
}

export const savingsPercent = (p: Preset) => p.values[5];

export function presetSummary(p: Preset): string {
  const [casa, alim, fixos, transp, lazer, poup] = p.values;
  return `Casa ${casa} · Alim. ${alim} · Fixos ${fixos} · Transp. ${transp} · Lazer ${lazer} · Poup. ${poup}`;
}

/** Do que menos poupa para o que mais poupa. */
export const PRESETS_BY_AGGRESSIVENESS: Preset[] = [...PRESETS].sort((a, b) => savingsPercent(a) - savingsPercent(b));

export type CentsByCategory = Partial<Record<Category, number>>;

export interface BudgetLine {
  category: Category;
  /** Alvo do plano no período. */
  target: number;
  /** Fixos comprometidos no período. */
  fixed: number;
  /** Gasto real lançado no período. */
  spent: number;
}

/** O que conta como usado: o real, ou os fixos se ainda não foram lançados. */
export const effective = (l: BudgetLine) => Math.max(l.spent, l.fixed);
export const remaining = (l: BudgetLine) => l.target - effective(l);
export const isOver = (l: BudgetLine) => effective(l) > l.target;
export const fixedOver = (l: BudgetLine) => l.fixed > l.target;
export const progress = (l: BudgetLine) =>
  l.target > 0 ? Math.min(1, effective(l) / l.target) : effective(l) > 0 ? 1 : 0;

export interface BudgetSummary {
  income: number;
  savings: number;
  totalFixed: number;
  lines: BudgetLine[];
}

export const totalSpent = (s: BudgetSummary) => s.lines.reduce((a, l) => a + l.spent, 0);
export const lineOf = (s: BudgetSummary, c: Category) => s.lines.find((l) => l.category === c);

/** Divide a renda pelos percentuais com o método do maior resto: a soma bate exatamente. */
export function split(incomeCents: number, percents: Partial<Percents>): Record<Category, number> {
  const income = Math.max(0, incomeCents);
  const totalPercent = ALL_CATEGORIES.reduce((a, c) => a + Math.max(0, percents[c] ?? 0), 0);
  const result = {} as Record<Category, number>;
  const remainders: { c: Category; rem: number; idx: number }[] = [];
  let allocated = 0;
  ALL_CATEGORIES.forEach((c, idx) => {
    const exact = income * Math.max(0, percents[c] ?? 0);
    result[c] = Math.floor(exact / 100);
    allocated += result[c];
    remainders.push({ c, rem: exact % 100, idx });
  });
  let leftover = Math.floor((income * totalPercent) / 100) - allocated;
  remainders.sort((a, b) => (a.rem !== b.rem ? b.rem - a.rem : a.idx - b.idx));
  for (const r of remainders) {
    if (leftover > 0 && r.rem > 0) {
      result[r.c] += 1;
      leftover -= 1;
    }
  }
  return result;
}

/** Renda do período: só as entradas marcadas como salário. Outras entradas não mudam o plano. */
export const periodIncome = (entries: { cents: number; isSalary: boolean }[]) =>
  entries.reduce((a, e) => a + (e.isSalary ? Math.max(0, e.cents) : 0), 0);

/** Converte um gasto fixo mensal para o período (semanal: ×12/52, arredondado). */
export function perPeriod(monthlyCents: number, frequency: PayFrequency): number {
  return frequency === 'monthly' ? monthlyCents : Math.floor((monthlyCents * 12 + 26) / 52);
}

/** Resumo com alvos já prontos (ex.: com a sobra do período anterior aplicada). */
export function summarize(
  incomeCents: number,
  targets: Record<Category, number>,
  fixedBy: CentsByCategory,
  spentBy: CentsByCategory,
): BudgetSummary {
  return {
    income: Math.max(0, incomeCents),
    savings: targets.poupanca ?? 0,
    totalFixed: Object.values(fixedBy).reduce((a, v) => a + (v ?? 0), 0),
    lines: SPENDING.map((c) => ({ category: c, target: targets[c] ?? 0, fixed: fixedBy[c] ?? 0, spent: spentBy[c] ?? 0 })),
  };
}
