import { ACCOUNT_TITLE, type BankAccount } from '../domain/accountSplit';
import { type BillState } from '../domain/bills';
import {
  CATEGORY_ICON, CATEGORY_TITLE, type BudgetLine, type Category, SPENDING, TRANSACTION_TITLE, effective, fixedOver, isOver, progress, remaining,
} from '../domain/budget';
import { backupIsStale } from '../backup';
import { sync, syncConfigured } from '../sync';
import { GOAL_NOTE, hasData, deleteGoal, resetCarry, saveSnapshot, setSavesBalance, toggleBill, toggleTransfer, undoGoalTransfer } from '../actions';
import { type FinanceModel, type GoalRow, currentPeriod, makeFinanceModel, scheduleOf } from '../financeModel';
import { moreAggressive, extendedDeadline } from '../domain/goals';
import { type PayPeriod, nextPeriod, periodContains, previousPeriod } from '../domain/payPeriod';
import { PRESETS, presetById } from '../domain/budget';
import { cumulative, paceSeries } from '../domain/insights';
import { store } from '../store';
import { areaChart, barChart } from './charts';
import {
  bar, button, catColor, confirmDialog, donut, emptyState, goalColor, iconBadge, linkRow, moneyInput, openSheet, section, sliceColor, toast, valueRow,
} from './components';
import { contributionSheet, exportBillToCalendar, fixedSheet, goalSheet, transactionSheet } from './forms';
import { fmtFull, fmtLong, fmtPeriod, fmtShort, fmtStamp, money, plural } from './format';
import { type Child, h, put } from './dom';
import { type Ctx, type View, hrefTo } from './view';

const FINANCE = 'finance';
const accountIcon: Record<BankAccount, string> = { spending: '💳', saves: '🌿', goal: '🎯' };

function backupBanner(cloud: boolean): HTMLElement {
  const never = store.state.settings.lastBackupAt === null;
  return h('section', { class: 'group' }, h('a', { class: 'card banner', href: hrefTo(FINANCE, cloud ? 'account' : 'backup') },
    h('span', { class: 'banner-icon', 'aria-hidden': 'true' }, '☁️'),
    h('span', { class: 'grow' }, h('span', { class: 'row-title block' }, cloud ? 'Salve na sua conta' : never ? 'Faça seu primeiro backup' : 'Backup desatualizado'),
      h('span', { class: 'caption block' }, cloud ? 'Entre para guardar tudo na nuvem e abrir em qualquer celular.' : 'Perdeu o celular, perdeu tudo. Leva 10 segundos.')),
    h('span', { class: 'chev' }, '›')));
}

function checkCircle(done: boolean, color: string): HTMLElement {
  const el = h('span', { class: `check${done ? ' done' : ''}`, 'aria-hidden': 'true' }, done ? '✓' : '');
  el.style.setProperty('--c', color);
  return el;
}

function billSubtitle(state: BillState, due: number): { text: string; tone: 'bad' | 'warn' | '' } {
  switch (state.type) {
    case 'paid': return { text: 'pago', tone: '' };
    case 'overdue': return { text: `venceu há ${plural(state.days, 'dia', 'dias')}`, tone: 'bad' };
    case 'dueToday': return { text: 'vence hoje', tone: 'warn' };
    case 'upcoming': return state.days <= 3 ? { text: `vence em ${plural(state.days, 'dia', 'dias')}`, tone: 'warn' } : { text: `vence ${fmtShort(due)}`, tone: '' };
    case 'noDate': return { text: 'neste período', tone: '' };
  }
}

/** Toque no círculo de uma meta: informar quanto foi transferido, ou desfazer. */
export async function goalTap(row: GoalRow, m: FinanceModel): Promise<void> {
  if (row.isDone) {
    if (await confirmDialog('Desfazer a transferência?', `${row.goal.name}: ${money(row.transferred, m.currency)} deixam de contar neste período.`, 'Desfazer', true)) {
      undoGoalTransfer(row, m.period);
    }
  } else {
    contributionSheet(row.goal, m.today, { suggested: row.toMove, note: GOAL_NOTE });
  }
}

// ── Painel ───────────────────────────────────────────────────────────────────

export function dashboard(ctx: Ctx): View {
  const s = store.state;
  const m = makeFinanceModel(s, ctx.today);
  const cur = m.currency;
  const el = h('div', { class: 'page' });
  const $ = (c: number) => money(c, cur);

  if (m.income > 0) el.append(balanceHero(m, ctx));
  else el.append(salaryPrompt(m, ctx));

  if (syncConfigured) {
    if (!sync.signedIn && hasData(s)) put(el, backupBanner(true));
  } else if (backupIsStale(s.settings.lastBackupAt, hasData(s), Date.now())) put(el, backupBanner(false));
  put(el, checklist(m));

  if (m.income > 0) {
    el.append(paceCard(m, ctx));
    el.append(splitCard(m));
    const catLines = (account: BankAccount) => m.summary.lines.filter((l) =>
      (s.settings.spendingAccount.includes(l.category) ? 'spending' : 'saves') === account && (l.target > 0 || effective(l) > 0));

    // Conta de gastos
    const spendRows = catLines('spending');
    const spent = spendRows.reduce((a, l) => a + l.spent, 0);
    const spendTotal = m.split.spendingTotal;
    el.append(section(accountTitle('spending', $(spendTotal)), [
      m.carry !== 0 ? carryRow(m, ctx) : null,
      ...spendRows.map((l) => categoryRow(l, m, ctx)),
    ], spendRows.length ? (spent > spendTotal ? `Gasto ${$(spent)} · passou ${$(spent - spendTotal)}` : `Gasto ${$(spent)} · resta ${$(spendTotal - spent)}`) : undefined));

    // Saves
    const reserve = m.split.saves.find((x) => x.kind.type === 'reserve')?.amount ?? 0;
    el.append(section(accountTitle('saves', $(m.split.savesTotal)), [
      ...catLines('saves').map((l) => categoryRow(l, m, ctx)),
      reserve > 0 ? plainRow('🍃', catColor('poupanca'), 'Reserva', 'o que sobra depois das metas', $(reserve)) : null,
    ], m.split.savesKept > 0 ? `Separe ao receber. Disso, ${$(m.split.savesKept)} ficam de reserva.` : 'Separe ao receber para pagar as contas.'));

    // Metas: cada uma com a sua conta
    if (m.goals.length) {
      el.append(section(accountTitle('goal', $(m.split.goalsTotal)), [
        ...m.goals.map((r, i) => goalSplitRow(r, i, m)),
        !m.savingsCheck.isEnough ? savingsWarning(m) : null,
      ], 'Cada meta tem a sua conta. Transfira direto para ela, sem passar por saves.'));
    }
    el.append(walletSection(m, ctx));
    if (m.adaptation) el.append(adaptationCard(m));
  }

  const tile = (symbol: string, title: string, href: string, detail?: string) => h('a', { class: 'nav-tile', href },
    h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, symbol), h('span', { class: 'strong' }, title), detail ? h('span', { class: 'caption' }, detail) : null);
  el.append(h('section', { class: 'group' }, h('h2', { class: 'group-title' }, 'Explorar'), h('div', { class: 'nav-grid' },
    tile('🧾', 'Transações', hrefTo(FINANCE, 'transactions'), 'tudo que entrou e saiu'),
    tile('📌', 'Gastos fixos', hrefTo(FINANCE, 'fixed'), `${store.state.fixed.length} cadastrados`),
    tile('🎯', 'Metas', hrefTo(FINANCE, 'goals'), m.goals.length ? `${m.goals.length} em andamento` : 'crie a primeira'),
    tile('🕘', 'Histórico', hrefTo(FINANCE, 'history'), 'compare períodos'),
    tile('⚙️', 'Configurações', hrefTo(FINANCE, 'setup')),
    syncConfigured ? tile('☁️', 'Conta e nuvem', hrefTo(FINANCE, 'account'), sync.signedIn ? 'conectada' : 'entrar') : null,
    tile('💾', 'Backup', hrefTo(FINANCE, 'backup'), 'protegido por senha'))));
  if (m.income > 0) {
    el.append(h('div', { class: 'center' }, button('Salvar no histórico', () => { saveSnapshot(m); toast('Salvo no histórico'); })));
  }
  return {
    title: 'Finanças', el,
    actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Nova transação', onclick: () => transactionSheet(ctx.today) }, '＋')],
  };
}

const accountTitle = (account: BankAccount, total: string) =>
  h('span', { class: `account-title ${account}` }, h('span', null, `${accountIcon[account]} ${ACCOUNT_TITLE[account]}`), h('span', { class: 'num muted' }, total));

function plainRow(symbol: string, color: string, title: string, caption: string, amount: string): HTMLElement {
  return h('div', { class: 'row two' }, iconBadge(symbol, color),
    h('div', { class: 'grow' }, h('div', { class: 'row-title' }, title), h('div', { class: 'caption' }, caption)),
    h('span', { class: 'num strong' }, amount));
}

function salaryPrompt(m: FinanceModel, ctx: Ctx): HTMLElement {
  return h('section', { class: 'group' }, h('div', { class: 'card prompt' },
    iconBadge('💶', 'var(--cat-poupanca)'),
    h('h3', null, 'Recebeu o salário?'),
    h('p', { class: 'muted' }, 'Lance o valor que caiu na conta e o app mostra quanto deixar para gastos e quanto separar para saves.'),
    button('Adicionar salário', () => transactionSheet(ctx.today, undefined, 'income'), 'primary'),
    h('p', { class: 'caption' }, `Período ${fmtPeriod(m.period)}`)));
}

/** Valor atual da conta de gastos, com o ritmo diário que ainda cabe no período. */
function balanceHero(m: FinanceModel, ctx: Ctx): HTMLElement {
  const $ = (c: number) => money(c, m.currency);
  const total = m.split.spendingTotal;
  const left = m.spendingLeft;
  const used = total > 0 ? m.spendingSpent / total : m.spendingSpent > 0 ? 1 : 0;
  const perDay = left > 0 ? Math.floor(left / m.daysLeft) : 0;
  const today = store.state.transactions.filter((t) => t.kind === 'expense' && t.day === m.today && store.state.settings.spendingAccount.includes(t.category))
    .reduce((a, t) => a + t.amount, 0);
  const tone = left < 0 ? 'bad' : used > 0.85 ? 'warn' : 'good';
  const stat = (title: string, value: string, caption: string) => h('div', { class: 'tile' },
    h('span', { class: 'tile-title' }, title), h('strong', { class: 'num' }, value), h('span', { class: 'caption' }, caption));
  return h('section', { class: 'group' }, h('div', { class: 'card hero balance' },
    h('div', { class: 'hero-head' },
      h('span', { class: 'chip' }, m.daysUntilPayday === 0 ? 'Salário hoje' : `Salário em ${plural(m.daysUntilPayday, 'dia', 'dias')}`),
      h('span', { class: 'muted' }, fmtPeriod(m.period))),
    h('div', { class: 'balance-main' },
      h('span', { class: 'caption' }, '💳 Conta de gastos agora'),
      h('strong', { class: `balance-value num ${tone}` }, $(left)),
      h('span', { class: 'caption num' }, left < 0 ? `passou ${$(-left)} do que cabia (${$(total)})` : `de ${$(total)} · gasto ${$(m.spendingSpent)}`)),
    bar(used, left < 0 ? 'var(--bad)' : 'var(--cat-lazer)', left < 0),
    h('div', { class: 'tiles' },
      stat('Por dia', left > 0 ? $(perDay) : '—', left > 0 ? `${plural(m.daysLeft, 'dia', 'dias')} restantes` : 'sem folga'),
      stat('Hoje', $(today), today > 0 ? 'gasto hoje' : 'nada gasto'),
      stat('Usado', `${Math.round(Math.min(used, 9.99) * 100)}%`, 'do período')),
    h('div', { class: 'quick' },
      button('− Gasto', () => transactionSheet(ctx.today), 'primary'),
      button('+ Entrada', () => transactionSheet(ctx.today, undefined, 'income')))));
}

/** Gasto acumulado do período contra o ritmo uniforme do orçamento da conta de gastos. */
function paceCard(m: FinanceModel, ctx: Ctx): HTMLElement {
  const s = store.state;
  const spending = new Set(s.settings.spendingAccount);
  const expenses = s.transactions.filter((t) => t.kind === 'expense' && spending.has(t.category)).map((t) => ({ day: t.day, amount: t.amount }));
  const budget = m.split.spendingTotal;
  const pts = paceSeries(m.period, ctx.today, budget, expenses);
  const idx = Math.max(0, Math.min(pts.length - 1, ctx.today - m.period.start));
  const ahead = (pts[idx]?.spent ?? 0) - (pts[idx]?.ideal ?? 0);
  const note = budget <= 0 ? 'Sem orçamento na conta de gastos.'
    : ahead > 0 ? `Você está ${money(ahead, m.currency)} acima do ritmo.` : `Você está ${money(-ahead, m.currency)} abaixo do ritmo.`;
  return section('📈 Ritmo de gastos', [h('div', { class: 'chart-card' }, areaChart({
    points: pts.map((p) => ({ label: fmtShort(p.day), value: p.spent, ref: p.ideal })),
    cap: budget, capLabel: 'Orçamento', valueLabel: 'Gasto', refLabel: 'Ritmo ideal', fmt: (c) => money(c, m.currency),
    initial: idx, overIsBad: true, ariaLabel: 'Gasto acumulado no período',
  }))], `${note} Toque ou arraste no gráfico para ver cada dia.`);
}

/** Rosca do salário: toque numa fatia para ver o valor e a porcentagem. */
function splitCard(m: FinanceModel): HTMLElement {
  const { split } = m;
  const total = split.all.reduce((a, x) => a + x.amount, 0);
  const idle = () => [
    h('span', { class: 'caption' }, 'Separar'), h('strong', { class: 'num' }, money(split.movedOut, m.currency)),
    h('span', { class: 'caption' }, `de ${money(m.income, m.currency)}`)];
  const center = h('div', { class: 'donut-text' }, idle());
  const tile = (account: BankAccount, amount: number, caption: string) => h('div', { class: `tile ${account}` },
    h('span', { class: 'tile-title' }, `${accountIcon[account]} ${ACCOUNT_TITLE[account]}`), h('strong', { class: 'num' }, money(amount, m.currency)), h('span', { class: 'caption' }, caption));
  const chart = donut(split.all, center, (i) => {
    const x = i === null ? undefined : split.all[i];
    center.replaceChildren(...(x
      ? [h('span', { class: 'caption' }, x.title), h('strong', { class: 'num' }, money(x.amount, m.currency)), h('span', { class: 'caption' }, `${Math.round((x.amount / Math.max(1, total)) * 100)}% do salário`)]
      : idle()));
  });
  return section('🥧 Divisão do salário', [h('div', { class: 'hero' }, chart,
    h('div', { class: 'tiles' },
      tile('spending', split.spendingTotal, 'dia a dia'), tile('saves', split.savesTotal, 'contas e reserva'),
      split.goalsTotal > 0 ? tile('goal', split.goalsTotal, split.goals.length === 1 ? 'conta da meta' : `${split.goals.length} contas`) : null),
    h('ul', { class: 'legend' }, split.all.map((x) => h('li', null, h('i', { style: { background: sliceColor(x) } }), h('span', null, x.title), h('span', { class: 'num muted' }, money(x.amount, m.currency))))))],
  'Toque numa fatia da rosca para ver o detalhe.');
}

function checklist(m: FinanceModel): HTMLElement | null {
  const showTransfer = m.split.savesTotal > 0;
  const goals = m.goals.map((r, i) => ({ r, i })).filter((x) => x.r.allocation > 0);
  const total = (showTransfer ? 1 : 0) + m.bills.length + goals.length;
  if (total === 0) return null;
  const done = (showTransfer && m.transferCheck ? 1 : 0) + m.bills.filter((b) => b.check).length + goals.filter((x) => x.r.isDone).length;
  const $ = (c: number) => money(c, m.currency);

  const item = (isDone: boolean, color: string, title: string, subtitle: string, tone: string, amount: string, onTap: () => void) =>
    h('button', { type: 'button', class: `row check-row${isDone ? ' is-done' : ''}`, 'aria-pressed': isDone, onclick: onTap },
      checkCircle(isDone, color),
      h('span', { class: 'grow' }, h('span', { class: 'row-title block' }, title), h('span', { class: `caption block ${tone}` }, subtitle)),
      h('span', { class: 'num strong' }, amount));

  const rows: Node[] = [];
  if (showTransfer) {
    rows.push(item(!!m.transferCheck, 'var(--cat-poupanca)', 'Separar para saves', m.transferCheck ? 'feito' : 'mover ao receber o salário', '', $(m.split.savesTotal), () => toggleTransfer(m)));
  }
  for (const b of m.bills) {
    const sub = billSubtitle(b.state, b.due);
    rows.push(item(!!b.check, catColor(b.fixed.category), b.title, sub.text, sub.tone, $(b.fixed.monthly), () => toggleBill(b)));
  }
  for (const { r, i } of goals) {
    const sub = r.isDone ? (r.transferred === r.allocation ? 'transferido' : `transferido · plano ${$(r.allocation)}`)
      : r.transferred > 0 ? 'falta transferir para a conta da meta' : 'transferir para a conta da meta';
    rows.push(item(r.isDone, goalColor(i), `Meta ${r.goal.name}`, sub, '', $(r.isDone ? r.transferred : r.toMove), () => void goalTap(r, m)));
  }
  const header = h('span', { class: `account-title${done === total ? ' all-done' : ''}` }, h('span', null, '✅ Checklist'), h('span', { class: 'num' }, `${done} de ${total}`));
  return section(header, rows);
}

function carryRow(m: FinanceModel, ctx: Ctx): HTMLElement {
  const weekly = store.state.settings.frequency === 'weekly';
  const positive = m.carry > 0;
  const title = positive ? (weekly ? 'Sobra da semana passada' : 'Sobra do mês passado') : (weekly ? 'Gasto a mais na semana passada' : 'Gasto a mais no mês passado');
  const caption = positive ? `somada a ${CATEGORY_TITLE[m.carryCategory ?? 'lazer']}` : 'descontada dos gastos do dia a dia';
  const row = plainRow(positive ? '↪️' : '↩️', positive ? 'var(--cat-poupanca)' : 'var(--bad)', title, caption, `${positive ? '+' : '−'} ${money(Math.abs(m.carry), m.currency)}`);
  row.append(h('button', {
    type: 'button', class: 'mini', onclick: async () => {
      if (await confirmDialog('Zerar a sobra?', 'O plano deste período volta ao valor normal. Use quando o saldo da conta de gastos no banco não bater com o app.', 'Zerar e recomeçar daqui')) {
        resetCarry(currentPeriod(store.state, ctx.today));
      }
    },
  }, 'Zerar'));
  return row;
}

function categoryRow(line: BudgetLine, m: FinanceModel, _ctx: Ctx): HTMLElement {
  const adjusted = m.adaptation?.lines.find((a) => a.category === line.category)?.adjusted;
  const $ = (c: number) => money(c, m.currency);
  const over = isOver(line);
  return h('div', { class: 'row two' }, iconBadge(CATEGORY_ICON[line.category], catColor(line.category)),
    h('div', { class: 'grow' },
      h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, CATEGORY_TITLE[line.category]), h('span', { class: 'num strong' }, $(line.target))),
      bar(progress(line), catColor(line.category), over),
      h('div', { class: 'row-foot caption num' },
        h('span', null, line.fixed > line.spent ? `fixos ${$(line.fixed)}` : `gasto ${$(line.spent)}`),
        h('span', { class: over ? 'bad' : '' }, over ? `passou ${$(-remaining(line))}` : `resta ${$(remaining(line))}`)),
      fixedOver(line) ? h('div', { class: 'caption bad' }, 'Os fixos passam do plano') : null,
      adjusted !== undefined && adjusted !== line.target ? h('div', { class: 'caption warn' }, `Ajustado para ${$(adjusted)}`) : null));
}

function goalSplitRow(r: GoalRow, i: number, m: FinanceModel): HTMLElement {
  const $ = (c: number) => money(c, m.currency);
  return h('a', { class: 'row two', href: hrefTo(FINANCE, 'goal', r.goal.id) }, iconBadge('🎯', goalColor(i)),
    h('div', { class: 'grow' },
      h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, r.goal.name), h('span', { class: 'num strong' }, $(r.effectiveAllocation))),
      bar(r.status.progress, goalColor(i)),
      h('div', { class: 'row-foot caption num' }, h('span', null, `${$(r.status.saved)} de ${$(r.status.target)}`),
        h('span', null, r.status.isComplete ? 'concluída' : `até ${fmtShort(r.goal.deadline)}`))));
}

function savingsWarning(m: FinanceModel): HTMLElement {
  const c = m.savingsCheck;
  return h('div', { class: 'row warning' },
    h('p', { class: 'bad' }, `⚠️ Faltam ${money(c.shortfall, m.currency)} por período para as metas.`),
    c.suggestion
      ? button(`Trocar para ${c.suggestion.title}`, async () => {
        const next = c.suggestion;
        if (next && await confirmDialog(`Trocar o plano para ${next.title}?`, '', 'Trocar plano')) store.update((s) => { s.settings.preset = next.id; });
      })
      : h('p', { class: 'caption' }, 'Nenhum plano cobre sozinho. Estenda o prazo ou reduza a meta.'));
}

function walletSection(m: FinanceModel, ctx: Ctx): HTMLElement {
  const w = m.wallet;
  const s = store.state.settings;
  const input = moneyInput(s.savesBalance, (c) => setSavesBalance(c, ctx.today));
  const rows: Child[] = [
    h('label', { class: 'row two' }, iconBadge('🏦', 'var(--cat-poupanca)'),
      h('div', { class: 'grow' }, h('div', { class: 'row-title' }, 'Já tenho em saves'),
        h('div', { class: 'caption' }, s.savesBalanceUpdatedAt !== null ? `atualizado ${fmtShort(s.savesBalanceUpdatedAt)}` : 'toque para informar')), input),
    valueRow('Entra deste salário', `+ ${money(w.incoming, m.currency)}`, 'good'),
    w.bills > 0 ? valueRow('Sai para contas', `− ${money(w.bills, m.currency)}`) : null,
    h('div', { class: 'row value-row strong-row' }, h('span', { class: 'row-title' }, `Fica depois do ${store.state.settings.frequency === 'weekly' ? 'semana' : 'mês'}`), h('span', { class: 'num' }, money(w.afterPeriod, m.currency))),
  ];
  return section('🏦 Carteira saves', rows);
}

function adaptationCard(m: FinanceModel): HTMLElement {
  const a = m.adaptation;
  if (!a) return h('div');
  const status = !a.isNeeded ? 'Tudo dentro do plano' : a.isFeasible ? `Ajustado para compensar ${money(a.need, m.currency)}`
    : m.shortfallAccepted ? `Atraso aceito: faltam ${money(a.shortfall, m.currency)}` : `Faltam ${money(a.shortfall, m.currency)} para a meta`;
  return section('Adaptação automática', [h('a', { class: 'row link-row', href: hrefTo(FINANCE, 'adaptation') },
    h('span', { class: 'grow' }, h('span', { class: 'row-title block' }, `Pode gastar ${money(a.dailyAllowance, m.currency)} por dia`),
      h('span', { class: `caption block ${a.isFeasible || m.shortfallAccepted ? '' : 'bad'}` }, status)), h('span', { class: 'chev' }, '›'))]);
}

// ── Transações ───────────────────────────────────────────────────────────────

let txPeriodStart: number | null = null;
let txFilter: Category | '' = '';

export function transactionsView(ctx: Ctx): View {
  const s = store.state;
  const schedule = scheduleOf(s);
  let period: PayPeriod = currentPeriod(s, ctx.today);
  if (txPeriodStart !== null) {
    let p = period;
    for (let i = 0; i < 600 && !periodContains(p, txPeriodStart); i++) p = txPeriodStart < p.start ? previousPeriod(p, schedule) : nextPeriod(p, schedule);
    period = p;
  }
  const cur = s.settings.currency;
  const items = s.transactions.filter((t) => periodContains(period, t.day) && (!txFilter || (t.kind === 'expense' && t.category === txFilter)))
    .sort((a, b) => b.day - a.day);
  const go = (p: PayPeriod) => { txPeriodStart = p.start; window.dispatchEvent(new Event('vida:rerender')); };
  const nav = h('div', { class: 'period-nav' },
    h('button', { type: 'button', 'aria-label': 'Período anterior', onclick: () => go(previousPeriod(period, schedule)) }, '‹'),
    h('strong', null, fmtPeriod(period)),
    h('button', { type: 'button', 'aria-label': 'Próximo período', onclick: () => go(nextPeriod(period, schedule)) }, '›'));
  const periodExpenses = s.transactions.filter((t) => periodContains(period, t.day) && t.kind === 'expense');
  const chip = (value: Category | '', label: string, amount: number) => h('button', {
    type: 'button', class: `chip-btn${txFilter === value ? ' on' : ''}`, 'aria-pressed': txFilter === value,
    onclick: () => { txFilter = txFilter === value ? '' : value; window.dispatchEvent(new Event('vida:rerender')); },
  }, h('span', null, label), amount > 0 ? h('span', { class: 'num caption' }, money(amount, cur)) : null);
  const filter = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por categoria' },
    chip('', 'Todas', periodExpenses.reduce((a, t) => a + t.amount, 0)),
    SPENDING.map((c) => chip(c, `${CATEGORY_ICON[c]} ${TRANSACTION_TITLE[c]}`, periodExpenses.filter((t) => t.category === c).reduce((a, t) => a + t.amount, 0))));

  const el = h('div', { class: 'page' }, nav, filter);
  if (items.length === 0) el.append(emptyState('🧾', 'Sem transações', 'Toque em ＋ para lançar.'));
  else {
    const income = items.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0);
    const spent = items.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0);
    el.append(section(null, [valueRow('Entradas', money(income, cur), 'good'), valueRow('Gastos', money(spent, cur))]));
    const days = [...new Set(items.map((t) => t.day))];
    for (const day of days) {
      el.append(section(fmtLong(day), items.filter((t) => t.day === day).map((t) =>
        h('button', { type: 'button', class: 'row two', onclick: () => transactionSheet(ctx.today, t) },
          iconBadge(t.kind === 'income' ? '⬇️' : CATEGORY_ICON[t.category], t.kind === 'income' ? 'var(--good)' : catColor(t.category)),
          h('span', { class: 'grow left' }, h('span', { class: 'row-title block' }, t.kind === 'income' ? (t.source === 'salary' ? 'Salário' : 'Outra entrada') : TRANSACTION_TITLE[t.category]),
            t.note ? h('span', { class: 'caption block' }, t.note) : null),
          h('span', { class: `num strong ${t.kind === 'income' ? 'good' : ''}` }, `${t.kind === 'income' ? '+' : '−'}${money(t.amount, cur)}`)))));
    }
  }
  return { title: 'Transações', el, back: true, actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Nova transação', onclick: () => transactionSheet(ctx.today) }, '＋')] };
}

// ── Gastos fixos ─────────────────────────────────────────────────────────────

const SUGGESTIONS: { name: string; category: Category }[] = [
  { name: 'Aluguel', category: 'casa' }, { name: 'Internet', category: 'fixos' }, { name: 'Telemóvel', category: 'fixos' },
  { name: 'Seguro', category: 'fixos' }, { name: 'Passe', category: 'transporte' },
];

export function fixedView(ctx: Ctx): View {
  const s = store.state;
  const cur = s.settings.currency;
  const el = h('div', { class: 'page' });
  for (const c of SPENDING) {
    const group = s.fixed.filter((f) => f.category === c);
    if (!group.length) continue;
    el.append(section(CATEGORY_TITLE[c], group.map((f) => h('button', { type: 'button', class: 'row two', onclick: () => fixedSheet(undefined, f) },
      h('span', { class: 'grow left' }, h('span', { class: 'row-title block' }, f.name || CATEGORY_TITLE[c]),
        f.dueDay > 0 ? h('span', { class: 'caption block' }, `${f.remindOn ? '🔔' : '📅'} vence dia ${f.dueDay}`) : null),
      h('span', { class: 'num' }, `${money(f.monthly, cur)}/mês`),
      f.dueDay > 0 && f.remindOn ? h('span', {
        class: 'mini', role: 'button', tabindex: 0, onclick: (e: Event) => { e.stopPropagation(); exportBillToCalendar(f, ctx.today, money(f.monthly, cur)); },
      }, 'Calendário') : null))));
  }
  const missing = SUGGESTIONS.filter((x) => !s.fixed.some((f) => f.name === x.name));
  if (missing.length) {
    el.append(section('Sugestões', missing.map((x) => h('button', { type: 'button', class: 'row', onclick: () => fixedSheet(x) },
      h('span', { class: 'row-icon' }, '＋'), h('span', { class: 'row-title' }, `${x.name} (${CATEGORY_TITLE[x.category]})`)))));
  }
  el.append(section(null, [valueRow('Total mensal', money(s.fixed.reduce((a, f) => a + f.monthly, 0), cur))],
    'Cadastre só os valores mensais. Em renda semanal, o app converte por ×12/52. Para receber aviso no dia do vencimento, use o botão Calendário: ele cria um evento mensal com alerta no app Calendário do iPhone.'));
  return { title: 'Gastos fixos', el, back: true, actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Novo gasto fixo', onclick: () => fixedSheet() }, '＋')] };
}

// ── Metas ────────────────────────────────────────────────────────────────────

let reorder = false;

export function goalsView(ctx: Ctx): View {
  const s = store.state;
  const m = makeFinanceModel(s, ctx.today);
  const toMove = m.goals.reduce((a, r) => a + r.toMove, 0);
  const $ = (c: number) => money(c, m.currency);
  const noun = s.settings.frequency === 'weekly' ? 'semana' : 'mês';
  const el = h('div', { class: 'page' });

  el.append(h('section', { class: 'group' }, h('div', { class: 'card summary' },
    h('span', { class: 'caption' }, `Neste ${noun}`),
    m.income === 0 ? h('h3', null, 'Lance o salário para ver quanto transferir')
      : toMove > 0 ? h('h3', null, `Transfira ${$(toMove)} para as metas`) : h('h3', { class: 'good' }, '✓ Tudo transferido'),
    h('p', { class: 'caption' }, 'Cada meta tem a sua conta: transfira direto para ela. Toque no círculo quando transferir.'),
    m.income > 0 && !m.savingsCheck.isEnough ? savingsWarning(m) : null)));

  if (m.goals.length === 0) el.append(emptyState('🎯', 'Sem metas', 'Toque em ＋ para criar a primeira.'));
  else {
    const ids = m.goals.map((r) => r.goal.id);
    el.append(section('Suas metas', m.goals.map((r, i) => {
      const st = r.status;
      const headline = st.isComplete ? 'concluída' : r.isDone ? `transferido ${$(r.transferred)}` : r.toMove > 0 ? `transfira ${$(r.toMove)}` : 'nada agora';
      return h('div', { class: 'row two' },
        reorder ? null : h('button', { type: 'button', class: 'check-btn', disabled: r.allocation === 0, 'aria-label': r.isDone ? 'Desfazer' : 'Marcar como transferido', onclick: () => void goalTap(r, m) }, checkCircle(r.isDone, goalColor(i))),
        h('a', { class: 'grow', href: hrefTo(FINANCE, 'goal', r.goal.id) },
          h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, r.goal.name), h('span', { class: `num strong ${r.toMove > 0 ? '' : 'muted'}` }, headline)),
          bar(st.progress, goalColor(i)),
          h('div', { class: `caption num ${st.isOverdue && !st.isComplete ? 'bad' : ''}` }, st.isComplete ? `Meta concluída · ${$(st.saved)}` : `${$(st.saved)} de ${$(st.target)} · até ${fmtFull(r.goal.deadline)}`)),
        reorder ? h('span', { class: 'reorder' },
          h('button', { type: 'button', 'aria-label': 'Subir', disabled: i === 0, onclick: () => move(ids, i, -1) }, '▲'),
          h('button', { type: 'button', 'aria-label': 'Descer', disabled: i === ids.length - 1, onclick: () => move(ids, i, 1) }, '▼')) : null);
    }), m.goals.length > 1 ? 'A de cima recebe primeiro. Toque em Ordenar para mudar.' : undefined));
  }
  return {
    title: 'Metas', el, back: true,
    actions: [
      m.goals.length > 1 ? h('button', { type: 'button', class: 'text-btn', onclick: () => { reorder = !reorder; window.dispatchEvent(new Event('vida:rerender')); } }, reorder ? 'Pronto' : 'Ordenar') : null,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Nova meta', onclick: () => goalSheet(ctx.today) }, '＋'),
    ].filter((x): x is HTMLButtonElement => x !== null),
  };
}

function move(ids: string[], i: number, by: number): void {
  const next = [...ids];
  const [item] = next.splice(i, 1);
  if (item === undefined) return;
  next.splice(i + by, 0, item);
  store.update((s) => next.forEach((id, p) => { const g = s.goals.find((x) => x.id === id); if (g) g.priority = p; }));
}

export function goalDetailView(ctx: Ctx): View {
  const s = store.state;
  const goal = s.goals.find((g) => g.id === ctx.path[1]);
  if (!goal) return { title: 'Meta', el: h('div', { class: 'page' }, emptyState('🎯', 'Meta não encontrada', 'Ela pode ter sido apagada.')), back: true };
  const cur = s.settings.currency;
  const saved = s.contributions.filter((c) => c.goalId === goal.id).reduce((a, c) => a + c.amount, 0);
  const items = s.contributions.filter((c) => c.goalId === goal.id).sort((a, b) => b.day - a.day);
  const curve = cumulative(items);
  const el = h('div', { class: 'page' },
    section(null, [valueRow('Guardado', money(saved, cur), 'good'), valueRow('Alvo', money(goal.target, cur)), valueRow('Prazo', fmtFull(goal.deadline))]),
    curve.length > 1 ? section('📈 Evolução', [h('div', { class: 'chart-card' }, areaChart({
      points: curve.map((c) => ({ label: fmtShort(c.day), value: c.total })),
      cap: goal.target, capLabel: 'Alvo', valueLabel: 'Guardado', fmt: (c) => money(c, cur), initial: curve.length - 1, ariaLabel: 'Evolução do valor guardado',
    }))], `${Math.round(Math.min(1, saved / Math.max(1, goal.target)) * 100)}% do alvo.`) : null,
    section('Aportes', items.length ? items.map((c) => h('div', { class: 'row two' },
      h('button', { type: 'button', class: 'grow left', onclick: () => contributionSheet(goal, ctx.today, { existingId: c.id }) },
        h('span', { class: 'row-title block' }, fmtFull(c.day)), c.note ? h('span', { class: 'caption block' }, c.note) : null),
      h('span', { class: 'num' }, money(c.amount, cur)),
      h('button', { type: 'button', class: 'mini', 'aria-label': 'Apagar aporte', onclick: async () => {
        if (await confirmDialog('Apagar este aporte?', '', 'Apagar', true)) store.update((st) => { st.contributions = st.contributions.filter((x) => x.id !== c.id); });
      } }, '✕')))
      : [h('div', { class: 'row muted' }, 'Nenhum aporte ainda')]),
    h('div', { class: 'stack center' }, button('Novo aporte', () => contributionSheet(goal, ctx.today), 'primary'),
      button('Apagar meta', async () => {
        if (await confirmDialog('Apagar esta meta?', 'Os aportes dela também serão apagados.', 'Apagar', true)) { deleteGoal(goal.id); history.back(); }
      }, 'danger')));
  return { title: goal.name, el, back: true, actions: [h('button', { type: 'button', class: 'text-btn', onclick: () => goalSheet(ctx.today, goal) }, 'Editar')] };
}

// ── Histórico ────────────────────────────────────────────────────────────────

export function historyView(): View {
  const s = store.state;
  const el = h('div', { class: 'page' });
  if (!s.snapshots.length) el.append(emptyState('🕘', 'Histórico vazio', 'Use "Salvar no histórico" em Finanças.'));
  else {
    const recent = [...s.snapshots].sort((a, b) => a.periodStart - b.periodStart).slice(-8);
    const cur = recent[recent.length - 1]?.currency ?? s.settings.currency;
    el.append(section('📊 Entrada × gasto', [h('div', { class: 'chart-card' }, barChart({
      groups: recent.map((x) => ({ id: x.id, label: fmtShort(x.periodStart), a: x.income, b: x.totalSpent })),
      aLabel: 'Renda', bLabel: 'Gasto', fmt: (c) => money(c, cur), ariaLabel: 'Renda e gasto por período',
      onOpen: (id) => { location.hash = hrefTo(FINANCE, 'history', id); },
    }))], recent.length > 1 ? 'Toque numa barra para ler os valores e abrir o período.' : 'Salve mais períodos para comparar.'));
    el.append(section('Períodos salvos', s.snapshots.map((x) => h('a', { class: 'row link-row', href: hrefTo(FINANCE, 'history', x.id) },
      h('span', { class: 'grow' }, h('span', { class: 'row-title block' }, fmtPeriod({ start: x.periodStart, end: x.periodEnd })),
        h('span', { class: 'caption block' }, `${presetById(x.preset).title} · guardar ${money(x.savingsPlanned, x.currency)}`),
        h('span', { class: 'caption block faint' }, `Salvo em ${fmtStamp(x.savedAt)}`)), h('span', { class: 'chev' }, '›')))));
  }
  return { title: 'Histórico', el, back: true };
}

export function historyDetailView(ctx: Ctx): View {
  const x = store.state.snapshots.find((n) => n.id === ctx.path[1]);
  if (!x) return { title: 'Detalhe', el: h('div', { class: 'page' }, emptyState('🕘', 'Não encontrado', 'Esse registro foi apagado.')), back: true };
  const $ = (c: number) => money(c, x.currency);
  const el = h('div', { class: 'page' },
    section('Período', [
      valueRow('Datas', fmtPeriod({ start: x.periodStart, end: x.periodEnd })), valueRow('Renda', $(x.income)), valueRow('Plano', presetById(x.preset).title),
      valueRow('Poupança planejada', $(x.savingsPlanned), 'good'), valueRow('Fixos', $(x.totalFixed)), valueRow('Livre', $(x.free)),
      valueRow('Gasto real', $(x.totalSpent)), valueRow('Entradas lançadas', $(x.incomeLogged))]),
    section('Linhas', x.lines.map((l) => h('div', { class: 'row two' },
      h('div', { class: 'grow' }, h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, CATEGORY_TITLE[l.category]),
        h('span', { class: `num ${Math.max(l.spent, l.fixed) > l.target ? 'bad' : 'muted'}` }, `${$(l.spent)} / ${$(l.target)}`)),
        h('div', { class: 'row-foot caption' }, h('span', null, l.fixed > 0 ? `Fixos ${$(l.fixed)}` : ''), h('span', { class: 'warn' }, l.adjusted !== null && l.adjusted !== l.target ? `Ajustado ${$(l.adjusted)}` : ''))))))
  );
  if (x.goals.length) {
    el.append(section('Metas', x.goals.map((g) => h('div', { class: 'row two' }, h('div', { class: 'grow' },
      h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, g.name), h('span', { class: 'num' }, `${$(g.saved)} / ${$(g.target)}`)),
      h('div', { class: 'caption' }, `Exigido no período ${$(g.requiredThisPeriod)} · aportado ${$(g.contributedThisPeriod)}`))))));
  }
  el.append(h('div', { class: 'center' }, button('Apagar do histórico', async () => {
    if (await confirmDialog('Apagar este registro?', '', 'Apagar', true)) { store.update((s) => { s.snapshots = s.snapshots.filter((n) => n.id !== x.id); }); history.back(); }
  }, 'danger')));
  return { title: 'Detalhe', el, back: true };
}

// ── Adaptação ────────────────────────────────────────────────────────────────

export function adaptationView(ctx: Ctx): View {
  const s = store.state;
  const m = makeFinanceModel(s, ctx.today);
  const a = m.adaptation;
  if (!a) return { title: 'Orçamento ajustado', el: h('div', { class: 'page' }, emptyState('🎚️', 'Adaptação desligada', 'Ligue em Configurações › Adaptar plano para bater a meta.')), back: true };
  const $ = (c: number) => money(c, m.currency);
  const cmp = (title: string, original: number, adjusted: number) => h('div', { class: 'row cmp' },
    h('span', { class: 'grow' }, title), h('span', { class: 'num muted' }, $(original)),
    h('span', { class: `num ${adjusted < original ? 'warn' : adjusted > original ? 'bad' : ''}` }, $(adjusted)));
  const el = h('div', { class: 'page' },
    section(null, [valueRow('Pode gastar por dia', $(a.dailyAllowance), 'accent'), valueRow('Dias até o pagamento', String(m.daysLeft)), a.isNeeded ? valueRow('A compensar', $(a.need)) : null],
      a.isNeeded ? 'Restante das categorias flexíveis dividido pelos dias que faltam.' : 'Nenhuma categoria passou do alvo. Nada foi ajustado.'),
    section('Original × ajustado', [h('div', { class: 'row cmp head caption' }, h('span', { class: 'grow' }, 'Categoria'), h('span', null, 'Original'), h('span', null, 'Ajustado')),
      ...a.lines.map((l) => cmp(CATEGORY_TITLE[l.category], l.original, l.adjusted)), cmp('Poupança', a.originalSavings, a.adjustedSavings)],
    `Piso protegido das metas: ${$(a.savingsFloor)}. Casa e Gastos fixos não são cortados.`));
  if (!a.isFeasible) {
    const rows: Node[] = [h('p', { class: 'row bad' }, `⚠️ Mesmo cortando tudo que é flexível, faltam ${$(a.shortfall)} para cumprir a meta neste período.`)];
    if (m.shortfallAccepted) rows.push(h('p', { class: 'row muted' }, '✓ Atraso aceito neste período'));
    else {
      const next = moreAggressive(presetById(s.settings.preset));
      if (next) rows.push(h('div', { class: 'row' }, button(`Trocar para ${next.title}`, async () => {
        if (await confirmDialog(`Trocar o plano para ${next.title}?`, '', 'Confirmar')) store.update((st) => { st.settings.preset = next.id; });
      })));
      for (const r of [...m.goals].reverse()) {
        const st = r.status;
        const date = extendedDeadline(Math.max(0, st.target - (st.saved - st.contributedThisPeriod)), st.requiredThisPeriod, a.shortfall, m.period, m.schedule);
        if (date !== null) {
          rows.push(h('div', { class: 'row' }, button(`Estender ${r.goal.name} até ${fmtFull(date)}`, async () => {
            if (await confirmDialog(`Estender o prazo de ${r.goal.name} para ${fmtFull(date)}?`, '', 'Confirmar')) store.update((state) => { const g = state.goals.find((x) => x.id === r.goal.id); if (g) g.deadline = date; });
          })));
          break;
        }
      }
      rows.push(h('div', { class: 'row' }, button('Aceitar o atraso', async () => {
        if (await confirmDialog('Aceitar que a meta atrase neste período?', '', 'Aceitar')) store.update((st) => { st.settings.acceptedShortfallPeriodStart = m.period.start; });
      })));
    }
    el.append(section('Não fecha', rows, 'Nada muda sem a sua confirmação.'));
  }
  return { title: 'Orçamento ajustado', el, back: true };
}

export { openSheet };
