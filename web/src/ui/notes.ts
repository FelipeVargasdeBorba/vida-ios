import { newId } from '../state';
import { store } from '../store';
import { button, confirmDialog, emptyState, openSheet, section } from './components';
import { deleteNoteList } from '../actions';
import { h } from './dom';
import { type Ctx, type View, hrefTo } from './view';

const redraw = () => window.dispatchEvent(new Event('vida:rerender'));

function listSheet(id?: string): void {
  const list = store.state.noteLists.find((l) => l.id === id);
  const name = h('input', { type: 'text', class: 'field', value: list?.name ?? '', placeholder: 'Nome da lista', autocomplete: 'off', enterkeyhint: 'done' });
  openSheet(list ? 'Renomear lista' : 'Nova lista', () => h('div', { class: 'form' }, h('div', { class: 'card' }, h('div', { class: 'row' }, name))), {
    onSave: () => {
      const v = name.value.trim();
      if (!v) { name.focus(); return false; }
      store.update((s) => {
        if (list) { const l = s.noteLists.find((x) => x.id === list.id); if (l) l.name = v; }
        else s.noteLists.push({ id: newId(), name: v, sortOrder: s.noteLists.length });
      });
    },
  });
}

export function notesView(_ctx: Ctx): View {
  const s = store.state;
  const el = h('div', { class: 'page' });
  if (!s.noteLists.length) el.append(emptyState('📝', 'Sem listas', 'Toque em ＋ para criar uma.'));
  else {
    el.append(section(null, [...s.noteLists].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => {
      const open = s.noteItems.filter((i) => i.listId === l.id && !i.isDone).length;
      return h('a', { class: 'row link-row', href: hrefTo('notes', 'list', l.id) }, h('span', { class: 'grow row-title' }, l.name),
        open ? h('span', { class: 'badge-count' }, String(open)) : null, h('span', { class: 'chev' }, '›'));
    })));
  }
  return { title: 'Notas', el, actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Nova lista', onclick: () => listSheet() }, '＋')] };
}

export function noteListView(ctx: Ctx): View {
  const s = store.state;
  const list = s.noteLists.find((l) => l.id === ctx.path[1]);
  if (!list) return { title: 'Lista', el: h('div', { class: 'page' }, emptyState('📝', 'Lista não encontrada', 'Ela pode ter sido apagada.')), back: true };
  const items = s.noteItems.filter((i) => i.listId === list.id);
  const open = items.filter((i) => !i.isDone).sort((a, b) => a.createdAt - b.createdAt);
  const done = items.filter((i) => i.isDone).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const input = h('input', { type: 'text', class: 'field', placeholder: 'Novo item', autocomplete: 'off', enterkeyhint: 'done' });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    store.update((st) => { st.noteItems.push({ id: newId(), listId: list.id, text, isDone: false, createdAt: Date.now(), doneAt: null }); });
    input.value = '';
    redraw();
    window.setTimeout(() => document.querySelector<HTMLInputElement>('.add-item input')?.focus(), 0);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const row = (i: (typeof items)[number]) => h('div', { class: `row two${i.isDone ? ' is-done' : ''}` },
    h('button', { type: 'button', class: 'check-btn', 'aria-label': i.isDone ? 'Reabrir' : 'Concluir', onclick: () => { store.update(() => { i.isDone = !i.isDone; i.doneAt = i.isDone ? Date.now() : null; }); redraw(); } },
      h('span', { class: `check${i.isDone ? ' done' : ''}`, style: { '--c': 'var(--accent)' } }, i.isDone ? '✓' : '')),
    h('span', { class: 'grow row-title' }, i.text),
    h('button', { type: 'button', class: 'mini', 'aria-label': 'Apagar item', onclick: () => { store.update((st) => { st.noteItems = st.noteItems.filter((x) => x.id !== i.id); }); redraw(); } }, '✕'));
  const el = h('div', { class: 'page' }, h('div', { class: 'card add-item' }, h('div', { class: 'row two' }, input, button('Adicionar', add, 'primary'))));
  if (open.length) el.append(section(null, open.map(row)));
  if (done.length) {
    el.append(section(`Concluídos (${done.length})`, done.map(row)));
    el.append(h('div', { class: 'center' }, button('Limpar concluídos', () => { store.update((st) => { st.noteItems = st.noteItems.filter((x) => !(x.listId === list.id && x.isDone)); }); redraw(); })));
  }
  if (!items.length) el.append(emptyState('📝', 'Lista vazia', 'Escreva acima e toque em Adicionar.'));
  el.append(h('div', { class: 'center stack' },
    button('Renomear lista', () => listSheet(list.id)),
    button('Apagar lista', async () => { if (await confirmDialog('Apagar esta lista?', 'Os itens dela também serão apagados.', 'Apagar', true)) { deleteNoteList(list.id); history.back(); } }, 'danger')));
  return { title: list.name, el, back: true };
}
