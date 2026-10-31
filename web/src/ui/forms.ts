import { type AgendaKind, WEEKDAY_NAMES, WEEKDAY_SHORT, timeText } from '../domain/agenda';
import { CATEGORY_TITLE, type Category, SPENDING, TRANSACTION_TITLE } from '../domain/budget';
import type { Day } from '../domain/dates';
import { parseCents } from '../domain/money';
import { GOAL_NOTE } from '../actions';
import { type AgendaItem, type FixedExpense, type Goal, type Tx, newId } from '../state';
import { store } from '../store';
import { billRrule, icsCalendar, weeklyRrule } from '../ics';
import { button, confirmDialog, download, labelled, moneyInput, openSheet, segmented, select, toast } from './components';
import { type Child, clear, h, put } from './dom';
import { fromInputDate, toInputDate } from './format';

const form = (...rows: Child[]) => h('div', { class: 'form' }, h('div', { class: 'card' }, rows));
const dateInput = (day: Day) => h('input', { type: 'date', class: 'field', value: toInputDate(day), required: true });
const textInput = (value: string, placeholder: string) =>
  h('input', { type: 'text', class: 'field', value, placeholder, autocomplete: 'off', enterkeyhint: 'done' });
const cents = (input: HTMLInputElement) => parseCents(input.value) ?? 0;
const dayOf = (input: HTMLInputElement, fallback: Day) => fromInputDate(input.value) ?? fallback;

function invalid(input: HTMLElement, message: string): false {
  input.focus();
  toast(message);
  return false;
}

// ── Transação ────────────────────────────────────────────────────────────────

export function transactionSheet(today: Day, tx?: Tx, kind: 'expense' | 'income' = 'expense'): void {
  const d = {
    kind: tx?.kind ?? kind,
    source: tx?.source ?? 'salary',
    category: (tx?.category === 'poupanca' ? 'outro' : tx?.category ?? 'alimentacao') as Category,
  };
  const amount = moneyInput(tx?.amount ?? 0, () => {});
  const date = dateInput(tx?.day ?? today);
  const note = textInput(tx?.note ?? '', 'Nota (opcional)');
  const body = h('div');
  const draw = () => {
    clear(body);
    put(body,
      h('div', { class: 'seg-wrap' }, segmented([{ value: 'expense', label: 'Gasto' }, { value: 'income', label: 'Entrada' }], d.kind, (v) => { d.kind = v; draw(); })),
      form(
        labelled(`Valor (${store.state.settings.currency})`, amount),
        labelled('Data', date),
        d.kind === 'income'
          ? labelled('Origem', select([{ value: 'salary', label: 'Salário' }, { value: 'other', label: 'Outra entrada' }], d.source, (v) => { d.source = v; }))
          : labelled('Categoria', select(SPENDING.map((c) => ({ value: c, label: TRANSACTION_TITLE[c] })), d.category, (v) => { d.category = v; })),
        labelled('Nota', note)),
      d.kind === 'income' && d.source === 'salary'
        ? h('p', { class: 'group-footer' }, 'O salário lançado define o valor que o plano divide neste período.') : null,
      tx ? button('Apagar', async () => {
        if (await confirmDialog('Apagar este lançamento?', '', 'Apagar', true)) {
          store.update((s) => { s.transactions = s.transactions.filter((t) => t.id !== tx.id); });
          body.closest('dialog')?.close();
        }
      }, 'danger') : null);
  };
  draw();
  openSheet(tx ? 'Editar' : d.kind === 'income' ? 'Nova entrada' : 'Novo gasto', () => body, {
    onSave: () => {
      const value = cents(amount);
      if (value <= 0) return invalid(amount, 'Informe um valor maior que zero.');
      store.update((s) => {
        const target: Tx = tx ? s.transactions.find((t) => t.id === tx.id) ?? tx : { id: newId(), kind: d.kind, source: d.source, amount: value, day: 0, category: 'outro', note: '' };
        Object.assign(target, {
          kind: d.kind, source: d.source, amount: value, day: dayOf(date, today), note: note.value.trim(),
          category: d.kind === 'income' ? 'outro' : d.category,
        });
        if (!tx) s.transactions.push(target);
      });
    },
  });
}

// ── Gasto fixo ───────────────────────────────────────────────────────────────

export function fixedSheet(preset?: { name: string; category: Category }, item?: FixedExpense): void {
  const d = { category: item?.category ?? preset?.category ?? 'casa', dueDay: item?.dueDay ?? 0, remind: item?.remindOn ?? true };
  const name = textInput(item?.name ?? preset?.name ?? '', 'Nome');
  const monthly = moneyInput(item?.monthly ?? 0, () => {});
  const extra = h('div');
  const drawExtra = () => {
    clear(extra);
    if (d.dueDay > 0) {
      put(extra,
        labelled('Lembrar de pagar', (() => {
          const box = h('input', { type: 'checkbox', class: 'switch', checked: d.remind, onchange: () => { d.remind = box.checked; drawExtra(); } });
          return box;
        })()),
        d.remind ? h('p', { class: 'group-footer pad' },
          'O iPhone não deixa um app instalado pela web agendar avisos sozinho. Por isso o aviso vai para o app Calendário: salve e toque em "Adicionar ao Calendário". ',
          d.dueDay >= 29 ? `Para o dia ${d.dueDay}, o evento cai no último dia do mês.` : '') : null);
    }
  };
  drawExtra();
  openSheet(item ? 'Editar fixo' : 'Novo fixo', (close) => h('div', null,
    form(
      labelled('Nome', name),
      labelled('Categoria', select(SPENDING.map((c) => ({ value: c, label: CATEGORY_TITLE[c] })), d.category, (v) => { d.category = v; })),
      labelled('Valor mensal', monthly),
      labelled('Vence no dia', select([{ value: 0, label: 'Sem data' }, ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `Dia ${i + 1}` }))], d.dueDay, (v) => { d.dueDay = v; drawExtra(); })),
      extra),
    item ? button('Apagar', async () => {
      if (await confirmDialog('Apagar este gasto fixo?', 'Os checks de pagamento dele também somem.', 'Apagar', true)) {
        store.update((s) => { s.fixed = s.fixed.filter((f) => f.id !== item.id); s.checks = s.checks.filter((c) => c.fixedId !== item.id); });
        close();
      }
    }, 'danger') : null), {
    onSave: () => {
      const value = cents(monthly);
      if (value <= 0) return invalid(monthly, 'Informe o valor mensal.');
      store.update((s) => {
        const target: FixedExpense = item ? s.fixed.find((f) => f.id === item.id) ?? item : { id: newId(), name: '', category: 'casa', monthly: 0, dueDay: 0, remindOn: false };
        Object.assign(target, { name: name.value.trim(), category: d.category, monthly: value, dueDay: d.dueDay, remindOn: d.dueDay > 0 && d.remind });
        if (!item) s.fixed.push(target);
      });
    },
  });
}

/** Evento mensal para o app Calendário, com aviso na hora configurada. */
export function exportBillToCalendar(f: FixedExpense, today: Day, valueText: string): void {
  const s = store.state.settings;
  download(`${(f.name || 'conta').replace(/[^\w-]+/g, '-')}.ics`, icsCalendar([{
    uid: `bill-${f.id}`, title: `Pagar ${f.name || CATEGORY_TITLE[f.category]}`, description: valueText,
    start: today, startMinutes: s.reminderMinutes, durationMinutes: 15, rrule: billRrule(f.dueDay), alarmBefore: 0,
  }]), 'text/calendar');
}

// ── Meta e aporte ────────────────────────────────────────────────────────────

export function goalSheet(today: Day, goal?: Goal): void {
  const name = textInput(goal?.name ?? '', 'Nome da meta');
  const target = moneyInput(goal?.target ?? 0, () => {});
  const defaultDeadline = goal?.deadline ?? today + 365;
  const deadline = dateInput(defaultDeadline);
  openSheet(goal ? 'Editar meta' : 'Nova meta', () => form(labelled('Nome', name), labelled('Valor-alvo', target), labelled('Prazo', deadline)), {
    onSave: () => {
      if (!name.value.trim()) return invalid(name, 'Dê um nome à meta.');
      if (cents(target) <= 0) return invalid(target, 'Informe o valor-alvo.');
      store.update((s) => {
        const g: Goal = goal ? s.goals.find((x) => x.id === goal.id) ?? goal : { id: newId(), name: '', target: 0, deadline: 0, priority: s.goals.length };
        Object.assign(g, { name: name.value.trim(), target: cents(target), deadline: dayOf(deadline, defaultDeadline) });
        if (!goal) s.goals.push(g);
      });
    },
  });
}

export function contributionSheet(goal: Goal, today: Day, opts: { existingId?: string; suggested?: number; note?: string } = {}): void {
  const existing = store.state.contributions.find((c) => c.id === opts.existingId);
  const amount = moneyInput(existing?.amount ?? opts.suggested ?? 0, () => {});
  const date = dateInput(existing?.day ?? today);
  const note = textInput(existing?.note ?? opts.note ?? '', 'Nota (opcional)');
  openSheet(existing ? 'Editar aporte' : `Aporte em ${goal.name}`, () => h('div', null,
    form(labelled(`Valor (${store.state.settings.currency})`, amount), labelled('Data', date), labelled('Nota', note)),
    opts.note === GOAL_NOTE ? h('p', { class: 'group-footer' }, 'Confirme o valor que você realmente transferiu para a conta da meta. O plano se adapta a ele.') : null), {
    saveLabel: 'Salvar',
    onSave: () => {
      const value = cents(amount);
      if (value <= 0) return invalid(amount, 'Informe um valor maior que zero.');
      store.update((s) => {
        if (existing) {
          const c = s.contributions.find((x) => x.id === existing.id);
          if (c) Object.assign(c, { amount: value, day: dayOf(date, today), note: note.value.trim() });
        } else s.contributions.push({ id: newId(), goalId: goal.id, amount: value, day: dayOf(date, today), note: note.value.trim() });
      });
    },
  });
}

// ── Agenda ───────────────────────────────────────────────────────────────────

const minutesInput = (m: number) => h('input', { type: 'time', class: 'field', value: timeText(m), required: true });
const minutesOf = (input: HTMLInputElement, fallback: number) => {
  const [hh, mm] = input.value.split(':').map(Number);
  return hh === undefined || mm === undefined || Number.isNaN(hh) || Number.isNaN(mm) ? fallback : hh * 60 + mm;
};

export function agendaSheet(today: Day, item?: AgendaItem, kind: AgendaKind = 'obligation'): void {
  const d = {
    kind: item?.kind ?? kind, mask: item?.weekdaysMask ?? 0, oneTime: item?.isOneTime ?? false,
    hasRange: item?.hasDateRange ?? false, before: item?.notifyMinutesBefore ?? 0,
  };
  const title = textInput(item?.title ?? '', 'Título');
  const start = minutesInput(item?.startMinutes ?? 540);
  const end = minutesInput(item?.endMinutes ?? 600);
  const oneDay = dateInput(item?.oneTimeDay ?? today);
  const rangeStart = dateInput(item?.rangeStart ?? today);
  const rangeEnd = dateInput(item?.rangeEnd ?? today + 30);
  const body = h('div');
  const draw = () => {
    clear(body);
    const days = h('div', { class: 'weekdays' }, WEEKDAY_SHORT.map((label, i) => {
      const on = (d.mask & (1 << i)) !== 0;
      return h('button', { type: 'button', class: on ? 'on' : '', 'aria-pressed': on, 'aria-label': WEEKDAY_NAMES[i], onclick: () => { d.mask ^= 1 << i; draw(); } }, label.slice(0, 1));
    }));
    put(body,
      h('div', { class: 'seg-wrap' }, segmented([{ value: 'obligation', label: 'Obrigação' }, { value: 'reminder', label: 'Lembrete' }], d.kind, (v) => { d.kind = v; draw(); })),
      form(
        labelled('Título', title),
        d.kind === 'obligation' ? [labelled('Início', start), labelled('Fim', end)] : labelled('Hora', start),
        d.kind === 'reminder' ? labelled('Só uma vez', h('input', { type: 'checkbox', class: 'switch', checked: d.oneTime, onchange: (e: Event) => { d.oneTime = (e.target as HTMLInputElement).checked; draw(); } })) : null,
        d.kind === 'reminder' && d.oneTime ? labelled('Data', oneDay) : null,
        !(d.kind === 'reminder' && d.oneTime) ? [h('div', { class: 'row' }, days),
          labelled('Limitar a um período', h('input', { type: 'checkbox', class: 'switch', checked: d.hasRange, onchange: (e: Event) => { d.hasRange = (e.target as HTMLInputElement).checked; draw(); } })),
          d.hasRange ? [labelled('De', rangeStart), labelled('Até', rangeEnd)] : null] : null,
        d.kind === 'reminder' ? labelled('Avisar antes', select([0, 5, 10, 15, 30, 60].map((m) => ({ value: m, label: m === 0 ? 'Na hora' : `${m} min antes` })), d.before, (v) => { d.before = v; })) : null),
      item ? h('div', { class: 'stack' }, button('Adicionar ao Calendário', () => exportAgendaToCalendar(item, today)),
        button('Apagar', async () => {
          if (await confirmDialog('Apagar este item?', '', 'Apagar', true)) {
            store.update((s) => { s.agenda = s.agenda.filter((a) => a.id !== item.id); });
            body.closest('dialog')?.close();
          }
        }, 'danger')) : null);
  };
  draw();
  openSheet(item ? 'Editar' : 'Novo item', () => body, {
    onSave: () => {
      if (!title.value.trim()) return invalid(title, 'Dê um título.');
      const oneTimeReminder = d.kind === 'reminder' && d.oneTime;
      if (!oneTimeReminder && d.mask === 0) { toast('Escolha ao menos um dia da semana.'); return false; }
      store.update((s) => {
        const target: AgendaItem = item ? s.agenda.find((a) => a.id === item.id) ?? item : {
          id: newId(), title: '', kind: d.kind, startMinutes: 540, endMinutes: 600, weekdaysMask: 0, isOneTime: false, oneTimeDay: today,
          hasDateRange: false, rangeStart: today, rangeEnd: today, notifyMinutesBefore: 0,
        };
        const startMin = minutesOf(start, 540);
        Object.assign(target, {
          title: title.value.trim(), kind: d.kind, startMinutes: startMin,
          endMinutes: d.kind === 'obligation' ? Math.max(minutesOf(end, startMin + 60), startMin) : startMin,
          weekdaysMask: d.mask, isOneTime: oneTimeReminder, oneTimeDay: dayOf(oneDay, today),
          hasDateRange: d.hasRange && !oneTimeReminder, rangeStart: dayOf(rangeStart, today), rangeEnd: dayOf(rangeEnd, today),
          notifyMinutesBefore: d.kind === 'reminder' ? d.before : 0,
        });
        if (!item) s.agenda.push(target);
      });
    },
  });
}

export function exportAgendaToCalendar(a: AgendaItem, today: Day): void {
  const oneTime = a.kind === 'reminder' && a.isOneTime;
  download(`${a.title.replace(/[^\w-]+/g, '-') || 'item'}.ics`, icsCalendar([{
    uid: `agenda-${a.id}`, title: a.title, start: oneTime ? a.oneTimeDay : a.hasDateRange ? a.rangeStart : today,
    startMinutes: a.startMinutes, durationMinutes: Math.max(15, a.endMinutes - a.startMinutes),
    rrule: oneTime ? undefined : weeklyRrule(a.weekdaysMask, a.hasDateRange ? a.rangeEnd : undefined),
    alarmBefore: a.notifyMinutesBefore,
  }]), 'text/calendar');
}
