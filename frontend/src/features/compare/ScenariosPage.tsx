import { useState } from 'react';
import { Copy, Pencil, Plus, Star, Trash2, GitCompareArrows } from 'lucide-react';
import { Button, Card, Chip, Empty } from '@/components/ui/primitives';
import { useEvaluation, useMetaOrThrow, useMoney } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { leaves, pathNodes } from '@/lib/tree';
import { plural } from '@/lib/format';
import type { Scenario, Summary } from '@/types';

/** Mobile-friendly branch navigator: every scenario and every end-of-branch as a compact itinerary card, with its own server-calculated budget. */
export default function ScenariosPage() {
  const meta = useMetaOrThrow();
  const m = useMoney();
  const { scenarios, activeId, compare, viewOnly } = useStudio();
  const st = useStudio.getState;
  const ev = useEvaluation();
  const [editing, setEditing] = useState<string | null>(null);
  const city = (code: string) => meta.cities[meta.airports[code] ?? '']?.name ?? code;
  const label = (sc: Scenario, nid: string) => ['Madrid', ...pathNodes(sc, nid).filter((n) => n.leg).map((n) => city(n.leg!.destination))].join(' → ');
  const summaryOf = (sid: string, nid: string): Summary | null => { const r = ev.of(sid, nid); return r && !('stale' in r && r.stale) ? (r as { summary: Summary }).summary : null; };
  const pinned = compare.map((p) => ({ p, sc: scenarios.find((x) => x.id === p.sid) })).filter((x) => x.sc?.nodes[x.p.nid]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div><p className="eyebrow">Scenarios</p><h1 className="display text-4xl font-semibold leading-tight">Branches</h1></div>
        {!viewOnly && <Button variant="primary" onClick={() => st().newScenario()}><Plus size={16} aria-hidden />New</Button>}
      </div>

      {scenarios.map((sc, i) => {
        const ends = leaves(sc);
        const focusSummary = summaryOf(sc.id, sc.focusId);
        return (
          <Card key={sc.id} className={sc.id === activeId ? 'border-teal/60' : ''}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="eyebrow">Scenario {String.fromCharCode(65 + i)}</p>
                {editing === sc.id ? (
                  <input autoFocus defaultValue={sc.name} aria-label="Scenario name" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-2 text-lg" onBlur={(e) => { st().renameScenario(sc.id, e.target.value); setEditing(null); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                ) : <p className="display text-2xl font-semibold leading-tight">{sc.name}</p>}
              </div>
              {sc.id === activeId ? <Chip tone="teal">Open</Chip> : <Button size="sm" onClick={() => st().switchScenario(sc.id)}>Open</Button>}
            </div>
            <p className="mt-1 text-sm text-ink-2">{label(sc, sc.focusId)}</p>
            <p className="num mt-1 text-sm">{focusSummary ? <>Estimated total <b>{m(focusSummary.total)}</b> · {plural(focusSummary.visited.length - 1, 'destination', 'destinations')}{focusSummary.complete ? ' · complete' : ''}</> : 'Calculating…'}</p>
            {ends.length > 1 && (
              <ul className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2" aria-label="Branch ends">
                {ends.map((n) => { const s = summaryOf(sc.id, n.id); const pinnedNow = compare.some((p) => p.sid === sc.id && p.nid === n.id); return (
                  <li key={n.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{label(sc, n.id)}</span>
                    <span className="flex shrink-0 items-center gap-1"><span className="num text-ink-2">{s ? m(s.total) : '…'}</span>
                      <Button size="sm" variant="ghost" aria-pressed={pinnedNow} aria-label="Compare this branch" onClick={() => { if (!st().togglePin(sc.id, n.id)) alert('Compare up to four branches.'); }}><GitCompareArrows size={16} className={pinnedNow ? 'text-teal' : ''} /></Button></span></li>); })}
              </ul>
            )}
            {!viewOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setEditing(sc.id)}><Pencil size={14} aria-hidden />Rename</Button>
                <Button size="sm" onClick={() => st().duplicateScenario(sc.id)}><Copy size={14} aria-hidden />Duplicate</Button>
                <Button size="sm" onClick={() => st().toggleSaved(sc.id)}><Star size={14} aria-hidden />{sc.saved ? 'Saved' : 'Save'}</Button>
                {scenarios.length > 1 && <Button size="sm" variant="danger" onClick={() => { if (confirm(`Delete “${sc.name}”?`)) st().deleteScenario(sc.id); }}><Trash2 size={14} aria-hidden />Delete</Button>}
              </div>
            )}
          </Card>
        );
      })}

      <section aria-label="Compare" className="flex flex-col gap-2">
        <h2 className="display text-2xl font-semibold">Compare</h2>
        {pinned.length < 2 ? <Empty title="Pin two or more branches">Use the compare icon on a branch end to line them up side by side.</Empty> : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="num w-full min-w-[480px] text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-ink-2"><tr><th className="p-3">&nbsp;</th>{pinned.map(({ p, sc }) => <th key={p.sid + p.nid} className="p-3">{sc!.name}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {([['Route', (_s: Summary | null, sc: Scenario, nid: string) => label(sc, nid)], ['Flights', (s: Summary | null) => (s ? m(s.flights) : '…')], ['Stays (your share)', (s: Summary | null) => (s ? m(s.hotel) : '…')],
                  ['Bags + transfers', (s: Summary | null) => (s ? m(s.bags + s.transfers) : '…')], ['Total', (s: Summary | null) => (s ? m(s.total) : '…')], ['Risk (not cash)', (s: Summary | null) => (s ? m(s.risk) : '…')]] as [string, (s: Summary | null, sc: Scenario, nid: string) => string][]).map(([name, fn]) => (
                  <tr key={name}><th className="p-3 font-medium text-ink-2">{name}</th>{pinned.map(({ p, sc }) => <td key={p.sid + p.nid} className="p-3 align-top">{fn(summaryOf(p.sid, p.nid), sc!, p.nid)}</td>)}</tr>))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
