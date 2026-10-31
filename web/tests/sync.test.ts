import { describe, expect, it } from 'vitest';
import { deriveKey, open, seal } from '../src/sync';
import { decideSync } from '../src/syncPlan';

const base = { hasRemote: true, remoteStamp: 'B', knownStamp: 'A', pending: false, localHasData: true };

describe('decideSync', () => {
  it('sem nuvem, envia o que existe', () => {
    expect(decideSync({ ...base, hasRemote: false, remoteStamp: null, knownStamp: null })).toBe('push');
    expect(decideSync({ ...base, hasRemote: false, remoteStamp: null, knownStamp: null, localHasData: false })).toBe('nothing');
  });
  it('nuvem igual: só envia se houver mudança local', () => {
    expect(decideSync({ ...base, remoteStamp: 'A' })).toBe('nothing');
    expect(decideSync({ ...base, remoteStamp: 'A', pending: true })).toBe('push');
  });
  it('nuvem mudou e nada pendente: baixa', () => {
    expect(decideSync(base)).toBe('pull');
  });
  it('aparelho novo e vazio: baixa', () => {
    expect(decideSync({ ...base, knownStamp: null, localHasData: false })).toBe('pull');
  });
  it('aparelho novo com dados próprios: pergunta', () => {
    expect(decideSync({ ...base, knownStamp: null })).toBe('conflict');
  });
  it('mudou nos dois lados: pergunta', () => {
    expect(decideSync({ ...base, pending: true })).toBe('conflict');
  });
});

describe('cifra do cofre', () => {
  it('a mesma senha e sal abrem; outra senha não', async () => {
    const salt = new Uint8Array(16).fill(7);
    const key = await deriveKey('senha-1234', salt);
    const sealed = await seal('{"x":1}', key);
    expect(sealed).not.toContain('"x"');
    expect(await open(sealed, key)).toBe('{"x":1}');
    expect(await open(sealed, await deriveKey('outra-senha', salt))).toBeNull();
  });
});
