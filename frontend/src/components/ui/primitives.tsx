import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...p}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none',
        size === 'sm' && 'min-h-9 px-3 text-sm', size === 'md' && 'min-h-11 px-4 text-[15px]', size === 'lg' && 'min-h-12 px-5 text-base',
        variant === 'primary' && 'bg-teal text-[var(--on-teal)] hover:brightness-110',
        variant === 'secondary' && 'bg-surface text-ink border border-line hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-2 hover:bg-line/50', variant === 'danger' && 'bg-bad-soft text-bad border border-bad/30',
        className,
      )}
    />
  );
}

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={clsx('rounded-2xl border border-line bg-surface p-4 min-w-0', className)} />;
}

type Tone = 'neutral' | 'teal' | 'gold' | 'risk' | 'bad' | 'good' | 'lilac';
const TONES: Record<Tone, string> = {
  neutral: 'bg-line/60 text-ink-2', teal: 'bg-teal-soft text-teal', gold: 'bg-gold-soft text-[#8a6d3b] dark:text-gold', risk: 'bg-risk-soft text-risk',
  bad: 'bg-bad-soft text-bad', good: 'bg-teal-soft text-good', lilac: 'bg-[color-mix(in_srgb,var(--lilac)_16%,transparent)] text-lilac',
};
export function Chip({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('skeleton', className)} aria-hidden />;

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="text-center py-8">
      <p className="display text-xl font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-2">{children}</div>}
    </Card>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card role="alert" className="border-bad/40 bg-bad-soft text-bad">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm break-words">{error instanceof Error ? error.message : String(error)}</p>
      {onRetry && <Button size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
    </Card>
  );
}
