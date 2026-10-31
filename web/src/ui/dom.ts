export type Child = Node | string | number | false | null | undefined | Child[];
type Props = Record<string, unknown>;

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) child.forEach((c) => append(parent, c));
  else parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
}

/** Cria um elemento. Texto sempre entra como texto (nunca como HTML), então não há injeção de código. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, props?: Props | null, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'inputmode') el.setAttribute(k, v === true ? '' : String(v));
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  children.forEach((c) => append(el, c));
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';

export function svg(tag: string, attrs: Record<string, string | number>, ...children: Node[]): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  children.forEach((c) => el.appendChild(c));
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Acrescenta filhos (ignora vazios) a um elemento já existente. */
export function put(parent: Node, ...children: Child[]): void {
  children.forEach((c) => append(parent, c));
}
