// Dialog to add an observed fare by hand (stored as provider "manual"; shown with its source everywhere).
import { h, openDialog, closeDialog, toast } from './ui.js';
import { api } from './api.js';
import { S, commit, cityMeta } from './store.js';
import { getCurrency } from './fmt.js';

export function quoteDialog(prefill = {}) {
  const codes = Object.entries(S.meta.airports).sort((a, b) => cityMeta(a[1]).name.localeCompare(cityMeta(b[1]).name));
  const sel = (name, value) => h('select', { name }, codes.map(([c, city]) => h('option', { value: c, selected: c === value }, `${c} · ${cityMeta(city).name}`)));
  const msg = h('p', { class: 'small', role: 'alert' });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await api.post('/api/manual', body);
      S.next = {};
      closeDialog();
      toast('Fare saved. Reopen a “+” to see it.');
      commit();
    } catch (err) { msg.className = 'small'; msg.style.color = 'var(--red)'; msg.textContent = err.message; }
  } },
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, 'From', sel('origin', prefill.origin || 'PEK')),
      h('label', { class: 'field' }, 'To', sel('destination', prefill.destination || 'SVO')),
      h('label', { class: 'field' }, 'Departure (local time)', h('input', { type: 'datetime-local', name: 'dep_local', required: true })),
      h('label', { class: 'field' }, 'Arrival (local time)', h('input', { type: 'datetime-local', name: 'arr_local', required: true })),
      h('label', { class: 'field' }, 'Price', h('input', { type: 'number', name: 'price', min: 1, step: 'any', required: true })),
      h('label', { class: 'field' }, 'Currency of the price', h('select', { name: 'currency' }, ['USD', 'BRL', 'RUB'].map((c) => h('option', { value: c, selected: c === getCurrency() }, c)))),
      h('label', { class: 'field' }, 'Stops', h('input', { type: 'number', name: 'stops', min: 0, max: 4, value: 0 })),
      h('label', { class: 'field' }, 'Airline or note', h('input', { type: 'text', name: 'airlines', maxlength: 80 }))),
    msg,
    h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Cancel'), h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save fare')));
  openDialog(h('div', {}, h('h3', {}, 'Add an observed fare'),
    h('p', { class: 'small muted' }, 'Use times as shown by the airline or search site (local time at each airport). Train legs can be entered between the airports of their cities.'), form));
}
