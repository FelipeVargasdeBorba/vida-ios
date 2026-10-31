import { CATEGORY_TITLE, type Category, CUTTABLE, PRESETS, SPENDING, type PresetId, presetSummary, presetById } from '../domain/budget';
import { CURRENCIES, type Currency } from '../domain/money';
import { type PayFrequency } from '../domain/payPeriod';
import { WEEKDAY_NAMES, timeText } from '../domain/agenda';
import { defaultState } from '../state';
import { requestPersistence, store } from '../store';
import { button, confirmDialog, download, moneyInput, openSheet, section, segmented, select, toast, toggle, labelled, valueRow } from './components';
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../backup';
import { fmtStamp } from './format';
import { h } from './dom';
import { type Ctx, type View } from './view';

const redraw = () => window.dispatchEvent(new Event('vida:rerender'));

export function setupView(_ctx: Ctx): View {
  const s = store.state.settings;
  const set = (fn: (st: typeof s) => void) => { store.update((state) => fn(state.settings)); redraw(); };
  const el = h('div', { class: 'page' });

  el.append(section('Renda', [
    labelled('Moeda', select(CURRENCIES.map((c) => ({ value: c.code, label: c.title })), s.currency, (v) => set((x) => { x.currency = v as Currency; }))),
    h('div', { class: 'row' }, segmented<PayFrequency>([{ value: 'monthly', label: 'Mensal' }, { value: 'weekly', label: 'Semanal' }], s.frequency, (v) => set((x) => { x.frequency = v; }))),
    s.frequency === 'monthly'
      ? labelled('Dia do pagamento', select(Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), s.payDayOfMonth, (v) => set((x) => { x.payDayOfMonth = v; })))
      : labelled('Dia da semana', select(WEEKDAY_NAMES.map((n, i) => ({ value: i + 1, label: n })), s.payWeekday, (v) => set((x) => { x.payWeekday = v; }))),
  ], 'A renda do período é a soma das entradas marcadas como Salário.'));

  el.append(section('Plano', PRESETS.map((p) => h('button', { type: 'button', class: 'row two', onclick: async () => {
    if (p.id === s.preset) return;
    if (await confirmDialog(`Trocar o plano para ${p.title}?`, presetSummary(p), 'Trocar plano')) set((x) => { x.preset = p.id as PresetId; });
  } }, h('span', { class: 'grow left' }, h('span', { class: 'row-title block' }, p.title), h('span', { class: 'caption block' }, presetSummary(p))),
    h('span', { class: 'check-mark' }, p.id === s.preset ? '✓' : ''))),
  `Atual: ${presetById(s.preset).title}. O plano só muda com a sua confirmação.`));

  el.append(section('Outro', [labelled('Pontos tirados do Lazer', select(Array.from({ length: 11 }, (_, i) => ({ value: i, label: `${i}%` })), s.outroPoints, (v) => set((x) => { x.outroPoints = v; })))]));

  el.append(section('Fica na conta de gastos', SPENDING.map((c: Category) =>
    toggle(CATEGORY_TITLE[c], s.spendingAccount.includes(c), (on) => set((x) => { x.spendingAccount = on ? [...new Set([...x.spendingAccount, c])] : x.spendingAccount.filter((k) => k !== c); }))),
  'O resto vai para saves. As metas têm conta própria.'));

  el.append(section('Adaptar plano', [
    toggle('Cortar flexíveis para bater a meta', s.adaptEnabled, (on) => set((x) => { x.adaptEnabled = on; })),
    s.adaptEnabled ? h('div', { class: 'row two' }, h('span', { class: 'grow row-title' }, 'Mínimo de Alimentação'), moneyInput(s.foodMinimum, (c) => set((x) => { x.foodMinimum = c; }))) : null,
    ...(s.adaptEnabled ? s.flexibleOrder.filter((c) => CUTTABLE.includes(c)).map((c, i, all) => h('div', { class: 'row two' },
      h('span', { class: 'grow row-title' }, `${i + 1}. ${CATEGORY_TITLE[c]}`),
      h('span', { class: 'reorder' },
        h('button', { type: 'button', disabled: i === 0, 'aria-label': 'Subir', onclick: () => swap(i, -1) }, '▲'),
        h('button', { type: 'button', disabled: i === all.length - 1, 'aria-label': 'Descer', onclick: () => swap(i, 1) }, '▼')))) : []),
  ], s.adaptEnabled ? 'Corta de cima para baixo. Casa, fixos e o piso das metas nunca são cortados.' : undefined));

  el.append(section('Lembretes', [
    labelled('Hora no calendário', h('input', { type: 'time', class: 'field', value: timeText(s.reminderMinutes), onchange: (e: Event) => {
      const v = (e.target as HTMLInputElement).value.split(':');
      const mins = Number(v[0]) * 60 + Number(v[1]);
      if (Number.isFinite(mins)) set((x) => { x.reminderMinutes = mins; });
    } })),
  ], 'O iPhone não deixa sites agendarem notificações. Por isso, contas e agenda viram eventos do Calendário (botão "Calendário"), com alerta.'));
  return { title: 'Configurações', el, back: true };

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
    const pass = h('input', { type: 'password', class: 'field', placeholder: 'Senha', autocomplete: confirm ? 'new-password' : 'current-password' });
    const again = h('input', { type: 'password', class: 'field', placeholder: 'Repita a senha', autocomplete: 'new-password' });
    let answer: string | null = null;
    openSheet(title, () => h('div', { class: 'form' }, h('div', { class: 'card' }, h('div', { class: 'row' }, pass), confirm ? h('div', { class: 'row' }, again) : null),
      confirm ? h('p', { class: 'group-footer' }, 'Sem a senha o backup não abre, e eu não consigo recuperá-la. Anote em um lugar seguro.') : null), {
      saveLabel: 'Continuar',
      onSave: () => {
        if (pass.value.length < 6) { toast('Use ao menos 6 caracteres'); return false; }
        if (confirm && pass.value !== again.value) { toast('As senhas não são iguais'); return false; }
        answer = pass.value;
      },
    });
    document.addEventListener('close', () => resolve(answer), { capture: true, once: true });
  });
}

async function exportEncrypted(): Promise<void> {
  const password = await askPassword('Senha do backup', true);
  if (!password) return;
  const text = await encryptBackup(store.exportJson(), password);
  const name = `vida-backup-${new Date().toISOString().slice(0, 10)}.vida`;
  const file = new File([text], name, { type: 'application/octet-stream' });
  let saved = false;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Backup do Vida' }); saved = true; } catch { /* cancelado */ }
  } else {
    download(name, text, 'application/octet-stream');
    saved = true;
  }
  if (saved) {
    store.update((s) => { s.settings.lastBackupAt = Date.now(); });
    toast('Backup criado. Guarde no iCloud Drive.');
  }
}

export function backupView(): View {
  const s = store.state.settings;
  const el = h('div', { class: 'page' });
  const status = h('span', { class: 'num' }, '…');
  void (async () => {
    let persisted = false;
    try { persisted = (await navigator.storage?.persisted?.()) ?? false; } catch { /* sem suporte */ }
    if (!persisted) persisted = await requestPersistence();
    status.textContent = persisted ? 'protegido' : 'padrão do navegador';
  })();
  const file = h('input', { type: 'file', accept: '.vida,.json,application/json,application/octet-stream', class: 'hidden', onchange: async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      let parsed: unknown = JSON.parse(await f.text());
      if (isEncryptedBackup(parsed)) {
        const password = await askPassword('Senha do backup', false);
        if (!password) return;
        const plain = await decryptBackup(parsed, password);
        if (plain === null) { toast('Senha errada ou arquivo danificado'); return; }
        parsed = JSON.parse(plain);
      }
      if (await confirmDialog('Substituir os dados atuais?', 'Tudo que está neste aparelho será trocado pelo conteúdo do arquivo.', 'Restaurar', true)) {
        store.replace(parsed);
        toast('Dados restaurados');
      }
    } catch { toast('Arquivo inválido'); }
  } });
  const last = s.lastBackupAt === null ? 'nunca' : fmtStamp(s.lastBackupAt);
  el.append(
    section(null, [
      h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, 'Último backup'), h('span', { class: `num ${s.lastBackupAt === null ? 'bad' : ''}` }, last)),
      h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, 'Proteção no aparelho'), status),
    ], 'Os dados ficam neste aparelho. Se perder o celular, só o backup salva tudo.'),
    section(null, [
      h('div', { class: 'row' }, button('Criar backup protegido', () => void exportEncrypted(), 'primary')),
      h('div', { class: 'row' }, button('Restaurar de um backup', () => file.click())),
      file,
    ], 'No menu que abrir, escolha "Salvar em Arquivos" e depois iCloud Drive. O arquivo é cifrado com a sua senha (AES-256). Para trocar de celular, instale o app e restaure.'),
    section(null, [h('div', { class: 'row' }, button('Apagar todos os dados', async () => {
      if (await confirmDialog('Apagar tudo?', 'Isso não pode ser desfeito. Crie um backup antes.', 'Apagar tudo', true)) { store.replace(defaultState()); toast('Dados apagados'); }
    }, 'danger'))]),
  );
  return { title: 'Backup', el, back: true };
}
