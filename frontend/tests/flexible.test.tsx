import { useState } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FlexibleDateSelector } from '@/components/shared/FlexibleDateSelector';
import { api } from '@/services/api/client';

vi.mock('@/hooks/useStudioData', () => ({ useParams: () => ({ protect_birthday: true }), useMoney: () => (n: number) => `$${n}` }));
const days = [
  { date: '2027-03-12', status: 'observed', min_price: 125, offers: 2, observed_at: '2026-11-11T12:00Z', preferred: true, url: 'https://example.org/12' },
  { date: '2027-03-13', status: 'missing', preferred: false, url: 'https://example.org/13' },
  { date: '2027-03-14', status: 'protected', preferred: false, url: 'https://example.org/14' },
  { date: '2027-03-15', status: 'stale', observed_at: '2026-10-01T12:00Z', preferred: false, url: 'https://example.org/15' },
];
let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });
function Harness() {
  const [value, onChange] = useState({ preferred: '2027-03-12', flex: 2 });
  return <FlexibleDateSelector from="MOSCOW" to="ISTANBUL" value={value} onChange={onChange} />;
}
const mount = () => render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);

it('uses the coverage contract, exposes freshness and never prices missing or stale quotations as zero', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({ from_name: 'Moscow', to_name: 'Istanbul', days, research_only: null });
  mount();
  expect(await screen.findByText('$125')).toBeVisible();
  expect(screen.getAllByText('Needs quotation')).toHaveLength(2);
  expect(screen.queryByText('$0')).toBeNull();
  expect(screen.getByText('Observed 2026-10-01')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Prefer 2027-03-14' })).toBeDisabled();
  expect(post).toHaveBeenCalledWith('/api/flex/coverage', expect.objectContaining({ from: 'MOSCOW', to: 'ISTANBUL', preferred: '2027-03-12', flex: 2, hard_max: '2027-03-25' }));
  fireEvent.change(screen.getByLabelText('Flexibility'), { target: { value: '0' } });
  await waitFor(() => expect(post).toHaveBeenLastCalledWith('/api/flex/coverage', expect.objectContaining({ flex: 0 })));
  fireEvent.change(screen.getByLabelText('Flexibility'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('Days either side (0–7)'), { target: { value: '6' } });
  await waitFor(() => expect(post).toHaveBeenLastCalledWith('/api/flex/coverage', expect.objectContaining({ flex: 6 })));
});

it('reports a failed request and can retry instead of exposing stale prices', async () => {
  vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Coverage unavailable')).mockResolvedValue({ from_name: 'Moscow', to_name: 'Istanbul', days: [], research_only: null });
  mount();
  expect(await screen.findByText('Coverage unavailable')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry coverage' }));
  expect(await screen.findByText('No candidate dates inside the hard limits.')).toBeVisible();
});
