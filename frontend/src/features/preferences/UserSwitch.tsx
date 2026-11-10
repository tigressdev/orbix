import { clsx } from 'clsx';
import { useStudio } from '@/stores/studio';
import { useMetaOrThrow } from '@/hooks/useStudioData';
import type { Session } from '@/types';

/** Two people, one studio: your own plans are editable; the other person's are view only (the server enforces it too). */
export function UserSwitch({ session }: { session: Session }) {
  const meta = useMetaOrThrow();
  const viewing = useStudio((s) => s.viewing);
  const open = useStudio((s) => s.openWorkspace);
  if (!session.auth || session.users.length < 2) return null;
  const me = session.user.id;
  return (
    <div role="group" aria-label="Whose plans" className="hidden rounded-full border border-line bg-surface p-0.5 sm:flex">
      {session.users.map((u) => (
        <button key={u.id} aria-pressed={viewing === u.id} onClick={() => viewing !== u.id && open(u.id, me, meta)}
          className={clsx('min-h-9 rounded-full px-3 text-xs font-semibold', viewing === u.id ? 'bg-teal text-white' : 'text-ink-2')}>
          {u.id === me ? u.name : `${u.name} · view`}
        </button>
      ))}
    </div>
  );
}
