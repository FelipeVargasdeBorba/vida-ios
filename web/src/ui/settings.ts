import { CATEGORY_TITLE, type Category, CUTTABLE, PRESETS, SPENDING, type PresetId, presetSummary, presetById } from '../domain/budget';
import { CURRENCIES, type Currency } from '../domain/money';
import { type PayFrequency } from '../domain/payPeriod';
import { WEEKDAY_NAMES, timeText } from '../domain/agenda';
import { defaultState } from '../state';
import { requestPersistence, store } from '../store';
import { button, confirmDialog, download, moneyInput, section, segmented, select, toast, toggle, labelled, valueRow } from './components';
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

export function backupView(): View {
  const el = h('div', { class: 'page' });
  const status = h('span', { class: 'num' }, '…');
  void (async () => {
    let persisted = false;
    try { persisted = (await navigator.storage?.persisted?.()) ?? false; } catch { /* sem suporte */ }
    if (!persisted) persisted = await requestPersistence();
    status.textContent = persisted ? 'protegido' : 'padrão do navegador';
  })();
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const data: unknown = JSON.parse(await f.text());
      if (await confirmDialog('Substituir os dados atuais?', 'Tudo que está neste aparelho será trocado pelo conteúdo do arquivo.', 'Importar', true)) {
        store.replace(data);
        toast('Dados importados');
      }
    } catch { toast('Arquivo inválido'); }
    file.value = '';
  } });
  el.append(
    section(null, [h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, 'Proteção dos dados'), status)],
      'Os dados ficam só neste aparelho. Instalado na Tela de Início, o iPhone não apaga os dados. Mesmo assim, exporte um backup de vez em quando.'),
    section(null, [
      h('div', { class: 'row' }, button('Exportar backup (.json)', () => { download(`vida-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson(), 'application/json'); }, 'primary')),
      h('div', { class: 'row' }, button('Importar backup', () => file.click())),
      file,
    ]),
    section(null, [h('div', { class: 'row' }, button('Apagar todos os dados', async () => {
      if (await confirmDialog('Apagar tudo?', 'Isso não pode ser desfeito. Exporte um backup antes.', 'Apagar tudo', true)) { store.replace(defaultState()); toast('Dados apagados'); }
    }, 'danger'))]),
  );
  return { title: 'Backup', el, back: true };
}
