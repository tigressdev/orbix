import { Card } from '@/components/ui/primitives';
import { useQueryClient } from '@tanstack/react-query';
import { useStudio } from '@/stores/studio';
import { useMetaOrThrow } from '@/hooks/useStudioData';
import type { Session } from '@/types';

/** Phone version of the "whose plans" switch (the header one is hidden on narrow screens). */
export function UserSwitchList() {
  const qc = useQueryClient();
  const meta = useMetaOrThrow();
  const session = qc.getQueryData<Session>(['session']);
  const viewing = useStudio((s) => s.viewing);
  const open = useStudio((s) => s.openWorkspace);
  if (!session?.auth || session.users.length < 2) return null;
  return (
    <Card className="flex flex-col gap-2">
      <p className="eyebrow">Whose plans</p>
      {session.users.map((u) => (
        <button key={u.id} aria-pressed={viewing === u.id} onClick={() => viewing !== u.id && open(u.id, session.user.id, meta)}
          className={`flex min-h-12 items-center justify-between rounded-xl border px-3 text-[15px] font-medium ${viewing === u.id ? 'border-teal bg-teal-soft text-teal' : 'border-line'}`}>
          <span>{u.name}{u.id === session.user.id ? ' (you)' : ''}</span><span className="text-xs text-ink-2">{u.id === session.user.id ? 'editable' : 'view only'}</span>
        </button>
      ))}
    </Card>
  );
}
