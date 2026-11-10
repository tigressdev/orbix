import { useState } from 'react';
import { clsx } from 'clsx';
import { useMetaOrThrow } from '@/hooks/useStudioData';

const names = (text: string) => text.split(',').map((x) => x.trim()).filter(Boolean);

/** One airline: the logo from the public airline-logo CDN (same one Google Flights uses); if it cannot load, a circle with the IATA code. */
export function AirlineLogo({ name, size = 36 }: { name: string; size?: number }) {
  const meta = useMetaOrThrow();
  const code = meta.airlines[name] ?? null;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mono = (code ?? name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)).toUpperCase();
  return (
    <span className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-white" style={{ width: size, height: size }} title={name}>
      <span className="display col-start-1 row-start-1 text-xs font-bold text-ink-2" style={{ opacity: loaded ? 0 : 1 }} aria-hidden>{mono}</span>
      {code && !failed && <img className="col-start-1 row-start-1 transition-opacity" style={{ opacity: loaded ? 1 : 0 }} src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`} alt="" width={size - 8} height={size - 8} loading="lazy" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
    </span>
  );
}

/** Logos of up to three airlines plus the flight number badge when the data has one, else the IATA code ("CA 898"-style identification). */
export function AirlineBadge({ airlines, flights, className }: { airlines: string; flights?: string; className?: string }) {
  const meta = useMetaOrThrow();
  const list = names(airlines);
  const first = list[0];
  const code = first ? meta.airlines[first] : undefined;
  return (
    <div className={clsx('flex min-w-0 items-center gap-2.5', className)}>
      <span className="flex -space-x-2">{list.length ? list.slice(0, 3).map((n) => <AirlineLogo key={n} name={n} />) : <span className="grid size-9 place-items-center rounded-full border border-line text-xs font-bold text-ink-2" title="Airline not recorded">?</span>}</span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{list.length ? list.join(' · ') : 'Airline not recorded'}</p>
        <p className="text-xs text-ink-2"><span className="num inline-flex items-center rounded-full border border-line px-1.5 py-px font-semibold">{flights?.trim() || (code ? `${code}` : 'no. n/a')}</span>{flights?.trim() ? '' : <span className="ml-1">flight no. not in source</span>}</p>
      </div>
    </div>
  );
}
