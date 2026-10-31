import { type Day, isoWeekday } from './dates';

export type AgendaKind = 'obligation' | 'reminder';

/** Regra de ocorrência de um item da agenda. */
export interface AgendaRule {
  kind: AgendaKind;
  /** Bit 0 = segunda … bit 6 = domingo. */
  weekdaysMask: number;
  isOneTime: boolean;
  oneTimeDay: Day;
  hasDateRange: boolean;
  rangeStart: Day;
  rangeEnd: Day;
}

export function occursOn(rule: AgendaRule, day: Day): boolean {
  if (rule.isOneTime && rule.kind === 'reminder') return day === rule.oneTimeDay;
  if ((rule.weekdaysMask & (1 << (isoWeekday(day) - 1))) === 0) return false;
  if (rule.hasDateRange && (day < rule.rangeStart || day > rule.rangeEnd)) return false;
  return true;
}

export function timeText(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
