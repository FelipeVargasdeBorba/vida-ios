import { newId } from '../state';
import { store } from '../store';
import { button, confirmDialog, emptyState, openSheet, section } from './components';
import { deleteNoteList } from '../actions';
import { h } from './dom';
import { type Ctx, type View, hrefTo } from './view';

const redraw = () => window.dispatchEvent(new Event('vida:rerender'));

function listSheet(id?: string): void {
  const list = store.state.noteLists.find((l) => l.id === id);
  const name = h('input', { type: 'text', class: 'field', value: list?.name ?? '', placeholder: 'List name', autocomplete: 'off', enterkeyhint: 'done' });
  openSheet(list ? 'Rename list' : 'New list', () => h('div', { class: 'form' }, h('div', { class: 'card' }, h('div', { class: 'row' }, name))), {
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
  if (!s.noteLists.length) el.append(emptyState('📝', 'No lists', 'Tap ＋ to create one.'));
  else {
    el.append(section(null, [...s.noteLists].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => {
      const open = s.noteItems.filter((i) => i.listId === l.id && !i.isDone).length;
      return h('a', { class: 'row link-row', href: hrefTo('notes', 'list', l.id) }, h('span', { class: 'grow row-title' }, l.name),
        open ? h('span', { class: 'badge-count' }, String(open)) : null, h('span', { class: 'chev' }, '›'));
    })));
  }
  return { title: 'Notes', el, actions: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'New list', onclick: () => listSheet() }, '＋')] };
}

export function noteListView(ctx: Ctx): View {
  const s = store.state;
  const list = s.noteLists.find((l) => l.id === ctx.path[1]);
  if (!list) return { title: 'List', el: h('div', { class: 'page' }, emptyState('📝', 'List not found', 'It may have been deleted.')), back: true };
  const items = s.noteItems.filter((i) => i.listId === list.id);
  const open = items.filter((i) => !i.isDone).sort((a, b) => a.createdAt - b.createdAt);
  const done = items.filter((i) => i.isDone).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const input = h('input', { type: 'text', class: 'field', placeholder: 'New item', autocomplete: 'off', enterkeyhint: 'done' });
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
    h('button', { type: 'button', class: 'check-btn', 'aria-label': i.isDone ? 'Reopen' : 'Complete', onclick: () => { store.update(() => { i.isDone = !i.isDone; i.doneAt = i.isDone ? Date.now() : null; }); redraw(); } },
      h('span', { class: `check${i.isDone ? ' done' : ''}`, style: { '--c': 'var(--accent)' } }, i.isDone ? '✓' : '')),
    h('span', { class: 'grow row-title' }, i.text),
    h('button', { type: 'button', class: 'mini', 'aria-label': 'Delete item', onclick: () => { store.update((st) => { st.noteItems = st.noteItems.filter((x) => x.id !== i.id); }); redraw(); } }, '✕'));
  const el = h('div', { class: 'page' }, h('div', { class: 'card add-item' }, h('div', { class: 'row two' }, input, button('Add', add, 'primary'))));
  if (open.length) el.append(section(null, open.map(row)));
  if (done.length) {
    el.append(section(`Completed (${done.length})`, done.map(row)));
    el.append(h('div', { class: 'center' }, button('Clear completed', () => { store.update((st) => { st.noteItems = st.noteItems.filter((x) => !(x.listId === list.id && x.isDone)); }); redraw(); })));
  }
  if (!items.length) el.append(emptyState('📝', 'Empty list', 'Type above and tap Add.'));
  el.append(h('div', { class: 'center stack' },
    button('Rename list', () => listSheet(list.id)),
    button('Delete list', async () => { if (await confirmDialog('Delete this list?', 'Its items are deleted too.', 'Delete', true)) { deleteNoteList(list.id); history.back(); } }, 'danger')));
  return { title: list.name, el, back: true };
}
