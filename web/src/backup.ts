/** Backup criptografado: o arquivo só abre com a senha escolhida, então pode ir para o iCloud Drive com segurança. */

const ITERATIONS = 600_000;

interface Envelope {
  app: 'vida';
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
};
const unb64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function keyFor(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(json: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt, ITERATIONS);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)));
  const envelope: Envelope = { app: 'vida', v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) };
  return JSON.stringify(envelope);
}

export function isEncryptedBackup(parsed: unknown): parsed is Envelope {
  return !!parsed && typeof parsed === 'object' && (parsed as Envelope).app === 'vida' && typeof (parsed as Envelope).data === 'string';
}

/** Devolve o JSON original, ou `null` se a senha estiver errada ou o arquivo estiver corrompido. */
export async function decryptBackup(envelope: Envelope, password: string): Promise<string | null> {
  try {
    const key = await keyFor(password, unb64(envelope.salt), envelope.iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv) }, key, unb64(envelope.data));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export const BACKUP_STALE_DAYS = 7;

/** Há dados e o último backup é antigo (ou nunca foi feito). */
export function backupIsStale(lastBackupAt: number | null, hasData: boolean, now: number): boolean {
  if (!hasData) return false;
  return lastBackupAt === null || now - lastBackupAt > BACKUP_STALE_DAYS * 86_400_000;
}
