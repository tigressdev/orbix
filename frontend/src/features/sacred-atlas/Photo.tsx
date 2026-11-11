import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Mountain } from 'lucide-react';
import { MEDIA, imgUrl, sourcePage } from './data/media';

/**
 * Licensed photograph with attribution, lazy loading and a calm placeholder. A missing or failing image never breaks the layout
 * and is never replaced by an unlicensed one.
 */
export function Photo({ id, width = 960, className, children, credit = true, eager = false, label }: {
  id: string; width?: number; className?: string; children?: ReactNode; credit?: boolean; eager?: boolean; label?: string;
}) {
  const m = MEDIA[id];
  const [failed, setFailed] = useState(false);
  const show = m && !failed;
  return (
    <div className={clsx('relative overflow-hidden bg-surface-2', className)} data-photo={show ? 'image' : 'placeholder'}>
      {show ? (
        <img src={imgUrl(m.file, width)} srcSet={`${imgUrl(m.file, Math.round(width / 2))} ${Math.round(width / 2)}w, ${imgUrl(m.file, width)} ${width}w, ${imgUrl(m.file, width * 2)} ${width * 2}w`}
          sizes={`(max-width: 768px) 100vw, ${width}px`} alt={m.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover" style={{ objectPosition: m.focal }} />
      ) : (
        <div className="absolute inset-0 grid place-items-center" aria-hidden>
          <svg className="absolute inset-0 size-full text-line" preserveAspectRatio="none" viewBox="0 0 100 40"><path d="M0 40 L18 22 L30 30 L46 12 L60 27 L74 18 L100 36 L100 40 Z" fill="currentColor" opacity=".7" /></svg>
          <span className="relative flex flex-col items-center gap-1 text-ink-2"><Mountain size={22} /><span className="text-[11px] font-semibold uppercase tracking-widest">{label ?? 'Image pending licence'}</span></span>
        </div>
      )}
      {children}
      {show && credit && (
        <a href={sourcePage(m.file)} target="_blank" rel="noreferrer noopener" className="absolute bottom-1 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[10px] leading-tight text-white/90 hover:bg-black/70">
          {m.credit} · {m.license}
        </a>
      )}
    </div>
  );
}
