import { type Child, h, svg } from './dom';

const W = 320;
const H = 150;
const PAD = { l: 6, r: 6, t: 16, b: 20 };

export interface ChartPoint {
  label: string;
  value: number | null;
  ref?: number;
}

export interface AreaChartOptions {
  points: ChartPoint[];
  /** Teto de referência (orçamento ou alvo), desenhado como linha tracejada. */
  cap: number;
  capLabel: string;
  valueLabel: string;
  refLabel?: string;
  fmt: (cents: number) => string;
  /** Ponto mostrado antes de o usuário tocar no gráfico. */
  initial: number;
  /** Pinta de vermelho quando o valor passa do teto (gastos); desligado para metas. */
  overIsBad?: boolean;
  ariaLabel: string;
}

const attr = (el: SVGElement, name: string, value: string | number) => el.setAttribute(name, String(value));

/** Gráfico de área interativo: toque, arraste ou use as setas para ler cada ponto. Sem biblioteca. */
export function areaChart(o: AreaChartOptions): HTMLElement {
  const n = o.points.length;
  const max = Math.max(1, o.cap, ...o.points.map((p) => Math.max(p.value ?? 0, p.ref ?? 0))) * 1.06;
  const x = (i: number) => (n <= 1 ? W / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const base = y(0);

  const known = o.points.map((p, i) => ({ p, i })).filter((q): q is { p: ChartPoint & { value: number }; i: number } => q.p.value !== null);
  const line = known.map((q, k) => `${k ? 'L' : 'M'}${x(q.i).toFixed(1)} ${y(q.p.value).toFixed(1)}`).join(' ');
  const last = known[known.length - 1];
  const first = known[0];
  const area = last && first ? `${line} L${x(last.i).toFixed(1)} ${base} L${x(first.i).toFixed(1)} ${base} Z` : '';
  const over = !!o.overIsBad && !!last && last.p.value > o.cap;
  const refLine = o.points.some((p) => p.ref !== undefined)
    ? o.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.ref ?? 0).toFixed(1)}`).join(' ') : '';

  const marker = svg('line', { class: 'chart-marker', y1: PAD.t - 6, y2: base });
  const dot = svg('circle', { class: `chart-dot${over ? ' over' : ''}`, r: 5 });
  const readout = h('div', { class: 'readout', 'aria-live': 'polite' });

  const select = (raw: number) => {
    const i = Math.max(0, Math.min(n - 1, raw));
    const p = o.points[i];
    if (!p) return;
    attr(marker, 'x1', x(i)); attr(marker, 'x2', x(i));
    dot.style.display = p.value === null ? 'none' : '';
    if (p.value !== null) { attr(dot, 'cx', x(i)); attr(dot, 'cy', y(p.value)); }
    const parts: Child[] = [h('strong', null, p.label)];
    if (p.value !== null) parts.push(h('span', { class: over && p.value > o.cap ? 'bad num' : 'num' }, `${o.valueLabel} ${o.fmt(p.value)}`));
    else parts.push(h('span', { class: 'muted' }, 'ainda não chegou'));
    if (p.ref !== undefined && o.refLabel) parts.push(h('span', { class: 'muted num' }, `${o.refLabel} ${o.fmt(p.ref)}`));
    readout.replaceChildren(...parts.map((c) => (typeof c === 'string' ? document.createTextNode(c) : c as Node)));
  };

  const capY = y(o.cap);
  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', tabindex: 0, 'aria-label': o.ariaLabel,
  },
  svg('line', { class: 'chart-base', x1: PAD.l, x2: W - PAD.r, y1: base, y2: base }),
  svg('line', { class: 'chart-cap', x1: PAD.l, x2: W - PAD.r, y1: capY, y2: capY }),
  ...(area ? [svg('path', { class: `chart-area${over ? ' over' : ''}`, d: area })] : []),
  ...(refLine ? [svg('path', { class: 'chart-ref', d: refLine })] : []),
  ...(line ? [svg('path', { class: `chart-line${over ? ' over' : ''}`, d: line })] : []),
  marker, dot);
  const capText = svg('text', { class: 'chart-label', x: W - PAD.r, y: capY - 4, 'text-anchor': 'end' });
  capText.textContent = `${o.capLabel} ${o.fmt(o.cap)}`;
  root.appendChild(capText);
  for (const [i, anchor] of [[0, 'start'], [n - 1, 'end']] as const) {
    const t = svg('text', { class: 'chart-label', x: x(i), y: H - 5, 'text-anchor': n > 1 ? anchor : 'middle' });
    t.textContent = o.points[i]?.label ?? '';
    root.appendChild(t);
  }

  const fromEvent = (e: PointerEvent) => {
    const r = root.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    return n <= 1 ? 0 : Math.round(((fx - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
  };
  let current = o.initial;
  const go = (i: number) => { current = Math.max(0, Math.min(n - 1, i)); select(current); };
  root.addEventListener('pointerdown', (e) => go(fromEvent(e)));
  root.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') go(fromEvent(e)); });
  root.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (step) { e.preventDefault(); go(current + step); }
  });
  select(current);

  const legend = h('div', { class: 'chart-legend caption' },
    h('span', null, h('i', { class: 'swatch solid' }), o.valueLabel),
    o.refLabel ? h('span', null, h('i', { class: 'swatch dashed' }), o.refLabel) : null,
    h('span', null, h('i', { class: 'swatch cap' }), o.capLabel));
  return h('div', { class: 'chart-wrap' }, readout, root as unknown as Node, legend);
}

export interface BarGroup {
  id: string;
  label: string;
  a: number;
  b: number;
}

export interface BarChartOptions {
  groups: BarGroup[];
  aLabel: string;
  bLabel: string;
  fmt: (cents: number) => string;
  onOpen: (id: string) => void;
  ariaLabel: string;
}

/** Barras agrupadas (ex.: entrada × gasto por período). Toque numa barra para ler os valores e abrir o detalhe. */
export function barChart(o: BarChartOptions): HTMLElement {
  const n = o.groups.length;
  const max = Math.max(1, ...o.groups.flatMap((g) => [g.a, g.b])) * 1.08;
  const slot = (W - PAD.l - PAD.r) / Math.max(1, n);
  const bw = Math.min(22, slot * 0.38);
  const base = H - PAD.b;
  const hh = (v: number) => (v / max) * (base - PAD.t);
  const readout = h('div', { class: 'readout', 'aria-live': 'polite' });
  const open = h('button', { type: 'button', class: 'mini' }, 'Abrir');
  const bar = h('div', { class: 'readout-row' }, readout, open);
  let selected = n - 1;
  const groupEls: SVGElement[] = [];

  const select = (i: number) => {
    const g = o.groups[i];
    if (!g) return;
    selected = i;
    groupEls.forEach((el, k) => el.classList.toggle('on', k === i));
    readout.replaceChildren(
      h('strong', null, g.label),
      h('span', { class: 'num good' }, `${o.aLabel} ${o.fmt(g.a)}`),
      h('span', { class: `num ${g.b > g.a ? 'bad' : ''}` }, `${o.bLabel} ${o.fmt(g.b)}`));
  };
  open.addEventListener('click', () => { const g = o.groups[selected]; if (g) o.onOpen(g.id); });

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'group', 'aria-label': o.ariaLabel },
    svg('line', { class: 'chart-base', x1: PAD.l, x2: W - PAD.r, y1: base, y2: base }));
  o.groups.forEach((g, i) => {
    const cx = PAD.l + slot * (i + 0.5);
    const rect = (v: number, dx: number, cls: string) => svg('rect', {
      class: cls, x: cx + dx, y: base - hh(v), width: bw, height: Math.max(v > 0 ? 2 : 0, hh(v)), rx: 3,
    });
    const label = svg('text', { class: 'chart-label', x: cx, y: H - 5, 'text-anchor': 'middle' });
    label.textContent = g.label;
    const hit = svg('rect', { class: 'chart-hit', x: cx - slot / 2, y: 0, width: slot, height: H });
    const grp = svg('g', { class: 'bar-group', role: 'button', tabindex: 0, 'aria-label': g.label }, rect(g.a, -bw - 1, 'bar-a'), rect(g.b, 1, 'bar-b'), label, hit);
    grp.addEventListener('click', () => select(i));
    grp.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); select(i); } });
    groupEls.push(grp);
    root.appendChild(grp);
  });
  select(selected);

  const legend = h('div', { class: 'chart-legend caption' },
    h('span', null, h('i', { class: 'swatch bar-a-sw' }), o.aLabel), h('span', null, h('i', { class: 'swatch bar-b-sw' }), o.bLabel));
  return h('div', { class: 'chart-wrap' }, bar, root as unknown as Node, legend);
}
