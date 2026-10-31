import { type Day } from '../domain/dates';
import { formatMoney, locale, type Currency } from '../domain/money';
import type { PayPeriod } from '../domain/payPeriod';

const MS = 86_400_000;
const make = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o });
const short = make({ day: 'numeric', month: 'short' });
const full = make({ day: 'numeric', month: 'short', year: 'numeric' });
const long = make({ weekday: 'long', day: 'numeric', month: 'long' });
const stamp = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const at = (day: Day) => new Date(day * MS);
export const fmtShort = (day: Day) => short.format(at(day));
export const fmtFull = (day: Day) => full.format(at(day));
export const fmtLong = (day: Day) => long.format(at(day));
export const fmtStamp = (ms: number) => stamp.format(new Date(ms));
/** Período exibido com o último dia inclusive. */
export const fmtPeriod = (p: PayPeriod) => `${fmtShort(p.start)} – ${fmtShort(p.end - 1)}`;
export const money = (cents: number, cur: Currency) => formatMoney(cents, cur);

/** "AAAA-MM-DD" para o `<input type="date">`. */
export function toInputDate(day: Day): string {
  return new Date(day * MS).toISOString().slice(0, 10);
}

export function fromInputDate(text: string): Day | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS) : null;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
