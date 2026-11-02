import { CATEGORY_TITLE, type Category, CUTTABLE, PRESETS, SPENDING, type PresetId, presetSummary, presetById } from '../domain/budget';
import { CURRENCIES, type Currency } from '../domain/money';
import { type PayFrequency } from '../domain/payPeriod';
import { WEEKDAY_NAMES, timeText } from '../domain/agenda';
import { defaultState } from '../state';
import { requestPersistence, store } from '../store';
import { button, confirmDialog, download, moneyInput, openSheet, section, segmented, select, toast, toggle, labelled, valueRow } from './components';
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../backup';
import { fmtStamp } from './format';
import { sync, syncConfigured } from '../sync';
import { h } from './dom';
import { type Ctx, type View } from './view';

const redraw = () => window.dispatchEvent(new Event('vida:rerender'));

export function setupView(_ctx: Ctx): View {
  const s = store.state.settings;
  const set = (fn: (st: typeof s) => void) => { store.update((state) => fn(state.settings)); redraw(); };
  const el = h('div', { class: 'page' });

  el.append(section('Income', [
    labelled('Currency', select(CURRENCIES.map((c) => ({ value: c.code, label: c.title })), s.currency, (v) => set((x) => { x.currency = v as Currency; }))),
    h('div', { class: 'row' }, segmented<PayFrequency>([{ value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }], s.frequency, (v) => set((x) => { x.frequency = v; }))),
    s.frequency === 'monthly'
      ? labelled('Payday', select(Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), s.payDayOfMonth, (v) => set((x) => { x.payDayOfMonth = v; })))
      : labelled('Weekday', select(WEEKDAY_NAMES.map((n, i) => ({ value: i + 1, label: n })), s.payWeekday, (v) => set((x) => { x.payWeekday = v; }))),
  ], 'The income for a period is the sum of the entries marked as Salary.'));

  el.append(section('Plan', PRESETS.map((p) => h('button', { type: 'button', class: 'row two', onclick: async () => {
    if (p.id === s.preset) return;
    if (await confirmDialog(`Switch the plan to ${p.title}?`, presetSummary(p), 'Switch plan')) set((x) => { x.preset = p.id as PresetId; });
  } }, h('span', { class: 'grow left' }, h('span', { class: 'row-title block' }, p.title), h('span', { class: 'caption block' }, presetSummary(p))),
    h('span', { class: 'check-mark' }, p.id === s.preset ? '✓' : ''))),
  `Current: ${presetById(s.preset).title}. The plan only changes with your confirmation.`));

  el.append(section('Stays in the spending account', SPENDING.map((c: Category) =>
    toggle(CATEGORY_TITLE[c], s.spendingAccount.includes(c), (on) => set((x) => { x.spendingAccount = on ? [...new Set([...x.spendingAccount, c])] : x.spendingAccount.filter((k) => k !== c); }))),
  'The rest goes to saves. Goals have their own account.'));

  el.append(section('Adapt plan', [
    toggle('Cut flexible categories to hit the goal', s.adaptEnabled, (on) => set((x) => { x.adaptEnabled = on; })),
    s.adaptEnabled ? h('div', { class: 'row two' }, h('span', { class: 'grow row-title' }, 'Minimum for Food'), moneyInput(s.foodMinimum, (c) => set((x) => { x.foodMinimum = c; }))) : null,
    ...(s.adaptEnabled ? s.flexibleOrder.filter((c) => CUTTABLE.includes(c)).map((c, i, all) => h('div', { class: 'row two' },
      h('span', { class: 'grow row-title' }, `${i + 1}. ${CATEGORY_TITLE[c]}`),
      h('span', { class: 'reorder' },
        h('button', { type: 'button', disabled: i === 0, 'aria-label': 'Move up', onclick: () => swap(i, -1) }, '▲'),
        h('button', { type: 'button', disabled: i === all.length - 1, 'aria-label': 'Move down', onclick: () => swap(i, 1) }, '▼')))) : []),
  ], s.adaptEnabled ? 'Cuts from top to bottom. Home, fixed expenses and the goal floor are never cut.' : undefined));

  el.append(section('Reminders', [
    labelled('Calendar time', h('input', { type: 'time', class: 'field', value: timeText(s.reminderMinutes), onchange: (e: Event) => {
      const v = (e.target as HTMLInputElement).value.split(':');
      const mins = Number(v[0]) * 60 + Number(v[1]);
      if (Number.isFinite(mins)) set((x) => { x.reminderMinutes = mins; });
    } })),
  ], 'iPhone does not let websites schedule notifications, so bills and agenda items become Calendar events (the "Calendar" button), with an alert.'));
  return { title: 'Settings', el, back: true };

  function swap(i: number, by: number): void {
    const cut = s.flexibleOrder.filter((c) => CUTTABLE.includes(c));
    const [item] = cut.splice(i, 1);
    if (!item) return;
    cut.splice(i + by, 0, item);
    set((x) => { x.flexibleOrder = [...cut, ...x.flexibleOrder.filter((c) => !CUTTABLE.includes(c))]; });
  }
}

function askPassword(title: string, confirm: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const pass = h('input', { type: 'password', class: 'field', placeholder: 'Password', autocomplete: confirm ? 'new-password' : 'current-password' });
    const again = h('input', { type: 'password', class: 'field', placeholder: 'Repeat the password', autocomplete: 'new-password' });
    let answer: string | null = null;
    openSheet(title, () => h('div', { class: 'form' }, h('div', { class: 'card' }, h('div', { class: 'row' }, pass), confirm ? h('div', { class: 'row' }, again) : null),
      confirm ? h('p', { class: 'group-footer' }, 'Without the password the backup cannot be opened, and it cannot be recovered. Write it down somewhere safe.') : null), {
      saveLabel: 'Continue',
      onSave: () => {
        if (pass.value.length < 6) { toast('Use at least 6 characters'); return false; }
        if (confirm && pass.value !== again.value) { toast('The passwords do not match'); return false; }
        answer = pass.value;
      },
    });
    document.addEventListener('close', () => resolve(answer), { capture: true, once: true });
  });
}

async function exportEncrypted(): Promise<void> {
  const password = await askPassword('Backup password', true);
  if (!password) return;
  const text = await encryptBackup(store.exportJson(), password);
  const name = `vida-backup-${new Date().toISOString().slice(0, 10)}.vida`;
  const file = new File([text], name, { type: 'application/octet-stream' });
  let saved = false;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Vida backup' }); saved = true; } catch { /* cancelled */ }
  } else {
    download(name, text, 'application/octet-stream');
    saved = true;
  }
  if (saved) {
    store.update((s) => { s.settings.lastBackupAt = Date.now(); });
    toast('Backup created. Keep it in iCloud Drive.');
  }
}

export function backupView(): View {
  const s = store.state.settings;
  const el = h('div', { class: 'page' });
  const status = h('span', { class: 'num' }, '…');
  void (async () => {
    let persisted = false;
    try { persisted = (await navigator.storage?.persisted?.()) ?? false; } catch { /* unsupported */ }
    if (!persisted) persisted = await requestPersistence();
    status.textContent = persisted ? 'protected' : 'browser default';
  })();
  const file = h('input', { type: 'file', accept: '.vida,.json,application/json,application/octet-stream', class: 'hidden', onchange: async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      let parsed: unknown = JSON.parse(await f.text());
      if (isEncryptedBackup(parsed)) {
        const password = await askPassword('Backup password', false);
        if (!password) return;
        const plain = await decryptBackup(parsed, password);
        if (plain === null) { toast('Wrong password or damaged file'); return; }
        parsed = JSON.parse(plain);
      }
      if (await confirmDialog('Replace the current data?', 'Everything on this device will be replaced by the contents of the file.', 'Restore', true)) {
        store.replace(parsed);
        toast('Data restored');
      }
    } catch { toast('Invalid file'); }
  } });
  const last = s.lastBackupAt === null ? 'never' : fmtStamp(s.lastBackupAt);
  el.append(
    section(null, [
      h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, 'Last backup'), h('span', { class: `num ${s.lastBackupAt === null ? 'bad' : ''}` }, last)),
      h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, 'Protection on this device'), status),
    ], 'Your data lives on this device. If you lose the phone, only a backup saves everything.'),
    section(null, [
      h('div', { class: 'row' }, button('Create protected backup', () => void exportEncrypted(), 'primary')),
      h('div', { class: 'row' }, button('Restore from a backup', () => file.click())),
      file,
    ], 'In the menu that opens, choose "Save to Files" and then iCloud Drive. The file is encrypted with your password (AES-256). To switch phones, install the app and restore.'),
    section(null, [h('div', { class: 'row' }, button('Delete all data', async () => {
      if (await confirmDialog('Delete everything?', 'This cannot be undone. Create a backup first.', 'Delete everything', true)) { store.replace(defaultState()); toast('Data deleted'); }
    }, 'danger'))]),
  );
  return { title: 'Backup', el, back: true };
}

// ── Account and sync ────────────────────────────────────────────────────

const STATUS_TEXT: Record<string, string> = { off: 'off', idle: 'up to date', syncing: 'syncing…', offline: 'offline', error: 'problem' };

export function accountView(): View {
  const el = h('div', { class: 'page' });
  const rerender = () => window.dispatchEvent(new Event('vida:rerender'));
  if (!syncConfigured) {
    el.append(section(null, [h('div', { class: 'row muted' }, 'Sync has not been set up in this app yet. Meanwhile, use the protected backup.')]),
      section(null, [h('a', { class: 'row link-row', href: '#/finance/backup' }, h('span', { class: 'grow row-title' }, 'Protected backup'), h('span', { class: 'chev' }, '›'))]));
    return { title: 'Account', el, back: true };
  }
  if (sync.signedIn) {
    el.append(
      section(null, [
        h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, 'Account'), h('span', { class: 'num' }, sync.email ?? '')),
        h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, 'Sync'), h('span', { class: `num ${sync.status === 'error' ? 'bad' : ''}` }, STATUS_TEXT[sync.status] ?? '')),
        h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, 'Last synced'), h('span', { class: 'num' }, sync.lastSyncAt === null ? 'never' : fmtStamp(sync.lastSyncAt))),
        sync.message ? h('p', { class: 'row caption bad' }, sync.message) : null,
      ], 'Every change is encrypted on this device and sent automatically. On another phone, sign in with the same email and password.'),
      section(null, [
        h('div', { class: 'row' }, button('Sync now', () => void sync.sync().then(rerender), 'primary')),
        h('div', { class: 'row' }, button('Sign out', async () => {
          if (await confirmDialog('Sign out?', 'The data stays on this device but stops being sent.', 'Sign out')) { sync.signOut(); rerender(); }
        })),
      ], 'If you forget the password, the cloud data cannot be recovered, because only it opens the vault. That is why the protected backup remains available under Backup.'),
    );
    return { title: 'Account', el, back: true };
  }
  const email = h('input', { type: 'email', class: 'field wide', placeholder: 'Email', autocomplete: 'email', autocapitalize: 'none' });
  const pass = h('input', { type: 'password', class: 'field wide', placeholder: 'Password (8+ characters)', autocomplete: 'current-password' });
  const run = async (create: boolean) => {
    if (!email.value.includes('@') || pass.value.length < 8) { toast('Enter your email and a password with 8+ characters'); return; }
    try {
      if (create) {
        if (await sync.signUp(email.value.trim(), pass.value) === 'confirm') { toast('Account created. Confirm your email, then tap Sign in.'); return; }
      } else await sync.signIn(email.value.trim(), pass.value);
      toast('Account connected');
    } catch (e) { toast(e instanceof Error ? e.message : 'Something went wrong'); }
    rerender();
  };
  el.append(
    section(null, [h('div', { class: 'row' }, email), h('div', { class: 'row' }, pass)], 'Your data is encrypted with your password before it leaves the phone. Not even the server can read it.'),
    section(null, [
      h('div', { class: 'row' }, button('Sign in', () => void run(false), 'primary')),
      h('div', { class: 'row' }, button('Create account', () => void run(true))),
    ], 'If you sign in on a device that has data while the account already has cloud data, the app asks which one to keep.'),
  );
  return { title: 'Account', el, back: true };
}
