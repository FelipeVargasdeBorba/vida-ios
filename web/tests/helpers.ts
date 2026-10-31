import { dayFromYMD } from '../src/domain/dates';
import type { PaySchedule } from '../src/domain/payPeriod';

export const d = dayFromYMD;
export const monthly = (dayOfMonth: number): PaySchedule => ({ frequency: 'monthly', dayOfMonth, weekday: 5 });
export const weekly = (weekday: number): PaySchedule => ({ frequency: 'weekly', dayOfMonth: 1, weekday });
