import { useState } from 'react';
import { clsx } from 'clsx';
import { Card } from '@/components/ui/primitives';
import { CAUTIONS, THEMES, TRADITIONS } from './data/traditions';
import { SITES } from './data/sites';
import { Sources } from './ui';
import type { ComparativeTheme, TraditionId } from './types';

/** Side-by-side comparison of how traditions answer one question at a time. Each answer shows its internal diversity. */
export default function TraditionsMode({ onSite }: { onSite: (id: string) => void }) {
  const [picked, setPicked] = useState<TraditionId[]>(['judaism', 'christianity', 'islam', 'buddhism', 'daoism']);
  const [theme, setTheme] = useState<ComparativeTheme>('goal');
  const t = THEMES.find((x) => x.id === theme)!;
  const toggle = (id: TraditionId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const shown = TRADITIONS.filter((x) => picked.includes(x.id));
  const sitesFor = (id: TraditionId) => SITES.filter((s) => s.traditions.includes(id) || (id === 'buddhism' && s.traditions.includes('chinese-buddhism')));
  return (
    <section className="flex flex-col gap-4" aria-label="Traditions">
      <div><h2 className="display text-3xl font-semibold">An atlas of answers</h2>
        <p className="max-w-2xl text-ink-2">Pick traditions and a question. Summaries orient; they do not define. Every tradition has branches, debates and a history of change.</p></div>
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Traditions</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Traditions to compare">
          {TRADITIONS.map((x) => (
            <button key={x.id} aria-pressed={picked.includes(x.id)} onClick={() => toggle(x.id)}
              className={clsx('min-h-10 rounded-full border px-3.5 text-sm font-semibold', picked.includes(x.id) ? 'border-teal bg-teal-soft text-teal' : 'border-line bg-surface text-ink-2')}>{x.name}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Question</p>
        <div className="hscroll" role="tablist" aria-label="Comparative themes">
          {THEMES.map((x) => <button key={x.id} role="tab" aria-selected={theme === x.id} onClick={() => setTheme(x.id)} className={clsx('min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold', theme === x.id ? 'bg-ink text-canvas' : 'bg-surface text-ink-2 border border-line')}>{x.title}</button>)}
        </div>
      </div>
      <Card className="bg-surface-2"><p className="display text-xl font-semibold">{t.title}</p><p className="text-ink-2">{t.question}</p></Card>
      {shown.length === 0 && <p className="text-sm text-ink-2">Choose at least one tradition.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="comparison">
        {shown.map((x) => (
          <Card key={x.id} className="flex flex-col gap-2" data-testid={`trad-${x.id}`}>
            <div><p className="eyebrow !text-[10px]">{x.family}</p><p className="display text-2xl font-semibold">{x.name}</p><p className="text-xs text-ink-2">{x.originNote}</p></div>
            <p className="text-[15px] leading-relaxed">{x.themes[theme].summary}</p>
            {x.themes[theme].diversity && <p className="border-l-2 border-sage pl-3 text-sm text-ink-2"><b className="font-semibold">Internal diversity.</b> {x.themes[theme].diversity}</p>}
            <p className="text-xs text-ink-2">Branches: {x.branches.join(' · ')}</p>
            {sitesFor(x.id).length > 0 && <div className="flex flex-wrap gap-1.5">{sitesFor(x.id).map((s) => <button key={s.id} onClick={() => onSite(s.id)} className="min-h-9 rounded-full border border-line px-3 text-xs font-semibold text-teal hover:border-teal">{s.name}</button>)}</div>}
            <Sources items={x.sources} />
          </Card>
        ))}
      </div>
      <Card className="flex flex-col gap-2 border-gold/40">
        <p className="eyebrow">Comparing responsibly</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">{CAUTIONS.map((c) => <li key={c}>{c}</li>)}</ul>
        <p className="text-xs text-ink-2">Where answers look alike, read the likeness as a comparative philosophical observation, not as evidence of direct historical influence.</p>
      </Card>
    </section>
  );
}
