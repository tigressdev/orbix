import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card } from '@/components/ui/primitives';
import { useMetaOrThrow } from '@/hooks/useStudioData';
import { useStudio } from '@/stores/studio';
import { fromUsd, toUsd } from '@/lib/format';

const schema = z.object({
  budget: z.number({ error: 'Enter a number' }).positive('Must be greater than zero').max(10_000_000),
  lodging: z.enum(['hostel', 'budget', 'mid']),
});
type Form = z.infer<typeof schema>;

export default function PreferencesPage() {
  const meta = useMetaOrThrow();
  const prefs = useStudio((s) => s.prefs);
  const setPref = useStudio((s) => s.setPref);
  const viewOnly = useStudio((s) => s.viewOnly);
  const reset = useStudio((s) => s.reset);
  const shown = Math.round(fromUsd(meta.fx, prefs.budget, prefs.currency));
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<Form>({ resolver: zodResolver(schema), values: { budget: shown, lodging: prefs.lodging } });
  const onSubmit = (v: Form) => { setPref('budget', toUsd(meta.fx, v.budget, prefs.currency)); setPref('lodging', v.lodging); };
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div><p className="eyebrow">Preferences</p><h1 className="display text-4xl font-semibold leading-tight">Your assumptions</h1></div>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Card className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">Total budget ({prefs.currency})
            <input type="number" inputMode="decimal" step="any" disabled={viewOnly} aria-invalid={!!errors.budget} {...register('budget', { valueAsNumber: true })} className="num min-h-12 rounded-xl border border-line bg-surface px-3 text-lg" />
            {errors.budget && <span role="alert" className="text-sm text-bad">{errors.budget.message}</span>}
            <span className="text-xs font-normal text-ink-2">Stored in USD, shown in your display currency.</span>
          </label>
          <fieldset className="flex flex-col gap-2" disabled={viewOnly}>
            <legend className="text-sm font-medium">Accommodation level</legend>
            {(['hostel', 'budget', 'mid'] as const).map((t) => (
              <label key={t} className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-3 text-[15px]">
                <input type="radio" value={t} className="size-5 accent-[var(--teal)]" {...register('lodging')} />
                <span className="capitalize">{t}</span><span className="text-xs text-ink-2">{t === 'hostel' ? 'dorm bed, per person' : t === 'budget' ? 'private room, 2★' : 'private room, 3★'}</span>
              </label>
            ))}
            <p className="text-xs text-ink-2">Private rooms in China are split between two people; Moscow is free (hosted). Rates are guide-based estimates, not live hotel prices.</p>
          </fieldset>
          <Button type="submit" variant="primary" disabled={viewOnly || !isDirty}>Save preferences</Button>
        </Card>
      </form>
      <Card className="flex flex-col gap-3">
        <label className="flex min-h-11 items-center justify-between gap-3 text-[15px]"><span>Protect my birthday (14 March)</span><input type="checkbox" className="size-6 accent-[var(--teal)]" checked={prefs.protectBirthday} disabled={viewOnly} onChange={(e) => setPref('protectBirthday', e.target.checked)} /></label>
        {meta.is_owner && <label className="flex min-h-11 items-center justify-between gap-3 text-[15px]"><span>Include the purchased ticket in the budget</span><input type="checkbox" className="size-6 accent-[var(--teal)]" checked={prefs.includePurchased} disabled={viewOnly} onChange={(e) => setPref('includePurchased', e.target.checked)} /></label>}
      </Card>
      <Card className="text-sm text-ink-2"><p><b className="text-ink">Data</b>: {meta.data.map((d) => `${d.p}: ${d.offers} offers`).join(' · ') || 'no data'} · state saved in {meta.state_backend}.</p></Card>
      {!viewOnly && <Button variant="danger" onClick={() => { if (confirm('Start a fresh exploration? Your scenarios will be cleared.')) reset(); }}>Start a fresh exploration</Button>}
    </div>
  );
}
