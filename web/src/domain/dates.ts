/** Dia do calendário como inteiro: dias desde 1970-01-01, contados em UTC. Sem fuso, sem horário de verão. */
export type Day = number;

const MS = 86_400_000;

export function dayFromYMD(y: number, m: number, d: number): Day {
  return Math.floor(Date.UTC(y, m - 1, d) / MS);
}

export function ymd(day: Day): { y: number; m: number; d: number } {
  const dt = new Date(day * MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** O "hoje" do aparelho, como dia. */
export function dayOf(date: Date = new Date()): Day {
  return dayFromYMD(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** ISO: 1 = segunda … 7 = domingo. */
export function isoWeekday(day: Day): number {
  return (((day + 3) % 7) + 7) % 7 + 1;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Soma `n` meses a (ano, mês). */
export function shiftMonth(y: number, m: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (((idx % 12) + 12) % 12) + 1 };
}

/** Meses completos entre duas datas (como `dateComponents([.month])` do Calendar). */
export function monthsBetween(from: Day, to: Day): number {
  const a = ymd(from);
  const b = ymd(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return months;
}

export function addDays(n: number, day: Day): Day {
  return day + n;
}
