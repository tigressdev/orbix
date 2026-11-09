// Sign-in screen. The server holds the password hashes and issues a signed HttpOnly session cookie; nothing secret lives in this file.
import { h } from './ui.js';
import { api } from './api.js';

export function showLogin(message = '') {
  document.getElementById('login')?.remove();
  const err = h('p', { class: 'login-err', role: 'alert' }, message);
  const user = h('input', { name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: false, required: true, 'aria-label': 'Login' });
  const pass = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true, 'aria-label': 'Password' });
  const btn = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'login-form', onsubmit: async (e) => {
    e.preventDefault();
    btn.disabled = true; err.textContent = '';
    try {
      await api.post('/api/login', { username: user.value, password: pass.value });
      location.reload();
    } catch (x) {
      err.textContent = x.message || 'Could not sign in.';
      btn.disabled = false; pass.value = ''; pass.focus();
    }
  } },
    h('label', { class: 'field' }, 'Login', user),
    h('label', { class: 'field' }, 'Password', pass),
    err, btn);
  const box = h('div', { id: 'login', class: 'login', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'login-title' },
    h('div', { class: 'login-card' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'FLIGHT INTELLIGENCE')),
      h('p', { class: 'eyebrow', style: { marginTop: '18px' } }, 'The Journey Studio · 2027'),
      h('h1', { id: 'login-title', class: 'serif' }, 'Welcome back.'),
      h('p', { class: 'muted' }, 'Each person keeps their own plans. You can look at the other one’s, but only the owner can change them.'),
      form));
  document.body.append(box);
  user.focus();
}
