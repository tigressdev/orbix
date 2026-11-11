import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

/** Accessible bottom sheet on phones (drag the handle: up expands, down collapses/closes), a right-hand panel from md up. Focus is trapped by Radix. */
export function Sheet({ open, onOpenChange, title, description, children, footer }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; footer?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const reduce = useReducedMotion();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120) { if (expanded) setExpanded(false); else onOpenChange(false); }
    else if (info.offset.y < -60) setExpanded(true);
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) setExpanded(false); onOpenChange(o); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]" />
        <Dialog.Content asChild aria-describedby={description ? undefined : undefined}>
          <motion.div
            initial={reduce ? false : { y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed z-50 flex flex-col overflow-hidden bg-canvas text-ink shadow-2xl outline-none
              inset-x-0 bottom-0 rounded-t-3xl border-t border-line md:inset-y-0 md:right-0 md:left-auto md:w-[520px] md:!h-dvh md:rounded-none md:border-l md:border-t-0"
            style={{ height: expanded ? '92dvh' : 'min(74dvh, 680px)', paddingBottom: 'var(--safe-b)' }}
          >
            <motion.div drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.18} onDragEnd={onDragEnd} className="touch-none md:hidden cursor-grab" aria-hidden>
              <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-line" />
            </motion.div>
            <header className="flex items-start justify-between gap-3 px-4 pt-2 pb-3 md:pt-5 border-b border-line">
              <div className="min-w-0">
                <Dialog.Title className="display text-2xl font-semibold leading-tight">{title}</Dialog.Title>
                {description ? <Dialog.Description className="mt-0.5 text-sm text-ink-2">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
              </div>
              <button className="min-h-11 shrink-0 text-sm font-semibold text-teal md:hidden" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>{expanded ? 'Collapse' : 'Expand'}</button>
              <Dialog.Close className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-line/60" aria-label="Close"><X size={20} /></Dialog.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
            {footer && <footer className="border-t border-line bg-surface px-4 py-3">{footer}</footer>}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
