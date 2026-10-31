import { describe, expect, it } from 'vitest';
import { type AgendaRule, occursOn, timeText } from '../src/domain/agenda';
import { d } from './helpers';

const rule = (o: Partial<AgendaRule> = {}): AgendaRule => ({
  kind: 'obligation', weekdaysMask: 0, isOneTime: false, oneTimeDay: 0, hasDateRange: false, rangeStart: 0, rangeEnd: 0, ...o,
});

describe('agenda', () => {
  it('máscara de dias da semana', () => {
    const r = rule({ weekdaysMask: 0b0000101 }); // segunda e quarta
    expect(occursOn(r, d(2026, 10, 26))).toBe(true);
    expect(occursOn(r, d(2026, 10, 27))).toBe(false);
    expect(occursOn(r, d(2026, 10, 28))).toBe(true);
    expect(occursOn(r, d(2026, 11, 1))).toBe(false);
  });

  it('bit do domingo', () => {
    const r = rule({ weekdaysMask: 1 << 6 });
    expect(occursOn(r, d(2026, 11, 1))).toBe(true);
    expect(occursOn(r, d(2026, 10, 31))).toBe(false);
  });

  it('máscara vazia nunca ocorre', () => {
    expect(occursOn(rule(), d(2026, 10, 26))).toBe(false);
  });

  it('intervalo de datas é inclusivo', () => {
    const r = rule({ weekdaysMask: 0b0000101, hasDateRange: true, rangeStart: d(2026, 10, 28), rangeEnd: d(2026, 11, 4) });
    expect(occursOn(r, d(2026, 10, 26))).toBe(false);
    expect(occursOn(r, d(2026, 10, 28))).toBe(true);
    expect(occursOn(r, d(2026, 11, 2))).toBe(true);
    expect(occursOn(r, d(2026, 11, 4))).toBe(true); // quarta, dentro do intervalo
    expect(occursOn(r, d(2026, 11, 9))).toBe(false); // segunda, depois do intervalo
  });

  it('lembrete único ignora a máscara', () => {
    const r = rule({ kind: 'reminder', weekdaysMask: 0b1111111, isOneTime: true, oneTimeDay: d(2026, 10, 30) });
    expect(occursOn(r, d(2026, 10, 30))).toBe(true);
    expect(occursOn(r, d(2026, 10, 29))).toBe(false);
    expect(occursOn(r, d(2026, 10, 31))).toBe(false);
  });

  it('obrigação nunca é única', () => {
    const r = rule({ weekdaysMask: 1 << 4, isOneTime: true, oneTimeDay: d(2026, 10, 27) });
    expect(occursOn(r, d(2026, 10, 30))).toBe(true);
    expect(occursOn(r, d(2026, 10, 27))).toBe(false);
  });

  it('formata horas', () => {
    expect(timeText(540)).toBe('09:00');
    expect(timeText(1_439)).toBe('23:59');
    expect(timeText(-60)).toBe('23:00');
  });
});
