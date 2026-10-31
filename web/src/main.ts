import './styles.css';
import { type Day, dayFromYMD } from './domain/dates';
import { requestPersistence, store } from './store';
import { adaptationView, dashboard, fixedView, goalDetailView, goalsView, historyDetailView, historyView, transactionsView } from './ui/finance';
import { agendaAllView, agendaView, workView } from './ui/agenda';
import { noteListView, notesView } from './ui/notes';
import { accountView, backupView, setupView } from './ui/settings';
import { clear, h } from './ui/dom';
import { confirmDialog, toast } from './ui/components';
import { sync } from './sync';
import { type Ctx, type View } from './ui/view';

const TABS = [
  { id: 'finance', label: 'Finanças', icon: '💶' },
  { id: 'agenda', label: 'Agenda', icon: '🗓️' },
  { id: 'notes', label: 'Notas', icon: '📝' },
] as const;

function localToday(): Day {
  const n = new Date();
  return dayFromYMD(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

function route(ctx: Ctx, tab: string): View {
  const [a, b] = ctx.path;
  if (tab === 'agenda') return a === 'all' ? agendaAllView(ctx) : a === 'work' ? workView() : agendaView(ctx);
  if (tab === 'notes') return a === 'list' ? noteListView(ctx) : notesView(ctx);
  switch (a) {
    case 'transactions': return transactionsView(ctx);
    case 'fixed': return fixedView(ctx);
    case 'goals': return goalsView(ctx);
    case 'goal': return goalDetailView(ctx);
    case 'history': return b ? historyDetailView({ ...ctx, path: [a, b] }) : historyView();
    case 'adaptation': return adaptationView(ctx);
    case 'setup': return setupView(ctx);
    case 'backup': return backupView();
    case 'account': return accountView();
    default: return dashboard(ctx);
  }
}

const root = document.getElementById('app') as HTMLElement;
let today = localToday();

function render(): void {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const tab = TABS.find((t) => t.id === parts[0])?.id ?? 'finance';
  const view = route({ today, path: parts.slice(1) }, tab);
  const scroller = document.querySelector('main');
  const keep = scroller?.scrollTop ?? 0;

  clear(root);
  const header = h('header', { class: 'bar-top' },
    view.back ? h('button', { type: 'button', class: 'text-btn back', 'aria-label': 'Voltar', onclick: () => history.back() }, '‹ Voltar') : h('span', { class: 'spacer' }),
    h('h1', null, view.title),
    h('span', { class: 'actions' }, view.actions ?? []));
  const nav = h('nav', { class: 'tabbar', 'aria-label': 'Abas' }, TABS.map((t) => h('a', {
    href: `#/${t.id}`, class: t.id === tab ? 'on' : '', 'aria-current': t.id === tab ? 'page' : undefined,
  }, h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, t.icon), h('span', null, t.label))));
  root.append(header, h('main', null, view.el), nav);
  const main = root.querySelector('main');
  if (main) main.scrollTop = scroller && location.hash === lastHash ? keep : 0;
  lastHash = location.hash;
  document.title = `${view.title} · Vida`;
}
let lastHash = '';

let queued = false;
const schedule = () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; if (!document.querySelector('dialog[open]')) render(); else pending = true; });
};
let pending = false;

store.subscribe(() => {
  if (store.saveError) toast('Não foi possível salvar. Exporte um backup em Finanças › Backup.');
  schedule();
});
window.addEventListener('vida:rerender', schedule);
window.addEventListener('hashchange', render);
document.addEventListener('close', () => { if (pending) { pending = false; render(); } }, true);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = localToday();
  if (t !== today) { today = t; render(); }
});

sync.subscribe(schedule);
sync.onConflict = async () => {
  if (await confirmDialog('Usar os dados da nuvem?', 'Este aparelho e a sua conta têm dados diferentes. Usar a nuvem substitui o que está aqui.', 'Usar a nuvem', true)) return true;
  if (await confirmDialog('Enviar os dados deste aparelho?', 'Isso substitui o que está salvo na sua conta.', 'Enviar deste aparelho', true)) return false;
  return null;
};

render();
sync.start();
void requestPersistence();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('Nova versão pronta', 'Atualizar', () => location.reload());
      });
    });
  }).catch(() => { /* sem service worker o app continua funcionando online */ });
}
