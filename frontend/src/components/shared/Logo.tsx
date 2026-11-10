import { clsx } from 'clsx';

/** The stylised O is the official ORBIX icon: ring, globe, gold orbit and compass arrow. Colours follow the theme where they must (ring), brand gold stays fixed. */
export function OrbixMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="ORBIX" className={clsx('shrink-0', className)}>
      <path d="M32 2 38 13H26Z" fill="#C08A1E" />
      <circle cx="32" cy="37" r="22" fill="none" stroke="var(--logo-ring, #0E3B3C)" strokeWidth="7" />
      <g fill="none" stroke="#5E9A99" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="32" cy="37" r="12.5" /><ellipse cx="32" cy="37" rx="5.5" ry="12.5" /><path d="M19.5 37h25M21.5 30.5h21M21.5 43.5h21" />
      </g>
      <path d="M8 47C22 53 44 44 53 27" fill="none" stroke="#C08A1E" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="53.5" cy="25.5" r="3.4" fill="#C08A1E" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <OrbixMark />
      <span className="display text-lg font-bold tracking-[0.18em]">ORBIX</span>
    </span>
  );
}
