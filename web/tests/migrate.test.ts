import { describe, expect, it } from 'vitest';
import { normalize } from '../src/store';
import { defaultState } from '../src/state';

describe('Lazer e Outro viraram uma só categoria', () => {
  it('dados antigos passam a usar só "outro"', () => {
    const old = JSON.parse(JSON.stringify(defaultState())) as Record<string, any>;
    old.settings.outroPoints = 5;
    old.settings.spendingAccount = ['alimentacao', 'transporte', 'lazer', 'outro'];
    old.settings.flexibleOrder = ['lazer', 'outro', 'transporte', 'alimentacao'];
    old.fixed = [{ id: 'f', name: 'Cinema', category: 'lazer', monthly: 1000, dueDay: 0, remindOn: false }];
    old.transactions = [{ id: 't', kind: 'expense', source: 'other', amount: 500, day: 1, category: 'lazer', note: '' }];
    old.snapshots = [{
      ...defaultState(), id: 's', lines: [
        { category: 'lazer', target: 5000, fixed: 100, spent: 700, adjusted: 5000 },
        { category: 'outro', target: 1000, fixed: 0, spent: 200, adjusted: 0 },
        { category: 'casa', target: 100, fixed: 0, spent: 0, adjusted: null },
      ],
    }];
    const s = normalize(old);
    expect(s.settings.spendingAccount).toEqual(['alimentacao', 'transporte', 'outro']);
    expect(s.settings.flexibleOrder).toEqual(['outro', 'transporte', 'alimentacao']);
    expect('outroPoints' in s.settings).toBe(false);
    expect(s.fixed[0]?.category).toBe('outro');
    expect(s.transactions[0]?.category).toBe('outro');
    expect(s.snapshots[0]?.lines).toEqual([
      { category: 'outro', target: 6000, fixed: 100, spent: 900, adjusted: 5000 },
      { category: 'casa', target: 100, fixed: 0, spent: 0, adjusted: null },
    ]);
  });
});
