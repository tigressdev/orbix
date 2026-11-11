import { useState } from 'react';
import { useChapters, useMetaOrThrow } from '@/hooks/useStudioData';
import { FlexibleDateSelector } from './FlexibleDateSelector';

export function RouteDateSearch({ initialFrom, initialTo, initialDate, open = false }: { initialFrom?: string; initialTo?: string; initialDate?: string; open?: boolean }) {
  const meta = useMetaOrThrow();
  const { nodes } = useChapters();
  const last = nodes[nodes.length - 1]?.leg;
  const [from, setFrom] = useState(initialFrom ?? (last ? meta.airports[last.destination] : null) ?? 'MADRID');
  const [to, setTo] = useState(initialTo ?? (from === 'BEIJING' ? 'MOSCOW' : from === 'MOSCOW' ? 'MADRID' : 'BEIJING'));
  const [value, setValue] = useState({ preferred: initialDate ?? (from === 'MADRID' ? '2027-02-12' : from === 'MOSCOW' ? '2027-03-20' : '2027-03-10'), flex: 2 });
  const cities = Object.entries(meta.cities).filter(([id]) => Object.values(meta.airports).includes(id));
  return <details open={open || undefined} className="min-w-0 rounded-2xl border border-line bg-surface p-4" data-testid="route-date-search">
    <summary className="min-h-9 cursor-pointer font-semibold">Search flexible dates</summary>
    <div className="mt-2 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">{([{ label: 'From', v: from, set: setFrom }, { label: 'To', v: to, set: setTo }]).map((x) => <label key={x.label} className="flex min-w-0 flex-col gap-1 text-sm">{x.label}<select className="min-h-11 min-w-0 rounded-lg border border-line bg-surface px-2" value={x.v} onChange={(e) => x.set(e.target.value)}>{cities.map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}</select></label>)}</div>
      <FlexibleDateSelector from={from} to={to} value={value} onChange={setValue} />
    </div>
  </details>;
}
