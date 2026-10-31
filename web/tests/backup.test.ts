import { describe, expect, it } from 'vitest';
import { BACKUP_STALE_DAYS, backupIsStale, decryptBackup, encryptBackup, isEncryptedBackup } from '../src/backup';

describe('backup', () => {
  it('cifra e decifra com a mesma senha', async () => {
    const text = await encryptBackup('{"salario":200000,"nota":"ação"}', 'senha forte');
    expect(text).not.toContain('salario');
    const parsed: unknown = JSON.parse(text);
    expect(isEncryptedBackup(parsed)).toBe(true);
    if (isEncryptedBackup(parsed)) expect(await decryptBackup(parsed, 'senha forte')).toBe('{"salario":200000,"nota":"ação"}');
  });

  it('senha errada não abre', async () => {
    const parsed: unknown = JSON.parse(await encryptBackup('{}', 'certa'));
    if (!isEncryptedBackup(parsed)) throw new Error('envelope');
    expect(await decryptBackup(parsed, 'errada')).toBeNull();
  });

  it('um JSON comum não é backup cifrado', () => {
    expect(isEncryptedBackup({ version: 1, settings: {} })).toBe(false);
  });

  it('avisa quando o backup está velho ou nunca foi feito', () => {
    const now = 100 * 86_400_000;
    expect(backupIsStale(null, true, now)).toBe(true);
    expect(backupIsStale(null, false, now)).toBe(false);
    expect(backupIsStale(now - (BACKUP_STALE_DAYS + 1) * 86_400_000, true, now)).toBe(true);
    expect(backupIsStale(now - 86_400_000, true, now)).toBe(false);
  });
});
