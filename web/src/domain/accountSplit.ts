import { type Category, SPENDING, CATEGORY_TITLE } from './budget';

/** Para onde vai cada fatia do salário quando ele cai no banco. */
export type BankAccount = 'spending' | 'saves' | 'goal';

export const ACCOUNT_TITLE: Record<BankAccount, string> = { spending: 'Conta de gastos', saves: 'Saves', goal: 'Metas' };

export type SliceKind =
  | { type: 'category'; category: Category }
  /** Índice da meta na lista recebida (já ordenada por prioridade). */
  | { type: 'goal'; index: number }
  /** Poupança que sobra depois das metas. */
  | { type: 'reserve' };

export interface SplitSlice {
  kind: SliceKind;
  title: string;
  amount: number;
  account: BankAccount;
}

export interface AccountSplit {
  spending: SplitSlice[];
  saves: SplitSlice[];
  /** Uma fatia por meta, cada uma para a conta da meta. */
  goals: SplitSlice[];
  spendingTotal: number;
  savesTotal: number;
  goalsTotal: number;
  /** O que sai da conta de gastos ao receber: saves + contas das metas. */
  movedOut: number;
  /** O que entra em saves para ser pago logo (aluguel, fixos…). */
  savesBills: number;
  /** O que entra em saves e fica guardado (reserva). */
  savesKept: number;
  all: SplitSlice[];
}

const sum = (xs: SplitSlice[]) => xs.reduce((a, s) => a + s.amount, 0);

/**
 * Divide os alvos do plano entre as contas. A poupança sai da conta de gastos: primeiro a parte de cada meta
 * (para a conta da meta), e o que sobrar vira a reserva em saves. A soma das fatias é a soma dos alvos.
 */
export function splitAccounts(
  targets: Partial<Record<Category, number>>,
  spendingCategories: ReadonlySet<Category>,
  goals: { name: string; allocation: number }[],
): AccountSplit {
  const spending: SplitSlice[] = [];
  const saves: SplitSlice[] = [];
  for (const c of SPENDING) {
    const amount = Math.max(0, targets[c] ?? 0);
    if (amount <= 0) continue;
    const account: BankAccount = spendingCategories.has(c) ? 'spending' : 'saves';
    (account === 'spending' ? spending : saves).push({ kind: { type: 'category', category: c }, title: CATEGORY_TITLE[c], amount, account });
  }
  let savings = Math.max(0, targets.poupanca ?? 0);
  const goalSlices: SplitSlice[] = [];
  goals.forEach((g, index) => {
    const amount = Math.min(savings, Math.max(0, g.allocation));
    savings -= amount;
    if (amount > 0) goalSlices.push({ kind: { type: 'goal', index }, title: g.name, amount, account: 'goal' });
  });
  if (savings > 0) saves.push({ kind: { type: 'reserve' }, title: 'Reserva', amount: savings, account: 'saves' });

  const savesBills = sum(saves.filter((s) => s.kind.type === 'category'));
  const savesTotal = sum(saves);
  const goalsTotal = sum(goalSlices);
  return {
    spending, saves, goals: goalSlices,
    spendingTotal: sum(spending), savesTotal, goalsTotal,
    movedOut: savesTotal + goalsTotal,
    savesBills, savesKept: savesTotal - savesBills,
    all: [...spending, ...saves, ...goalSlices],
  };
}

export interface WalletOverview {
  balance: number;
  incoming: number;
  bills: number;
  /** Saldo depois de receber o salário e pagar as contas que saem de saves. */
  afterPeriod: number;
}

export function wallet(balance: number, split: AccountSplit): WalletOverview {
  const b = Math.max(0, balance);
  return { balance: b, incoming: split.savesTotal, bills: split.savesBills, afterPeriod: b + split.savesTotal - split.savesBills };
}
