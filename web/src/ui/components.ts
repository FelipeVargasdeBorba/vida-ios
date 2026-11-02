import { type Category } from '../domain/budget';
import type { SplitSlice } from '../domain/accountSplit';
import { parseCents, plainMoney } from '../domain/money';
import { type Child, clear, h, svg } from './dom';

/** Cor CSS de cada categoria (definida em styles.css, com versão para o modo escuro). */
export const catColor = (c: Category) => `var(--cat-${c})`;
export const goalColor = (index: number) => `color-mix(in srgb, var(--goal) ${Math.max(45, 100 - index * 18)}%, transparent)`;

export function sliceColor(s: SplitSlice): string {
  if (s.kind.type === 'category') return catColor(s.kind.category);
  return s.kind.type === 'goal' ? goalColor(s.kind.index) : catColor('poupanca');
}

export function iconBadge(symbol: string, color: string): HTMLElement {
  return h('span', { class: 'badge', style: { '--c': color } as unknown as Partial<CSSStyleDeclaration>, 'aria-hidden': 'true' }, symbol);
}

export function bar(progress: number, color: string, over = false): HTMLElement {
  const fill = h('span', { class: `bar-fill${over ? ' over' : ''}` });
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  fill.style.setProperty('--c', color);
  return h('span', { class: 'bar', 'aria-hidden': 'true' }, fill);
}

/** Grupo de linhas no estilo de lista agrupada. */
export function section(title: Child, rows: Child[], footer?: Child): HTMLElement {
  return h('section', { class: 'group' },
    title ? h('h2', { class: 'group-title' }, title) : null,
    h('div', { class: 'card' }, rows),
    footer ? h('p', { class: 'group-footer' }, footer) : null);
}

export function valueRow(title: string, value: string, tint?: 'good' | 'bad' | 'accent'): HTMLElement {
  return h('div', { class: 'row value-row' }, h('span', { class: 'row-title' }, title), h('span', { class: `num ${tint ?? ''}` }, value));
}

export function linkRow(symbol: string, title: string, href: string, detail?: string): HTMLElement {
  return h('a', { class: 'row link-row', href },
    h('span', { class: 'row-icon', 'aria-hidden': 'true' }, symbol),
    h('span', { class: 'row-title' }, title),
    detail ? h('span', { class: 'muted num' }, detail) : null,
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
}

export function button(label: string, onclick: () => void, kind: 'primary' | 'plain' | 'danger' = 'plain'): HTMLButtonElement {
  return h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);
}

export function emptyState(symbol: string, title: string, text: string): HTMLElement {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, symbol), h('h3', null, title), h('p', null, text));
}

export function toggle(label: string, checked: boolean, onchange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', checked, class: 'switch', onchange: () => onchange(input.checked) });
  return h('label', { class: 'row' }, h('span', { class: 'row-title' }, label), input);
}

/** Campo de dinheiro: o usuário digita texto, o app guarda centavos. */
export function moneyInput(cents: number, onCommit: (cents: number) => void, placeholder = '0,00'): HTMLInputElement {
  const input = h('input', {
    type: 'text', inputmode: 'decimal', class: 'field num', placeholder, autocomplete: 'off', enterkeyhint: 'done',
    value: cents ? plainMoney(cents) : '',
    onchange: () => onCommit(parseCents(input.value) ?? 0),
  });
  return input;
}

export function select<T extends string | number>(
  options: { value: T; label: string }[], value: T, onchange: (v: T) => void,
): HTMLSelectElement {
  const el = h('select', { class: 'field' },
    options.map((o) => h('option', { value: String(o.value), selected: o.value === value }, o.label)));
  el.addEventListener('change', () => {
    const picked = options.find((o) => String(o.value) === el.value);
    if (picked) onchange(picked.value);
  });
  return el;
}

export function segmented<T extends string>(options: { value: T; label: string }[], value: T, onchange: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'segmented', role: 'group' });
  const draw = (current: T) => {
    clear(wrap);
    options.forEach((o) => wrap.appendChild(h('button', {
      type: 'button', class: o.value === current ? 'on' : '', 'aria-pressed': o.value === current,
      onclick: () => { draw(o.value); onchange(o.value); },
    }, o.label)));
  };
  draw(value);
  return wrap;
}

export function labelled(label: string, control: Node): HTMLElement {
  return h('label', { class: 'row field-row' }, h('span', { class: 'row-title' }, label), control);
}

/** Rosca com as fatias do salário (SVG, sem biblioteca). */
export function donut(slices: SplitSlice[], center: HTMLElement, onPick?: (index: number | null) => void): HTMLElement {
  const r = 70;
  const circ = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.amount, 0);
  const gap = slices.length > 1 ? 2.2 : 0;
  const parts: SVGElement[] = [svg('circle', { cx: 100, cy: 100, r, class: 'donut-track' })];
  const arcs: SVGElement[] = [];
  let picked: number | null = null;
  let offset = 0;
  for (const s of slices) {
    const len = (s.amount / total) * circ;
    const arc = svg('circle', {
      cx: 100, cy: 100, r, class: 'donut-arc', 'stroke-dasharray': `${Math.max(0, len - gap)} ${circ}`,
      'stroke-dashoffset': -offset, transform: 'rotate(-90 100 100)',
    });
    (arc as SVGElement & ElementCSSInlineStyle).style.stroke = sliceColor(s);
    if (onPick) {
      const index = arcs.length;
      arc.setAttribute('tabindex', '0');
      arc.setAttribute('role', 'button');
      arc.setAttribute('aria-label', s.title);
      arc.classList.add('pickable');
      const pick = () => { picked = picked === index ? null : index; arcs.forEach((a, k) => a.classList.toggle('dim', picked !== null && picked !== k)); onPick(picked); };
      arc.addEventListener('click', pick);
      arc.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }
    arcs.push(arc);
    parts.push(arc);
    offset += len;
  }
  return h('div', { class: 'donut' }, svg('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': 'Salary split' }, ...parts), h('div', { class: 'donut-center' }, center));
}

// ── Janelas de edição e confirmação ──────────────────────────────────────────

/** Abre uma folha modal. `build` recebe `close` e devolve o conteúdo. */
export function openSheet(title: string, build: (close: () => void) => Child, opts: { onSave?: () => boolean | void; saveLabel?: string } = {}): void {
  const dialog = h('dialog', { class: 'sheet' });
  const close = () => {
    dialog.close();
  };
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  const save = opts.onSave
    ? h('button', { type: 'button', class: 'sheet-save', onclick: () => { if (opts.onSave?.() !== false) close(); } }, opts.saveLabel ?? 'Save')
    : null;
  dialog.append(
    h('header', { class: 'sheet-head' },
      h('button', { type: 'button', class: 'sheet-cancel', onclick: close }, opts.onSave ? 'Cancel' : 'Close'),
      h('h2', null, title), save ?? h('span')),
    h('div', { class: 'sheet-body' }, build(close)));
  document.body.appendChild(dialog);
  dialog.showModal();
}

export function confirmDialog(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'alert' });
    let answer = false;
    dialog.addEventListener('close', () => { dialog.remove(); resolve(answer); });
    dialog.append(
      h('h3', null, title), h('p', null, message),
      h('div', { class: 'alert-actions' },
        h('button', { type: 'button', class: 'btn plain', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { answer = true; dialog.close(); } }, confirmLabel)));
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

export function toast(text: string, actionLabel?: string, action?: () => void): void {
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, text),
    actionLabel ? h('button', { type: 'button', onclick: () => { action?.(); el.remove(); } }, actionLabel) : null);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), actionLabel ? 12_000 : 2_600);
}

/** Baixa um arquivo de texto (backup, calendário). */
export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
