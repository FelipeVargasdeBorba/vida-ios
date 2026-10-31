import { WEEKDAY_NAMES, WEEKDAY_SHORT, occursOn, timeText } from '../domain/agenda';
import { type Day, isoWeekday, ymd } from '../domain/dates';
import { type AgendaItem, newId } from '../state';
import { store } from '../store';
import { button, confirmDialog, emptyState, section, toggle } from './components';
import { agendaSheet, exportAgendaToCalendar } from './forms';
import { fmtLong, fmtShort } from './format';
import { h } from './dom';
import { type Ctx, type View, hrefTo } from './view';

let selected: Day | null = null;
const redraw = () => window.dispatchEvent(new Event('vida:rerender'));

function mondayOf(day: Day): Day { return day - (isoWeekday(day) - 1); }

function itemRow(a: AgendaItem, today: Day): HTMLElement {
  const when = a.isOneTime && a.kind === 'reminder' ? fmtShort(a.oneTimeDay)
    : WEEKDAY_SHORT.filter((_, i) => (a.weekdaysMask & (1 << i)) !== 0).join(' · ');
  return h('div', { class: 'row two' },
    h('button', { type: 'button', class: 'grow left', onclick: () => agendaSheet(today, a) },
      h('span', { class: 'row-title block' }, `${a.kind === 'reminder' ? '🔔' : '📚'} ${a.title}`),
      h('span', { class: 'caption block' }, `${timeText(a.startMinutes)}${a.kind === 'obligation' ? `–${timeText(a.endMinutes)}` : ''} · ${when}`)),
    h('span', { class: 'mini', role: 'button', tabindex: 0, onclick: () => exportAgendaToCalendar(a, today) }, 'Calendário'));
}

export function agendaView(ctx: Ctx): View {
  const s = store.state;
  const day = selected ?? ctx.today;
  const week = Array.from({ length: 7 }, (_, i) => mondayOf(day) + i);
  const el = h('div', { class: 'page' });
  el.append(h('div', { class: 'week-strip' }, week.map((d) => h('button', {
    type: 'button', class: `${d === day ? 'on' : ''}${d === ctx.today ? ' today' : ''}`, 'aria-pressed': d === day,
    onclick: () => { selected = d; redraw(); },
  }, h('span', { class: 'caption' }, WEEKDAY_SHORT[isoWeekday(d) - 1] ?? ''), h('strong', null, String(ymd(d).d))))));

  const work = s.workDays.find((w) => w.weekday === isoWeekday(day));
  const items = s.agenda.filter((a) => occursOn(a, day)).sort((a, b) => a.startMinutes - b.startMinutes);
  const rows = [
    work?.isOn ? h('div', { class: 'row two' }, h('span', { class: 'grow' }, h('span', { class: 'row-title block' }, '💼 Trabalho'),
      h('span', { class: 'caption block' }, `${timeText(work.startMinutes)}–${timeText(work.endMinutes)}`))) : null,
    ...items.map((a) => itemRow(a, ctx.today)),
  ];
  if (!work?.isOn && items.length === 0) el.append(section(fmtLong(day), [h('div', { class: 'row muted' }, 'Nada neste dia')]));
  else el.append(section(fmtLong(day), rows));
  if (day !== ctx.today) el.append(h('div', { class: 'center' }, button('Voltar para hoje', () => { selected = null; redraw(); })));
  el.append(section(null, [
    h('a', { class: 'row link-row', href: hrefTo('agenda', 'all') }, h('span', { class: 'grow row-title' }, '📋 Todos os itens'), h('span', { class: 'chev' }, '›')),
    h('a', { class: 'row link-row', href: hrefTo('agenda', 'work') }, h('span', { class: 'grow row-title' }, '💼 Dias de trabalho'), h('span', { class: 'chev' }, '›')),
  ]));
  return { title: 'Agenda', el, actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Novo item', onclick: () => agendaSheet(day) }, '＋')] };
}

export function agendaAllView(ctx: Ctx): View {
  const s = store.state;
  const el = h('div', { class: 'page' });
  if (!s.agenda.length) el.append(emptyState('📋', 'Sem itens', 'Toque em ＋ para criar uma obrigação ou lembrete.'));
  else {
    for (const [kind, title] of [['obligation', 'Obrigações'], ['reminder', 'Lembretes']] as const) {
      const list = s.agenda.filter((a) => a.kind === kind);
      if (list.length) el.append(section(title, list.map((a) => itemRow(a, ctx.today))));
    }
    el.append(h('p', { class: 'group-footer' }, 'Para ser avisado, use "Calendário": o iPhone não deixa sites agendarem notificações.'));
  }
  return { title: 'Todos os itens', el, back: true, actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Novo item', onclick: () => agendaSheet(ctx.today) }, '＋')] };
}

export function workView(): View {
  const s = store.state;
  const el = h('div', { class: 'page' });
  el.append(section(null, s.workDays.map((w) => {
    const time = (value: number, set: (m: number) => void) => h('input', {
      type: 'time', class: 'field time', value: timeText(value),
      onchange: (e: Event) => { const p = (e.target as HTMLInputElement).value.split(':'); const m = Number(p[0]) * 60 + Number(p[1]); if (Number.isFinite(m)) store.update(() => set(m)); },
    });
    return h('div', { class: 'row two' }, h('div', { class: 'grow' }, toggle(WEEKDAY_NAMES[w.weekday - 1] ?? '', w.isOn, (on) => { store.update(() => { w.isOn = on; }); redraw(); })),
      w.isOn ? h('span', { class: 'times' }, time(w.startMinutes, (m) => { w.startMinutes = m; }), time(w.endMinutes, (m) => { w.endMinutes = m; })) : null);
  }), 'Os dias de trabalho aparecem na agenda.'));
  return { title: 'Dias de trabalho', el, back: true };
}

export { newId, confirmDialog };
