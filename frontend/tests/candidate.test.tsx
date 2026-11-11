import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CandidateCard } from '@/features/explore/CandidateCard';
import { api, ApiError } from '@/services/api/client';
import { localRequests, type Candidate } from '@/services/api/discover';

vi.mock('@/hooks/useStudioData', () => ({ useParams: () => ({ protect_birthday: true }), useMoney: () => (n: number) => `$${n}` }));

const job = (date: string) => ({ origin_city: 'BEIJING', dest_city: 'DALI', date, status: 'missing' as const, score: 0.5, kind: 'required' as const,
  components: {}, sources: ['context'], requested: false, research_only: false, exploration: false, url: `https://example.org/${date}` });
const base: Candidate = {
  city: 'DALI', name: 'Dali', country: 'China', tag: 'Old town', interest: 7, why_listed: 'Elsewhere in China', state: 'missing', required: false,
  research_only: null, preferred: '2027-02-18', flex: 2, observed_count: 0, min_price: null, stay_days: [1, 7],
  dates: [
    { date: '2027-02-18', status: 'missing', in_flex: true, preferred: true, url: 'https://example.org/18' },
    { date: '2027-02-19', status: 'stale', in_flex: true, preferred: false, observed_at: '2026-10-01T12:00Z', url: 'https://example.org/19' },
  ],
  excluded: {}, jobs: [job('2027-02-18'), job('2027-02-19')],
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('lets a destination without fares be explored and requested, never booked or priced', async () => {
  const post = vi.spyOn(api, 'post').mockRejectedValue(new ApiError('read-only', 501));
  render(<CandidateCard c={base} label="From Beijing" />);
  expect(screen.getByText('Needs quotes')).toBeVisible();
  expect(screen.queryByRole('button', { name: /add/i })).toBeNull();               // not bookable
  expect(screen.queryByText(/\$0/)).toBeNull();                                   // a missing fare is never shown as zero
  fireEvent.click(screen.getByRole('button', { name: /Search flexible dates/ }));
  expect(screen.getByText('Needs quotation')).toBeVisible();
  expect(screen.getByText('Last quoted 2026-10-01')).toBeVisible();
  expect(screen.getAllByRole('link', { name: /Check live fare/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: /Request quotes/ }));
  expect(await screen.findByText(/Saved in this browser/)).toBeVisible();
  expect(post).toHaveBeenCalledWith('/api/quote-requests', expect.objectContaining({ jobs: [
    { origin_city: 'BEIJING', dest_city: 'DALI', date: '2027-02-18' }, { origin_city: 'BEIJING', dest_city: 'DALI', date: '2027-02-19' }] }));
  expect(localRequests().map((r) => r.date)).toEqual(['2027-02-18', '2027-02-19']);
});

it('explains a blocked destination instead of hiding it', () => {
  render(<CandidateCard c={{ ...base, city: 'MOSCOW', name: 'Moscow', required: true, state: 'temporally_blocked', dates: [], jobs: [],
    excluded: { 'Outside the arrival window (03-12 to 03-16)': [] } }} label="From Beijing" />);
  expect(screen.getByText('Required')).toBeVisible();
  expect(screen.getByText('No date fits')).toBeVisible();
  expect(screen.getByText('Outside the arrival window (03-12 to 03-16)')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Request quotes/ })).toBeNull();
});

it('offers the observed flights when a fare exists, and keeps research-only routes flagged', () => {
  const see = vi.fn();
  render(<CandidateCard c={{ ...base, state: 'research_only', research_only: 'Safety restricted — research only.' }} label="x" onSeeFlights={see} />);
  expect(screen.getByText('Research only')).toBeVisible();
  expect(screen.getByText('Safety restricted — research only.')).toBeVisible();
  cleanup();
  render(<CandidateCard c={{ ...base, state: 'observed', observed_count: 1, min_price: 126 }} label="x" onSeeFlights={see} />);
  fireEvent.click(screen.getByRole('button', { name: 'See observed flights' }));
  expect(see).toHaveBeenCalledWith('DALI');
});
