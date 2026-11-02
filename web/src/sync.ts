import { SUPABASE_ANON_KEY, SUPABASE_URL, syncConfigured } from './config';
import { hasData } from './actions';
import { type SyncAction, decideSync } from './syncPlan';
import { store } from './store';

const KEY = 'vida.sync.v1';
const PUSH_DELAY = 1500;
const ITERATIONS = 600_000;

interface Session { access: string; refresh: string; expiresAt: number; userId: string; email: string }
interface Meta { session: Session | null; key: string | null; salt: string | null; knownStamp: string | null; pending: boolean; lastSyncAt: number | null }
interface Row { data: string; salt: string; updated_at: string }

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export class SyncError extends Error {}

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function loadMeta(): Meta {
  const empty: Meta = { session: null, key: null, salt: null, knownStamp: null, pending: false, lastSyncAt: null };
  try { return { ...empty, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Meta>) }; } catch { return empty; }
}

// ── Cifra: a chave nasce da senha e nunca sai do aparelho ────────────────────

export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, 256)));
}

const aes = (rawKey: string) => crypto.subtle.importKey('raw', unb64(rawKey), 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function seal(json: string, rawKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(rawKey), new TextEncoder().encode(json)));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}

export async function open(sealed: string, rawKey: string): Promise<string | null> {
  try {
    const { iv, ct } = JSON.parse(sealed) as { iv: string; ct: string };
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aes(rawKey), unb64(ct)));
  } catch { return null; }
}

// ── Serviço ──────────────────────────────────────────────────────────────────

class Sync {
  private meta = loadMeta();
  private listeners = new Set<() => void>();
  private timer: number | undefined;
  private applying = false;
  private busy = false;
  status: SyncStatus = syncConfigured && this.meta.session ? 'idle' : 'off';
  message = '';
  /** Chamado quando há conflito: devolve true para usar a nuvem, false para manter este aparelho, null para decidir depois. */
  onConflict: (() => Promise<boolean | null>) | null = null;

  get email(): string | null { return this.meta.session?.email ?? null; }
  get signedIn(): boolean { return this.meta.session !== null && this.meta.key !== null; }
  get lastSyncAt(): number | null { return this.meta.lastSyncAt; }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  private emit(status: SyncStatus, message = ''): void { this.status = status; this.message = message; this.listeners.forEach((f) => f()); }
  private save(): void { try { localStorage.setItem(KEY, JSON.stringify(this.meta)); } catch { /* sem espaço: tenta de novo na próxima */ } }

  /** Liga o serviço ao store e sincroniza. Chamar uma vez ao abrir o app. */
  start(): void {
    if (!syncConfigured) return;
    store.subscribe(() => {
      if (this.applying || !this.signedIn) return;
      this.meta.pending = true;
      this.save();
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.sync(), PUSH_DELAY);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.sync();
      else if (this.meta.pending) void this.sync();
    });
    window.addEventListener('online', () => void this.sync());
    void this.sync();
  }

  async signUp(email: string, password: string): Promise<'ready' | 'confirm'> {
    const res = await this.auth('signup', { email, password });
    if (!res.access_token) return 'confirm';
    await this.begin(res, password);
    return 'ready';
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.begin(await this.auth('token?grant_type=password', { email, password }), password);
  }

  signOut(): void {
    window.clearTimeout(this.timer);
    this.meta = { session: null, key: null, salt: null, knownStamp: null, pending: false, lastSyncAt: null };
    this.save();
    this.emit('off');
  }

  private async begin(res: AuthResponse, password: string): Promise<void> {
    this.meta.session = toSession(res);
    // O sal fica no cofre; um aparelho novo o lê antes de derivar a chave.
    const remote = await this.pull();
    const salt = remote ? unb64(remote.salt) : crypto.getRandomValues(new Uint8Array(16));
    this.meta.salt = b64(salt);
    this.meta.key = await deriveKey(password, salt);
    this.meta.knownStamp = null;
    this.meta.pending = hasData(store.state);
    this.save();
    this.emit('idle');
    await this.sync();
  }

  /** Reconcilia este aparelho com a nuvem. */
  async sync(): Promise<void> {
    if (!syncConfigured || !this.signedIn || this.busy) return;
    this.busy = true;
    window.clearTimeout(this.timer);
    this.emit('syncing');
    try {
      const remote = await this.pull();
      const action: SyncAction = decideSync({
        hasRemote: remote !== null, remoteStamp: remote?.updated_at ?? null, knownStamp: this.meta.knownStamp,
        pending: this.meta.pending, localHasData: hasData(store.state),
      });
      if (action === 'pull' && remote) await this.apply(remote);
      else if (action === 'push') await this.push(remote?.updated_at ?? null);
      else if (action === 'conflict' && remote) {
        const useCloud = await this.onConflict?.();
        if (useCloud === true) await this.apply(remote);
        else if (useCloud === false) await this.push(remote.updated_at);
      }
      this.meta.lastSyncAt = Date.now();
      this.save();
      this.emit('idle');
    } catch (e) {
      if (e instanceof SyncError) this.emit('error', e.message);
      else this.emit('offline', 'No connection. It will try again when you are back online.');
    } finally {
      this.busy = false;
    }
  }

  private async apply(remote: Row): Promise<void> {
    const plain = await open(remote.data, this.meta.key ?? '');
    if (plain === null) throw new SyncError('Could not open the cloud data. The password may have been changed.');
    this.applying = true;
    try { store.replace(JSON.parse(plain)); } finally { this.applying = false; }
    this.meta.knownStamp = remote.updated_at;
    this.meta.pending = false;
  }

  private async push(expectedStamp: string | null): Promise<void> {
    const sealed = await seal(store.exportJson(), this.meta.key ?? '');
    const salt = this.meta.salt ?? '';
    const uid = this.meta.session?.userId ?? '';
    const rows = expectedStamp === null
      ? await this.rest<Row[]>('POST', '', { user_id: uid, data: sealed, salt })
      : await this.rest<Row[]>('PATCH', `?user_id=eq.${uid}&updated_at=eq.${encodeURIComponent(expectedStamp)}`, { data: sealed });
    const row = rows[0];
    if (!row) throw new SyncError('The data changed on another device. Reopen the app to merge.');
    this.meta.knownStamp = row.updated_at;
    this.meta.pending = false;
  }

  private async pull(): Promise<Row | null> {
    const rows = await this.rest<Row[]>('GET', '?select=data,salt,updated_at&limit=1');
    return rows[0] ?? null;
  }

  // ── HTTP ───────────────────────────────────────────────────────────────────

  private async auth(path: string, body: unknown): Promise<AuthResponse> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as AuthResponse;
    if (!res.ok) throw new SyncError(friendly(json.error_description ?? json.msg ?? json.message ?? ''));
    return json;
  }

  private async token(): Promise<string> {
    const s = this.meta.session;
    if (!s) throw new SyncError('Sign in to your account.');
    if (Date.now() < s.expiresAt - 60_000) return s.access;
    const res = await this.auth('token?grant_type=refresh_token', { refresh_token: s.refresh });
    this.meta.session = toSession(res, s.email);
    this.save();
    return this.meta.session.access;
  }

  private async rest<T>(method: 'GET' | 'POST' | 'PATCH', query: string, body?: unknown): Promise<T> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vault${query}`, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json', prefer: 'return=representation' },
    });
    if (res.status === 409) throw new SyncError('The data changed on another device. Reopen the app to merge.');
    if (!res.ok) throw new SyncError(`The server refused the request (${res.status}).`);
    return (await res.json()) as T;
  }
}

interface AuthResponse { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string; email?: string }; error_description?: string; msg?: string; message?: string }

function toSession(r: AuthResponse, email = ''): Session {
  if (!r.access_token || !r.refresh_token || !r.user) throw new SyncError('Unexpected response from the server.');
  return { access: r.access_token, refresh: r.refresh_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000, userId: r.user.id, email: r.user.email ?? email };
}

function friendly(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes('invalid login')) return 'Wrong email or password.';
  if (t.includes('already registered')) return 'This email already has an account. Use Sign in.';
  if (t.includes('password should be')) return 'Weak password: use at least 8 characters.';
  if (t.includes('rate limit')) return 'Too many attempts. Wait a moment.';
  if (t.includes('email not confirmed')) return 'Confirm your email using the link we sent.';
  return raw || 'Something went wrong. Try again.';
}

export const sync = new Sync();
export { syncConfigured };
