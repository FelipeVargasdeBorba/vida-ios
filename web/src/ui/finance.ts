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
    h('span', { class: 'grow' }, h('span', { class: 'row-title block' }, cloud ? 'Save to your account' : never ? 'Make your first backup' : 'Backup out of date'),
      h('span', { class: 'caption block' }, cloud ? 'Sign in to keep everything in the cloud and open it on any phone.' : 'Lose the phone, lose everything. It takes 10 seconds.')),
    h('span', { class: 'chev' }, '›')));
}

function checkCircle(done: boolean, color: string): HTMLElement {
  const el = h('span', { class: `check${done ? ' done' : ''}`, 'aria-hidden': 'true' }, done ? '✓' : '');
  el.style.setProperty('--c', color);
  return el;
}

function billSubtitle(state: BillState, due: number): { text: string; tone: 'bad' | 'warn' | '' } {
  switch (state.type) {
    case 'paid': return { text: 'paid', tone: '' };
    case 'overdue': return { text: `overdue by ${plural(state.days, 'day', 'days')}`, tone: 'bad' };
    case 'dueToday': return { text: 'due today', tone: 'warn' };
    case 'upcoming': return state.days <= 3 ? { text: `due in ${plural(state.days, 'day', 'days')}`, tone: 'warn' } : { text: `due ${fmtShort(due)}`, tone: '' };
    case 'noDate': return { text: 'this period', tone: '' };
  }
}

/** Tap on a goal's circle: enter how much was transferred, or undo. */
export async function goalTap(row: GoalRow, m: FinanceModel): Promise<void> {
  if (row.isDone) {
    if (await confirmDialog('Undo the transfer?', `${row.goal.name}: ${money(row.transferred, m.currency)} no longer counts in this period.`, 'Undo', true)) {
      undoGoalTransfer(row, m.period);
    }
  } else {
    contributionSheet(row.goal, m.today, { suggested: row.toMove, note: GOAL_NOTE });
  }
}

// ── Dashboard ───────────────────────────────────────────────────────────────────

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
    ], spendRows.length ? (spent > spendTotal ? `Spent ${$(spent)} · over by ${$(spent - spendTotal)}` : `Spent ${$(spent)} · ${$(spendTotal - spent)} left`) : undefined));

    // Saves
    const reserve = m.split.saves.find((x) => x.kind.type === 'reserve')?.amount ?? 0;
    el.append(section(accountTitle('saves', $(m.split.savesTotal)), [
      ...catLines('saves').map((l) => categoryRow(l, m, ctx)),
      reserve > 0 ? plainRow('🍃', catColor('poupanca'), 'Reserve', 'what is left after the goals', $(reserve)) : null,
    ], m.split.savesKept > 0 ? `Set aside when you get paid. Of that, ${$(m.split.savesKept)} stays as reserve.` : 'Set aside when you get paid to cover the bills.'));

    // Metas: cada uma com a sua conta
    if (m.goals.length) {
      el.append(section(accountTitle('goal', $(m.split.goalsTotal)), [
        ...m.goals.map((r, i) => goalSplitRow(r, i, m)),
        !m.savingsCheck.isEnough ? savingsWarning(m) : null,
      ], 'Each goal has its own account. Transfer straight to it, without going through saves.'));
    }
    el.append(walletSection(m, ctx));
    if (m.adaptation) el.append(adaptationCard(m));
  }

  const tile = (symbol: string, title: string, href: string, detail?: string) => h('a', { class: 'nav-tile', href },
    h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, symbol), h('span', { class: 'strong' }, title), detail ? h('span', { class: 'caption' }, detail) : null);
  el.append(h('section', { class: 'group' }, h('h2', { class: 'group-title' }, 'Explore'), h('div', { class: 'nav-grid' },
    tile('🧾', 'Transactions', hrefTo(FINANCE, 'transactions'), 'everything in and out'),
    tile('📌', 'Fixed expenses', hrefTo(FINANCE, 'fixed'), `${store.state.fixed.length} set up`),
    tile('🎯', 'Goals', hrefTo(FINANCE, 'goals'), m.goals.length ? `${m.goals.length} in progress` : 'create the first'),
    tile('🕘', 'History', hrefTo(FINANCE, 'history'), 'compare periods'),
    tile('⚙️', 'Settings', hrefTo(FINANCE, 'setup')),
    syncConfigured ? tile('☁️', 'Account and cloud', hrefTo(FINANCE, 'account'), sync.signedIn ? 'connected' : 'sign in') : null,
    tile('💾', 'Backup', hrefTo(FINANCE, 'backup'), 'password protected'))));
  if (m.income > 0) {
    el.append(h('div', { class: 'center' }, button('Save to history', () => { saveSnapshot(m); toast('Saved to history'); })));
  }
  return {
    title: 'Finance', el,
    actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'New transaction', onclick: () => transactionSheet(ctx.today) }, '＋')],
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
    h('h3', null, 'Got your salary?'),
    h('p', { class: 'muted' }, 'Log the amount that landed in your account and the app shows how much to keep for spending and how much to set aside for saves.'),
    button('Add salary', () => transactionSheet(ctx.today, undefined, 'income'), 'primary'),
    h('p', { class: 'caption' }, `Period ${fmtPeriod(m.period)}`)));
}

/** Current spending-account balance, with the daily pace that still fits the period. */
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
      h('span', { class: 'chip' }, m.daysUntilPayday === 0 ? 'Payday today' : `Payday in ${plural(m.daysUntilPayday, 'day', 'days')}`),
      h('span', { class: 'muted' }, fmtPeriod(m.period))),
    h('div', { class: 'balance-main' },
      h('span', { class: 'caption' }, '💳 Spending account now'),
      h('strong', { class: `balance-value num ${tone}` }, $(left)),
      h('span', { class: 'caption num' }, left < 0 ? `${$(-left)} over what fit (${$(total)})` : `of ${$(total)} · spent ${$(m.spendingSpent)}`)),
    bar(used, left < 0 ? 'var(--bad)' : 'var(--cat-outro)', left < 0),
    h('div', { class: 'tiles' },
      stat('Per day', left > 0 ? $(perDay) : '—', left > 0 ? `${plural(m.daysLeft, 'day', 'days')} left` : 'no room'),
      stat('Today', $(today), today > 0 ? 'spent today' : 'nothing spent'),
      stat('Used', `${Math.round(Math.min(used, 9.99) * 100)}%`, 'of the period')),
    h('div', { class: 'quick' },
      button('− Expense', () => transactionSheet(ctx.today), 'primary'),
      button('+ Income', () => transactionSheet(ctx.today, undefined, 'income')))));
}

/** Cumulative spending against the even pace of the spending-account budget. */
function paceCard(m: FinanceModel, ctx: Ctx): HTMLElement {
  const s = store.state;
  const spending = new Set(s.settings.spendingAccount);
  const expenses = s.transactions.filter((t) => t.kind === 'expense' && spending.has(t.category)).map((t) => ({ day: t.day, amount: t.amount }));
  const budget = m.split.spendingTotal;
  const pts = paceSeries(m.period, ctx.today, budget, expenses);
  const idx = Math.max(0, Math.min(pts.length - 1, ctx.today - m.period.start));
  const ahead = (pts[idx]?.spent ?? 0) - (pts[idx]?.ideal ?? 0);
  const note = budget <= 0 ? 'No budget in the spending account.'
    : ahead > 0 ? `You are ${money(ahead, m.currency)} above the pace.` : `You are ${money(-ahead, m.currency)} below the pace.`;
  return section('📈 Spending pace', [h('div', { class: 'chart-card' }, areaChart({
    points: pts.map((p) => ({ label: fmtShort(p.day), value: p.spent, ref: p.ideal })),
    cap: budget, capLabel: 'Budget', valueLabel: 'Spent', refLabel: 'Even pace', fmt: (c) => money(c, m.currency),
    initial: idx, overIsBad: true, ariaLabel: 'Cumulative spending in the period',
  }))], `${note} Tap or drag on the chart to see each day.`);
}

/** Salary donut: tap a slice to see the amount and percentage. */
function splitCard(m: FinanceModel): HTMLElement {
  const { split } = m;
  const total = split.all.reduce((a, x) => a + x.amount, 0);
  const idle = () => [
    h('span', { class: 'caption' }, 'Move'), h('strong', { class: 'num' }, money(split.movedOut, m.currency)),
    h('span', { class: 'caption' }, `of ${money(m.income, m.currency)}`)];
  const center = h('div', { class: 'donut-text' }, idle());
  const tile = (account: BankAccount, amount: number, caption: string) => h('div', { class: `tile ${account}` },
    h('span', { class: 'tile-title' }, `${accountIcon[account]} ${ACCOUNT_TITLE[account]}`), h('strong', { class: 'num' }, money(amount, m.currency)), h('span', { class: 'caption' }, caption));
  const chart = donut(split.all, center, (i) => {
    const x = i === null ? undefined : split.all[i];
    center.replaceChildren(...(x
      ? [h('span', { class: 'caption' }, x.title), h('strong', { class: 'num' }, money(x.amount, m.currency)), h('span', { class: 'caption' }, `${Math.round((x.amount / Math.max(1, total)) * 100)}% of salary`)]
      : idle()));
  });
  return section('🥧 Salary split', [h('div', { class: 'hero' }, chart,
    h('div', { class: 'tiles' },
      tile('spending', split.spendingTotal, 'day to day'), tile('saves', split.savesTotal, 'bills and reserve'),
      split.goalsTotal > 0 ? tile('goal', split.goalsTotal, split.goals.length === 1 ? 'goal account' : `${split.goals.length} accounts`) : null),
    h('ul', { class: 'legend' }, split.all.map((x) => h('li', null, h('i', { style: { background: sliceColor(x) } }), h('span', null, x.title), h('span', { class: 'num muted' }, money(x.amount, m.currency))))))],
  'Tap a slice of the donut for details.');
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
    rows.push(item(!!m.transferCheck, 'var(--cat-poupanca)', 'Move to saves', m.transferCheck ? 'done' : 'move when you get paid', '', $(m.split.savesTotal), () => toggleTransfer(m)));
  }
  for (const b of m.bills) {
    const sub = billSubtitle(b.state, b.due);
    rows.push(item(!!b.check, catColor(b.fixed.category), b.title, sub.text, sub.tone, $(b.fixed.monthly), () => toggleBill(b)));
  }
  for (const { r, i } of goals) {
    const sub = r.isDone ? (r.transferred === r.allocation ? 'transferred' : `transferred · plan ${$(r.allocation)}`)
      : r.transferred > 0 ? 'still to transfer to the goal account' : 'transfer to the goal account';
    rows.push(item(r.isDone, goalColor(i), `Goal ${r.goal.name}`, sub, '', $(r.isDone ? r.transferred : r.toMove), () => void goalTap(r, m)));
  }
  const header = h('span', { class: `account-title${done === total ? ' all-done' : ''}` }, h('span', null, '✅ Checklist'), h('span', { class: 'num' }, `${done} of ${total}`));
  return section(header, rows);
}

function carryRow(m: FinanceModel, ctx: Ctx): HTMLElement {
  const weekly = store.state.settings.frequency === 'weekly';
  const positive = m.carry > 0;
  const title = positive ? (weekly ? 'Left over from last week' : 'Left over from last month') : (weekly ? 'Overspent last week' : 'Overspent last month');
  const caption = positive ? `added to ${CATEGORY_TITLE[m.carryCategory ?? 'outro']}` : 'taken from day-to-day spending';
  const row = plainRow(positive ? '↪️' : '↩️', positive ? 'var(--cat-poupanca)' : 'var(--bad)', title, caption, `${positive ? '+' : '−'} ${money(Math.abs(m.carry), m.currency)}`);
  row.append(h('button', {
    type: 'button', class: 'mini', onclick: async () => {
      if (await confirmDialog('Reset the carry-over?', 'This period\'s plan goes back to its normal value. Use it when the spending account balance at the bank does not match the app.', 'Reset and restart here')) {
        resetCarry(currentPeriod(store.state, ctx.today));
      }
    },
  }, 'Reset'));
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
        h('span', null, line.fixed > line.spent ? `fixed ${$(line.fixed)}` : `spent ${$(line.spent)}`),
        h('span', { class: over ? 'bad' : '' }, over ? `over by ${$(-remaining(line))}` : `${$(remaining(line))} left`)),
      fixedOver(line) ? h('div', { class: 'caption bad' }, 'Fixed expenses exceed the plan') : null,
      adjusted !== undefined && adjusted !== line.target ? h('div', { class: 'caption warn' }, `Adjusted to ${$(adjusted)}`) : null));
}

function goalSplitRow(r: GoalRow, i: number, m: FinanceModel): HTMLElement {
  const $ = (c: number) => money(c, m.currency);
  return h('a', { class: 'row two', href: hrefTo(FINANCE, 'goal', r.goal.id) }, iconBadge('🎯', goalColor(i)),
    h('div', { class: 'grow' },
      h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, r.goal.name), h('span', { class: 'num strong' }, $(r.effectiveAllocation))),
      bar(r.status.progress, goalColor(i)),
      h('div', { class: 'row-foot caption num' }, h('span', null, `${$(r.status.saved)} of ${$(r.status.target)}`),
        h('span', null, r.status.isComplete ? 'completed' : `by ${fmtShort(r.goal.deadline)}`))));
}

function savingsWarning(m: FinanceModel): HTMLElement {
  const c = m.savingsCheck;
  return h('div', { class: 'row warning' },
    h('p', { class: 'bad' }, `⚠️ ${money(c.shortfall, m.currency)} per period short for the goals.`),
    c.suggestion
      ? button(`Switch to ${c.suggestion.title}`, async () => {
        const next = c.suggestion;
        if (next && await confirmDialog(`Switch the plan to ${next.title}?`, '', 'Switch plan')) store.update((s) => { s.settings.preset = next.id; });
      })
      : h('p', { class: 'caption' }, 'No plan covers it alone. Extend the deadline or reduce the goal.'));
}

function walletSection(m: FinanceModel, ctx: Ctx): HTMLElement {
  const w = m.wallet;
  const s = store.state.settings;
  const input = moneyInput(s.savesBalance, (c) => setSavesBalance(c, ctx.today));
  const rows: Child[] = [
    h('label', { class: 'row two' }, iconBadge('🏦', 'var(--cat-poupanca)'),
      h('div', { class: 'grow' }, h('div', { class: 'row-title' }, 'Already in saves'),
        h('div', { class: 'caption' }, s.savesBalanceUpdatedAt !== null ? `updated ${fmtShort(s.savesBalanceUpdatedAt)}` : 'tap to enter')), input),
    valueRow('Comes in from this salary', `+ ${money(w.incoming, m.currency)}`, 'good'),
    w.bills > 0 ? valueRow('Goes out to bills', `− ${money(w.bills, m.currency)}`) : null,
    h('div', { class: 'row value-row strong-row' }, h('span', { class: 'row-title' }, `Left after the ${store.state.settings.frequency === 'weekly' ? 'week' : 'month'}`), h('span', { class: 'num' }, money(w.afterPeriod, m.currency))),
  ];
  return section('🏦 Saves wallet', rows);
}

function adaptationCard(m: FinanceModel): HTMLElement {
  const a = m.adaptation;
  if (!a) return h('div');
  const status = !a.isNeeded ? 'Everything within the plan' : a.isFeasible ? `Adjusted to make up ${money(a.need, m.currency)}`
    : m.shortfallAccepted ? `Delay accepted: ${money(a.shortfall, m.currency)} short` : `${money(a.shortfall, m.currency)} short for the goal`;
  return section('Automatic adaptation', [h('a', { class: 'row link-row', href: hrefTo(FINANCE, 'adaptation') },
    h('span', { class: 'grow' }, h('span', { class: 'row-title block' }, `You can spend ${money(a.dailyAllowance, m.currency)} per day`),
      h('span', { class: `caption block ${a.isFeasible || m.shortfallAccepted ? '' : 'bad'}` }, status)), h('span', { class: 'chev' }, '›'))]);
}

// ── Transactions ───────────────────────────────────────────────────────────────

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
    h('button', { type: 'button', 'aria-label': 'Previous period', onclick: () => go(previousPeriod(period, schedule)) }, '‹'),
    h('strong', null, fmtPeriod(period)),
    h('button', { type: 'button', 'aria-label': 'Next period', onclick: () => go(nextPeriod(period, schedule)) }, '›'));
  const periodExpenses = s.transactions.filter((t) => periodContains(period, t.day) && t.kind === 'expense');
  const chip = (value: Category | '', label: string, amount: number) => h('button', {
    type: 'button', class: `chip-btn${txFilter === value ? ' on' : ''}`, 'aria-pressed': txFilter === value,
    onclick: () => { txFilter = txFilter === value ? '' : value; window.dispatchEvent(new Event('vida:rerender')); },
  }, h('span', null, label), amount > 0 ? h('span', { class: 'num caption' }, money(amount, cur)) : null);
  const filter = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' },
    chip('', 'All', periodExpenses.reduce((a, t) => a + t.amount, 0)),
    SPENDING.map((c) => chip(c, `${CATEGORY_ICON[c]} ${TRANSACTION_TITLE[c]}`, periodExpenses.filter((t) => t.category === c).reduce((a, t) => a + t.amount, 0))));

  const el = h('div', { class: 'page' }, nav, filter);
  if (items.length === 0) el.append(emptyState('🧾', 'No transactions', 'Tap ＋ to add one.'));
  else {
    const income = items.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0);
    const spent = items.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0);
    el.append(section(null, [valueRow('Income', money(income, cur), 'good'), valueRow('Expenses', money(spent, cur))]));
    const days = [...new Set(items.map((t) => t.day))];
    for (const day of days) {
      el.append(section(fmtLong(day), items.filter((t) => t.day === day).map((t) =>
        h('button', { type: 'button', class: 'row two', onclick: () => transactionSheet(ctx.today, t) },
          iconBadge(t.kind === 'income' ? '⬇️' : CATEGORY_ICON[t.category], t.kind === 'income' ? 'var(--good)' : catColor(t.category)),
          h('span', { class: 'grow left' }, h('span', { class: 'row-title block' }, t.kind === 'income' ? (t.source === 'salary' ? 'Salary' : 'Other income') : TRANSACTION_TITLE[t.category]),
            t.note ? h('span', { class: 'caption block' }, t.note) : null),
          h('span', { class: `num strong ${t.kind === 'income' ? 'good' : ''}` }, `${t.kind === 'income' ? '+' : '−'}${money(t.amount, cur)}`)))));
    }
  }
  return { title: 'Transactions', el, back: true, actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'New transaction', onclick: () => transactionSheet(ctx.today) }, '＋')] };
}

// ── Fixed expenses ─────────────────────────────────────────────────────────────

const SUGGESTIONS: { name: string; category: Category }[] = [
  { name: 'Rent', category: 'casa' }, { name: 'Internet', category: 'fixos' }, { name: 'Phone', category: 'fixos' },
  { name: 'Insurance', category: 'fixos' }, { name: 'Transit pass', category: 'transporte' },
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
        f.dueDay > 0 ? h('span', { class: 'caption block' }, `${f.remindOn ? '🔔' : '📅'} due on day ${f.dueDay}`) : null),
      h('span', { class: 'num' }, `${money(f.monthly, cur)}/month`),
      f.dueDay > 0 && f.remindOn ? h('span', {
        class: 'mini', role: 'button', tabindex: 0, onclick: (e: Event) => { e.stopPropagation(); exportBillToCalendar(f, ctx.today, money(f.monthly, cur)); },
      }, 'Calendar') : null))));
  }
  const missing = SUGGESTIONS.filter((x) => !s.fixed.some((f) => f.name === x.name));
  if (missing.length) {
    el.append(section('Suggestions', missing.map((x) => h('button', { type: 'button', class: 'row', onclick: () => fixedSheet(x) },
      h('span', { class: 'row-icon' }, '＋'), h('span', { class: 'row-title' }, `${x.name} (${CATEGORY_TITLE[x.category]})`)))));
  }
  el.append(section(null, [valueRow('Monthly total', money(s.fixed.reduce((a, f) => a + f.monthly, 0), cur))],
    'Enter monthly amounts only. With weekly income, the app converts by ×12/52. To get an alert on the due date, use the Calendar button: it creates a monthly event with an alert in the iPhone Calendar app.'));
  return { title: 'Fixed expenses', el, back: true, actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'New fixed expense', onclick: () => fixedSheet() }, '＋')] };
}

// ── Goals ────────────────────────────────────────────────────────────────────

let reorder = false;

export function goalsView(ctx: Ctx): View {
  const s = store.state;
  const m = makeFinanceModel(s, ctx.today);
  const toMove = m.goals.reduce((a, r) => a + r.toMove, 0);
  const $ = (c: number) => money(c, m.currency);
  const noun = s.settings.frequency === 'weekly' ? 'week' : 'month';
  const el = h('div', { class: 'page' });

  el.append(h('section', { class: 'group' }, h('div', { class: 'card summary' },
    h('span', { class: 'caption' }, `This ${noun}`),
    m.income === 0 ? h('h3', null, 'Log your salary to see how much to transfer')
      : toMove > 0 ? h('h3', null, `Transfer ${$(toMove)} to your goals`) : h('h3', { class: 'good' }, '✓ All transferred'),
    h('p', { class: 'caption' }, 'Each goal has its own account: transfer straight to it. Tap the circle once you do.'),
    m.income > 0 && !m.savingsCheck.isEnough ? savingsWarning(m) : null)));

  if (m.goals.length === 0) el.append(emptyState('🎯', 'No goals', 'Tap ＋ to create the first.'));
  else {
    const ids = m.goals.map((r) => r.goal.id);
    el.append(section('Your goals', m.goals.map((r, i) => {
      const st = r.status;
      const headline = st.isComplete ? 'completed' : r.isDone ? `transferred ${$(r.transferred)}` : r.toMove > 0 ? `transfer ${$(r.toMove)}` : 'nothing now';
      return h('div', { class: 'row two' },
        reorder ? null : h('button', { type: 'button', class: 'check-btn', disabled: r.allocation === 0, 'aria-label': r.isDone ? 'Undo' : 'Mark as transferred', onclick: () => void goalTap(r, m) }, checkCircle(r.isDone, goalColor(i))),
        h('a', { class: 'grow', href: hrefTo(FINANCE, 'goal', r.goal.id) },
          h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, r.goal.name), h('span', { class: `num strong ${r.toMove > 0 ? '' : 'muted'}` }, headline)),
          bar(st.progress, goalColor(i)),
          h('div', { class: `caption num ${st.isOverdue && !st.isComplete ? 'bad' : ''}` }, st.isComplete ? `Goal completed · ${$(st.saved)}` : `${$(st.saved)} of ${$(st.target)} · by ${fmtFull(r.goal.deadline)}`)),
        reorder ? h('span', { class: 'reorder' },
          h('button', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(ids, i, -1) }, '▲'),
          h('button', { type: 'button', 'aria-label': 'Move down', disabled: i === ids.length - 1, onclick: () => move(ids, i, 1) }, '▼')) : null);
    }), m.goals.length > 1 ? 'The top one is funded first. Tap Reorder to change.' : undefined));
  }
  return {
    title: 'Goals', el, back: true,
    actions: [
      m.goals.length > 1 ? h('button', { type: 'button', class: 'text-btn', onclick: () => { reorder = !reorder; window.dispatchEvent(new Event('vida:rerender')); } }, reorder ? 'Done' : 'Reorder') : null,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'New goal', onclick: () => goalSheet(ctx.today) }, '＋'),
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
  if (!goal) return { title: 'Goal', el: h('div', { class: 'page' }, emptyState('🎯', 'Goal not found', 'It may have been deleted.')), back: true };
  const cur = s.settings.currency;
  const saved = s.contributions.filter((c) => c.goalId === goal.id).reduce((a, c) => a + c.amount, 0);
  const items = s.contributions.filter((c) => c.goalId === goal.id).sort((a, b) => b.day - a.day);
  const curve = cumulative(items);
  const el = h('div', { class: 'page' },
    section(null, [valueRow('Saved', money(saved, cur), 'good'), valueRow('Target', money(goal.target, cur)), valueRow('Deadline', fmtFull(goal.deadline))]),
    curve.length > 1 ? section('📈 Progress', [h('div', { class: 'chart-card' }, areaChart({
      points: curve.map((c) => ({ label: fmtShort(c.day), value: c.total })),
      cap: goal.target, capLabel: 'Target', valueLabel: 'Saved', fmt: (c) => money(c, cur), initial: curve.length - 1, ariaLabel: 'Progress of the saved amount',
    }))], `${Math.round(Math.min(1, saved / Math.max(1, goal.target)) * 100)}% of the target.`) : null,
    section('Contributions', items.length ? items.map((c) => h('div', { class: 'row two' },
      h('button', { type: 'button', class: 'grow left', onclick: () => contributionSheet(goal, ctx.today, { existingId: c.id }) },
        h('span', { class: 'row-title block' }, fmtFull(c.day)), c.note ? h('span', { class: 'caption block' }, c.note) : null),
      h('span', { class: 'num' }, money(c.amount, cur)),
      h('button', { type: 'button', class: 'mini', 'aria-label': 'Delete contribution', onclick: async () => {
        if (await confirmDialog('Delete this contribution?', '', 'Delete', true)) store.update((st) => { st.contributions = st.contributions.filter((x) => x.id !== c.id); });
      } }, '✕')))
      : [h('div', { class: 'row muted' }, 'No contributions yet')]),
    h('div', { class: 'stack center' }, button('New contribution', () => contributionSheet(goal, ctx.today), 'primary'),
      button('Delete goal', async () => {
        if (await confirmDialog('Delete this goal?', 'Its contributions are deleted too.', 'Delete', true)) { deleteGoal(goal.id); history.back(); }
      }, 'danger')));
  return { title: goal.name, el, back: true, actions: [h('button', { type: 'button', class: 'text-btn', onclick: () => goalSheet(ctx.today, goal) }, 'Edit')] };
}

// ── History ────────────────────────────────────────────────────────────────

export function historyView(): View {
  const s = store.state;
  const el = h('div', { class: 'page' });
  if (!s.snapshots.length) el.append(emptyState('🕘', 'History is empty', 'Use "Save to history" in Finance.'));
  else {
    const recent = [...s.snapshots].sort((a, b) => a.periodStart - b.periodStart).slice(-8);
    const cur = recent[recent.length - 1]?.currency ?? s.settings.currency;
    el.append(section('📊 Income × spending', [h('div', { class: 'chart-card' }, barChart({
      groups: recent.map((x) => ({ id: x.id, label: fmtShort(x.periodStart), a: x.income, b: x.totalSpent })),
      aLabel: 'Income', bLabel: 'Spent', fmt: (c) => money(c, cur), ariaLabel: 'Income and spending per period',
      onOpen: (id) => { location.hash = hrefTo(FINANCE, 'history', id); },
    }))], recent.length > 1 ? 'Tap a bar to read the values and open the period.' : 'Save more periods to compare.'));
    el.append(section('Saved periods', s.snapshots.map((x) => h('a', { class: 'row link-row', href: hrefTo(FINANCE, 'history', x.id) },
      h('span', { class: 'grow' }, h('span', { class: 'row-title block' }, fmtPeriod({ start: x.periodStart, end: x.periodEnd })),
        h('span', { class: 'caption block' }, `${presetById(x.preset).title} · save ${money(x.savingsPlanned, x.currency)}`),
        h('span', { class: 'caption block faint' }, `Saved on ${fmtStamp(x.savedAt)}`)), h('span', { class: 'chev' }, '›')))));
  }
  return { title: 'History', el, back: true };
}

export function historyDetailView(ctx: Ctx): View {
  const x = store.state.snapshots.find((n) => n.id === ctx.path[1]);
  if (!x) return { title: 'Details', el: h('div', { class: 'page' }, emptyState('🕘', 'Not found', 'This record was deleted.')), back: true };
  const $ = (c: number) => money(c, x.currency);
  const el = h('div', { class: 'page' },
    section('Period', [
      valueRow('Dates', fmtPeriod({ start: x.periodStart, end: x.periodEnd })), valueRow('Income', $(x.income)), valueRow('Plan', presetById(x.preset).title),
      valueRow('Planned savings', $(x.savingsPlanned), 'good'), valueRow('Fixed', $(x.totalFixed)), valueRow('Free', $(x.free)),
      valueRow('Actual spending', $(x.totalSpent)), valueRow('Income logged', $(x.incomeLogged))]),
    section('Lines', x.lines.map((l) => h('div', { class: 'row two' },
      h('div', { class: 'grow' }, h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, CATEGORY_TITLE[l.category]),
        h('span', { class: `num ${Math.max(l.spent, l.fixed) > l.target ? 'bad' : 'muted'}` }, `${$(l.spent)} / ${$(l.target)}`)),
        h('div', { class: 'row-foot caption' }, h('span', null, l.fixed > 0 ? `Fixed ${$(l.fixed)}` : ''), h('span', { class: 'warn' }, l.adjusted !== null && l.adjusted !== l.target ? `Adjusted ${$(l.adjusted)}` : ''))))))
  );
  if (x.goals.length) {
    el.append(section('Goals', x.goals.map((g) => h('div', { class: 'row two' }, h('div', { class: 'grow' },
      h('div', { class: 'row-head' }, h('span', { class: 'row-title' }, g.name), h('span', { class: 'num' }, `${$(g.saved)} / ${$(g.target)}`)),
      h('div', { class: 'caption' }, `Required this period ${$(g.requiredThisPeriod)} · contributed ${$(g.contributedThisPeriod)}`))))));
  }
  el.append(h('div', { class: 'center' }, button('Delete from history', async () => {
    if (await confirmDialog('Delete this record?', '', 'Delete', true)) { store.update((s) => { s.snapshots = s.snapshots.filter((n) => n.id !== x.id); }); history.back(); }
  }, 'danger')));
  return { title: 'Detalhe', el, back: true };
}

// ── Adaptation ────────────────────────────────────────────────────────────────

export function adaptationView(ctx: Ctx): View {
  const s = store.state;
  const m = makeFinanceModel(s, ctx.today);
  const a = m.adaptation;
  if (!a) return { title: 'Adjusted budget', el: h('div', { class: 'page' }, emptyState('🎚️', 'Adaptation is off', 'Turn it on in Settings › Adapt plan to hit the goal.')), back: true };
  const $ = (c: number) => money(c, m.currency);
  const cmp = (title: string, original: number, adjusted: number) => h('div', { class: 'row cmp' },
    h('span', { class: 'grow' }, title), h('span', { class: 'num muted' }, $(original)),
    h('span', { class: `num ${adjusted < original ? 'warn' : adjusted > original ? 'bad' : ''}` }, $(adjusted)));
  const el = h('div', { class: 'page' },
    section(null, [valueRow('Can spend per day', $(a.dailyAllowance), 'accent'), valueRow('Days until payday', String(m.daysLeft)), a.isNeeded ? valueRow('To make up', $(a.need)) : null],
      a.isNeeded ? 'Remaining flexible categories divided by the days left.' : 'No category went over its target. Nothing was adjusted.'),
    section('Original × adjusted', [h('div', { class: 'row cmp head caption' }, h('span', { class: 'grow' }, 'Category'), h('span', null, 'Original'), h('span', null, 'Adjusted')),
      ...a.lines.map((l) => cmp(CATEGORY_TITLE[l.category], l.original, l.adjusted)), cmp('Savings', a.originalSavings, a.adjustedSavings)],
    `Protected goal floor: ${$(a.savingsFloor)}. Home and Fixed expenses are not cut.`));
  if (!a.isFeasible) {
    const rows: Node[] = [h('p', { class: 'row bad' }, `⚠️ Even cutting everything flexible, ${$(a.shortfall)} is still missing to meet the goal this period.`)];
    if (m.shortfallAccepted) rows.push(h('p', { class: 'row muted' }, '✓ Delay accepted this period'));
    else {
      const next = moreAggressive(presetById(s.settings.preset));
      if (next) rows.push(h('div', { class: 'row' }, button(`Switch to ${next.title}`, async () => {
        if (await confirmDialog(`Switch the plan to ${next.title}?`, '', 'Confirm')) store.update((st) => { st.settings.preset = next.id; });
      })));
      for (const r of [...m.goals].reverse()) {
        const st = r.status;
        const date = extendedDeadline(Math.max(0, st.target - (st.saved - st.contributedThisPeriod)), st.requiredThisPeriod, a.shortfall, m.period, m.schedule);
        if (date !== null) {
          rows.push(h('div', { class: 'row' }, button(`Extend ${r.goal.name} to ${fmtFull(date)}`, async () => {
            if (await confirmDialog(`Extend the deadline of ${r.goal.name} to ${fmtFull(date)}?`, '', 'Confirm')) store.update((state) => { const g = state.goals.find((x) => x.id === r.goal.id); if (g) g.deadline = date; });
          })));
          break;
        }
      }
      rows.push(h('div', { class: 'row' }, button('Accept the delay', async () => {
        if (await confirmDialog('Accept that the goal falls behind this period?', '', 'Accept')) store.update((st) => { st.settings.acceptedShortfallPeriodStart = m.period.start; });
      })));
    }
    el.append(section('Does not add up', rows, 'Nothing changes without your confirmation.'));
  }
  return { title: 'Adjusted budget', el, back: true };
}

export { openSheet };
