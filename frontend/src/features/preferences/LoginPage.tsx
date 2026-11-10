import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/primitives';
import { Wordmark } from '@/components/shared/Logo';
import { api, ApiError } from '@/services/api/client';

/** Server-managed sign-in: the HttpOnly session cookie is set by the API. Nothing secret lives in this bundle or in localStorage. */
export default function LoginPage({ message = '' }: { message?: string }) {
  const [error, setError] = useState(message);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try { await api.post('/api/login', { username: f.get('username'), password: f.get('password') }); location.reload(); }
    catch (x) { setError(x instanceof ApiError ? x.message : 'Could not sign in.'); setBusy(false); }
  };
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-7 shadow-sm">
        <Wordmark />
        <p className="eyebrow mt-5">The Economics of Exploration</p>
        <h1 className="display mt-1 text-5xl font-semibold leading-[1.02]">Welcome back.</h1>
        <p className="mt-3 text-[15px] text-ink-2">Each person keeps their own plans. You can look at the other one’s, but only the owner can change them.</p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">Login<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required className="min-h-12 rounded-xl border border-line bg-canvas px-3" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Password<input name="password" type="password" autoComplete="current-password" required className="min-h-12 rounded-xl border border-line bg-canvas px-3" /></label>
          <p role="alert" className="min-h-5 text-sm text-bad">{error}</p>
          <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </div>
    </div>
  );
}
