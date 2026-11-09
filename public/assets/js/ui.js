// Tiny DOM helpers, icon set, toasts and dialog. No innerHTML with data: everything is built from nodes.
const SVGNS = 'http://www.w3.org/2000/svg';
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('aria-') && v != null) { e.setAttribute(k, String(v)); continue; }   // aria-pressed="true"/"false"
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  append(e, kids);
  return e;
}
export function s(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  append(e, kids);
  return e;
}
function append(e, kids) {
  for (const c of kids.flat(9)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => { el.replaceChildren(); return el; };

const PATHS = {
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', check: 'M5 13l4 4 10-10',
  chevron: 'M6 9l6 6 6-6', back: 'M15 6l-6 6 6 6', copy: 'M9 9h10v10H9zM5 15V5h10',
  pin: 'M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.6l1.1-6L3.4 9.4l6-.8z', compare: 'M7 4v16M17 4v16M3 8h8M13 16h8',
  star: 'M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.6l1.1-6L3.4 9.4l6-.8z', undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z', route: 'M5 19a2 2 0 100-4 2 2 0 000 4zM19 9a2 2 0 100-4 2 2 0 000 4zM7 17c8 0 2-10 10-10',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14', tree: 'M5 12h4M9 12c4 0 2-6 6-6M9 12c4 0 2 6 6 6M15 6h4M15 18h4',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', minus: 'M5 12h14', warn: 'M12 4l9 16H3zM12 10v4M12 17v.5',
};
export function icon(name, size = 16, sw = 1.8) {
  const svg = s('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'ico', 'aria-hidden': 'true' });
  svg.append(s('path', { d: PATHS[name] || PATHS.plus }));
  return svg;
}

export function toast(message, { action, onAction, ms = 6000 } = {}) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast' }, h('span', {}, message));
  if (action) t.append(h('button', { onclick: () => { onAction && onAction(); t.remove(); } }, action));
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export function openDialog(content) {
  const d = document.getElementById('dialog');
  clear(d).append(content);
  if (!d.open) d.showModal();
  return d;
}
export const closeDialog = () => document.getElementById('dialog').close();
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
