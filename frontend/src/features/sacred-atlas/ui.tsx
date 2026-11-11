import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { Chip } from '@/components/ui/primitives';
import { FEAS_LABEL, FEAS_NOTE } from './engine/feasibility';
import type { Certainty, Feasibility, Source } from './types';

const FEAS_TONE: Record<Feasibility, 'good' | 'risk' | 'lilac' | 'bad' | 'neutral'> = {
  explorable: 'good', requires_verification: 'risk', permit_dependent: 'lilac', safety_restricted: 'bad', unavailable: 'neutral',
};
export const FeasBadge = ({ s }: { s: Feasibility }) => <Chip tone={FEAS_TONE[s]}><span title={FEAS_NOTE[s]}>{FEAS_LABEL[s]}</span></Chip>;

const CERT: Record<Certainty, string> = { fact: 'Fact', estimate: 'Estimate', historical: 'Historical context', unverified: 'Unverified' };
export const CertTag = ({ c }: { c: Certainty }) => (
  <span className={clsx('ml-1.5 rounded px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wider', c === 'fact' ? 'bg-teal-soft text-teal' : c === 'estimate' ? 'bg-gold-soft text-[#8a6d3b] dark:text-gold' : 'bg-risk-soft text-risk')}>{CERT[c]}</span>
);

export function Sources({ items, title = 'Sources' }: { items: Source[]; title?: string }) {
  if (!items.length) return null;
  return (
    <div className="text-xs text-ink-2">
      <p className="eyebrow !text-[10px]">{title}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((s) => <li key={s.label}>{s.url ? <a className="underline decoration-line underline-offset-2 hover:text-teal" href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a> : s.label}</li>)}
      </ul>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="hscroll rounded-2xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={clsx('min-h-10 shrink-0 rounded-xl px-3.5 text-sm font-semibold', value === o.id ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-line/50')}>{o.label}</button>
      ))}
    </div>
  );
}

export const Section = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
  <section className={clsx('flex flex-col gap-1', className)}><h3 className="eyebrow">{title}</h3><div className="text-[15px] leading-relaxed">{children}</div></section>
);
