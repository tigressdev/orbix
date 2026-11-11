import { NavLink, Outlet } from 'react-router-dom';
import { ChartNoAxesCombined, Compass, Globe2, GitBranch, Landmark, Lightbulb, Route, SlidersHorizontal, Moon, Sun, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { useStudio } from '@/stores/studio';
import { useMetaOrThrow } from '@/hooks/useStudioData';
import { api } from '@/services/api/client';
import { Button } from '@/components/ui/primitives';
import { Wordmark } from '@/components/shared/Logo';
import { BudgetBar } from '@/features/budget/BudgetBar';
import { UserSwitch } from '@/features/preferences/UserSwitch';
import type { Currency, Session } from '@/types';

const MOBILE_NAV = [
  { to: '/', label: 'Journey', icon: Route, end: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/atlas', label: 'Atlas', icon: Globe2 },
  { to: '/pulse', label: 'Pulse', icon: ChartNoAxesCombined },
  { to: '/more', label: 'More', icon: SlidersHorizontal },
];
const DESKTOP_NAV = [
  { to: '/', label: 'Journey', icon: Route, end: true }, { to: '/explore', label: 'Explore', icon: Compass }, { to: '/atlas', label: 'Atlas', icon: Globe2 },
  { to: '/more/sacred', label: 'Sacred Atlas', icon: Landmark },
  { to: '/more/scenarios', label: 'Scenarios', icon: GitBranch }, { to: '/pulse', label: 'Price Pulse', icon: ChartNoAxesCombined },
  { to: '/more/insights', label: 'Insights', icon: Lightbulb }, { to: '/more/preferences', label: 'Preferences', icon: SlidersHorizontal },
];

export function CurrencyToggle() {
  const currency = useStudio((s) => s.prefs.currency);
  const setPref = useStudio((s) => s.setPref);
  return (
    <div role="group" aria-label="Display currency" className="flex rounded-full border border-line bg-surface p-0.5">
      {(['USD', 'BRL', 'RUB'] as Currency[]).map((c) => (
        <button key={c} aria-pressed={currency === c} onClick={() => setPref('currency', c)}
          className={clsx('min-h-9 min-w-11 rounded-full px-2.5 text-xs font-semibold tracking-wide', currency === c ? 'bg-ink text-canvas' : 'text-ink-2')}>{c}</button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const theme = useStudio((s) => s.prefs.theme);
  const setPref = useStudio((s) => s.setPref);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button variant="ghost" size="sm" className="size-11 p-0" aria-label={`Switch to ${next} theme`} onClick={() => { setPref('theme', next); document.documentElement.dataset.theme = next; }}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}

export function AppShell({ session }: { session: Session }) {
  const meta = useMetaOrThrow();
  const viewOnly = useStudio((s) => s.viewOnly);
  const viewing = useStudio((s) => s.viewing);
  const qc = useQueryClient();
  const owner = session.users.find((u) => u.id === viewing);
  const logout = async () => { try { await api.post('/api/logout', {}); } finally { qc.clear(); location.reload(); } };

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[1400px] lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line px-3 py-6 lg:flex">
        <div className="mb-6 px-3"><Wordmark /></div>
        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {DESKTOP_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium', isActive ? 'bg-teal-soft text-teal' : 'text-ink-2 hover:bg-line/50')}>
              <Icon size={18} aria-hidden />{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-1">
          <BudgetBar />
          <p className="px-2 text-xs text-ink-2">1 USD = {meta.fx.latest.BRL?.toFixed(2)} BRL · {meta.fx.latest.RUB?.toFixed(1)} RUB</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-canvas/90 px-4 py-2 backdrop-blur lg:px-8" style={{ paddingTop: 'max(0.5rem, var(--safe-t))' }}>
          <div className="lg:hidden"><Wordmark /></div>
          <div className="hidden lg:block"><p className="eyebrow">The Economics of Exploration</p></div>
          <div className="flex items-center gap-1.5">
            <UserSwitch session={session} />
            <CurrencyToggle />
            <ThemeToggle />
            {session.auth && <Button variant="ghost" size="sm" className="size-11 p-0" aria-label="Sign out" onClick={logout}><LogOut size={18} /></Button>}
          </div>
        </header>

        {viewOnly && (
          <div role="status" className="border-b border-line bg-[color-mix(in_srgb,var(--lilac)_14%,transparent)] px-4 py-2 text-center text-sm font-medium text-lilac">
            You are looking at {owner?.name ?? 'someone else'}’s plans. View only: nothing here can be changed or saved.
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 pb-[calc(9.5rem+var(--safe-b))] pt-4 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      <div className="lg:hidden">
        <div className="fixed inset-x-0 z-30 px-3" style={{ bottom: 'calc(64px + var(--safe-b))' }}><BudgetBar compact /></div>
        <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur" style={{ paddingBottom: 'var(--safe-b)' }}>
          <ul className="mx-auto grid max-w-xl grid-cols-5">
            {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className={({ isActive }) => clsx('relative flex h-16 min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-teal' : 'text-ink-2')}>
                  {({ isActive }) => (<>
                    {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-teal" aria-hidden />}
                    <Icon size={22} aria-hidden strokeWidth={isActive ? 2.4 : 1.9} />{label}
                  </>)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
