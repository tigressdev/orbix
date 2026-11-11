import { Link } from 'react-router-dom';
import { ChevronRight, GitBranch, Landmark, Lightbulb, SlidersHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { UserSwitchList } from './UserSwitchList';

const ITEMS = [
  { to: '/more/sacred', icon: Landmark, title: 'Sacred Atlas', note: 'Where civilizations seek meaning: places, traditions, festivals' },
  { to: '/more/scenarios', icon: GitBranch, title: 'Scenarios & compare', note: 'Branches, duplicates and side-by-side budgets' },
  { to: '/more/insights', icon: Lightbulb, title: 'Insights', note: 'Why a route is worth it' },
  { to: '/more/preferences', icon: SlidersHorizontal, title: 'Preferences', note: 'Budget, lodging, birthday, purchased ticket' },
];
export default function MorePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <div><p className="eyebrow">More</p><h1 className="display text-4xl font-semibold leading-tight">Everything else</h1></div>
      {ITEMS.map(({ to, icon: Icon, title, note }) => (
        <Link key={to} to={to} className="block">
          <Card className="flex min-h-16 items-center gap-3 hover:border-teal/50"><Icon size={22} className="shrink-0 text-teal" aria-hidden /><div className="min-w-0 flex-1"><p className="text-[16px] font-semibold">{title}</p><p className="text-sm text-ink-2">{note}</p></div><ChevronRight size={18} className="text-ink-2" aria-hidden /></Card>
        </Link>
      ))}
      <UserSwitchList />
    </div>
  );
}
