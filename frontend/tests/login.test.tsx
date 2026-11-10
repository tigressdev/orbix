import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/features/preferences/LoginPage';

afterEach(() => vi.restoreAllMocks());

describe('login', () => {
  it('shows the server message on a wrong password and keeps the form usable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Wrong login or password.' }), { status: 401, headers: { 'Content-Type': 'application/json' } })));
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Login'), 'helen');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Wrong login or password.'));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/login');
    expect(init.credentials).toBe('same-origin');          // the session lives in an HttpOnly cookie, never in JS-readable storage
    expect(localStorage.length).toBe(0);
  });
});
