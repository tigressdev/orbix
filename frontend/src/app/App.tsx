import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMeta, useSession, fetchState } from '@/services/api/queries';
import { ApiError } from '@/services/api/client';
import { useStudio } from '@/stores/studio';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorNote, Skeleton } from '@/components/ui/primitives';
import LoginPage from '@/features/preferences/LoginPage';

const JourneyPage = lazy(() => import('@/features/journey/JourneyPage'));
const ExplorePage = lazy(() => import('@/features/explore/ExplorePage'));
const AtlasPage = lazy(() => import('@/features/atlas/AtlasPage'));
const PulsePage = lazy(() => import('@/features/price-pulse/PulsePage'));
const MorePage = lazy(() => import('@/features/preferences/MorePage'));
const ScenariosPage = lazy(() => import('@/features/compare/ScenariosPage'));
const InsightsPage = lazy(() => import('@/features/insights/InsightsPage'));
const PreferencesPage = lazy(() => import('@/features/preferences/PreferencesPage'));
const SacredAtlasPage = lazy(() => import('@/features/sacred-atlas/SacredAtlasPage'));

const Loading = () => <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;

export default function App() {
  const session = useSession();
  const authed = !!session.data;
  const meta = useMeta(authed);
  const ready = useStudio((s) => s.ready);
  const hydrate = useStudio((s) => s.hydrate);
  const theme = useStudio((s) => s.prefs.theme);
  const state = useQuery({ queryKey: ['state', session.data?.user.id], enabled: authed && !!meta.data, queryFn: () => fetchState(), staleTime: Infinity, retry: false });

  useEffect(() => {
    if (session.data && meta.data && (state.data || state.isError) && !useStudio.getState().ready) hydrate(session.data.user.id, meta.data, state.data?.state ?? null);
  }, [session.data, meta.data, state.data, state.isError, hydrate]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  if (session.error instanceof ApiError && session.error.status === 401) return <LoginPage />;
  if (session.error) return <div className="p-4"><ErrorNote error={session.error} onRetry={() => session.refetch()} /></div>;
  if (meta.error instanceof ApiError && meta.error.status === 401) return <LoginPage message="Your session expired. Please sign in again." />;
  if (meta.error) return <div className="p-4"><ErrorNote error={meta.error} onRetry={() => meta.refetch()} /></div>;
  if (!session.data || !meta.data || !ready) return <Loading />;

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<AppShell session={session.data} />}>
            <Route index element={<JourneyPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="atlas" element={<AtlasPage />} />
            <Route path="pulse" element={<PulsePage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="more/scenarios" element={<ScenariosPage />} />
            <Route path="more/insights" element={<InsightsPage />} />
            <Route path="more/preferences" element={<PreferencesPage />} />
            <Route path="more/sacred" element={<SacredAtlasPage />} />
            <Route path="*" element={<JourneyPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
