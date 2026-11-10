import { useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { useBudget, useMoney } from '@/hooks/useStudioData';
import { Skeleton } from '@/components/ui/primitives';
import { BudgetSheet } from './BudgetSheet';

/** Persistent, compact budget summary. Tap to open the detailed financial sheet. All totals come from the server evaluation. */
export function BudgetBar({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const b = useBudget();
  const m = useMoney();
  const pct = Math.round(b.ratio * 100);
  return (
    <>
      <button
        onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Journey budget: ${m(b.spent)} of ${m(b.budget)}. Open details`}
        className={`group w-full rounded-2xl border border-line bg-surface text-left shadow-sm ${compact ? 'px-4 py-2.5' : 'p-4'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Journey budget</p>
            {b.summary ? (
              <p className="num mt-0.5 truncate text-lg font-bold leading-tight">{m(b.spent)} <span className="text-sm font-medium text-ink-2">/ {m(b.budget)}</span></p>
            ) : <Skeleton className="mt-1 h-6 w-32" />}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-right">
            {b.summary && <span className={`num text-xs font-semibold ${b.over ? 'text-bad' : 'text-ink-2'}`}>{b.over ? `${m(-b.remaining)} over` : `${pct}% · ${m(b.remaining)} left`}</span>}
            <ChevronUp size={16} className="text-ink-2" aria-hidden />
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Budget allocated">
          <div className={`h-full rounded-full transition-[width] duration-500 ${b.over ? 'bg-bad' : b.ratio > 0.85 ? 'bg-risk' : 'bg-teal'}`} style={{ width: `${pct}%` }} />
        </div>
      </button>
      <BudgetSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
