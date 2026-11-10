import { Star } from 'lucide-react';
import { useStudio } from '@/stores/studio';

/** Compact scenario chips (horizontal scroll inside the component; the page itself never scrolls sideways). */
export function ScenarioSwitcher() {
  const scenarios = useStudio((s) => s.scenarios);
  const activeId = useStudio((s) => s.activeId);
  const switchScenario = useStudio((s) => s.switchScenario);
  if (scenarios.length < 2) return null;
  return (
    <div className="hscroll -mx-4 px-4" role="tablist" aria-label="Scenarios">
      {scenarios.map((x) => (
        <button key={x.id} role="tab" aria-selected={x.id === activeId} onClick={() => switchScenario(x.id)}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${x.id === activeId ? 'border-teal bg-teal-soft text-teal' : 'border-line bg-surface text-ink-2'}`}>
          {x.saved && <Star size={13} aria-hidden />}{x.name}
        </button>
      ))}
    </div>
  );
}
