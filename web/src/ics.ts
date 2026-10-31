import { WEEKDAY_SHORT } from './domain/agenda';
import { type Day, ymd } from './domain/dates';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const stampOf = (day: Day, minutes: number) => {
  const { y, m, d } = ymd(day);
  return `${pad(y, 4)}${pad(m)}${pad(d)}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
};
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  start: Day;
  startMinutes: number;
  durationMinutes: number;
  rrule?: string;
  /** Minutos antes do início para o aviso. */
  alarmBefore: number;
}

export function icsCalendar(events: IcsEvent[]): string {
  const now = new Date();
  const dtstamp = `${pad(now.getUTCFullYear(), 4)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vida//PT', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@vida`, `DTSTAMP:${dtstamp}`, `DTSTART:${stampOf(e.start, e.startMinutes)}`,
      `DURATION:PT${Math.max(1, e.durationMinutes)}M`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, `TRIGGER:-PT${Math.max(0, e.alarmBefore)}M`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** Conta mensal: todo mês no dia do vencimento (dias 29–31 caem no último dia do mês). */
export function billRrule(dueDay: number): string {
  return `FREQ=MONTHLY;BYMONTHDAY=${dueDay >= 29 ? -1 : dueDay}`;
}

export function weeklyRrule(mask: number, until?: Day): string {
  const days = BYDAY.filter((_, i) => mask & (1 << i)).join(',');
  const end = until === undefined ? '' : `;UNTIL=${stampOf(until, 23 * 60 + 59)}`;
  return `FREQ=WEEKLY;BYDAY=${days || BYDAY.join(',')}${end}`;
}

export const weekdayLabel = (i: number) => WEEKDAY_SHORT[i] ?? '';
