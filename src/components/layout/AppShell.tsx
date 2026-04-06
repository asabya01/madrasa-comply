import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSchool } from '../../hooks/useSchool';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/domains':          'Domains & Standards',
  '/evidence':         'Evidence Library',
  '/self-evaluation':  'Self-Evaluation Document',
  '/improvement-plan': 'Improvement Plan',
  '/audit-prep':       'Audit Preparation',
  '/reports':          'Reports',
  '/settings':         'Settings',
  '/admin':            'Admin Panel',
};

function getTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/domains/') && pathname.split('/').length === 3) return 'Domain Detail';
  if (pathname.startsWith('/domains/') && pathname.split('/').length === 4) return 'Standard Rating';
  return 'Madrasa Comply';
}

const Spinner = () => (
  <div className="flex h-screen bg-[#f7f6f2]">
    <div className="w-60 bg-[#0c4e54] shrink-0" />
    <div className="flex-1 flex items-center justify-center">
      <div className="text-sm text-[#6b7280]">Loading…</div>
    </div>
  </div>
);

export function AppShell() {
  const location = useLocation();
  const navigate  = useNavigate();
  const { isLoading, school, profile, error, needsOnboarding } = useSchool();

  useEffect(() => {
    if (needsOnboarding) {
      console.log('[AppShell] No active school membership — redirecting to onboarding');
      navigate('/onboarding', { replace: true });
    }
  }, [needsOnboarding, navigate]);

  // 1. Queries still in flight
  if (isLoading) return <Spinner />;

  // 2. Redirect pending — render nothing to avoid flash
  if (needsOnboarding) return null;

  if (error) console.error('[AppShell] Failed to load school data:', error);

  // 3. For non-super-admin users, the school must be available before we
  //    render any page. There is a single render tick between when the
  //    membership query resolves and when the useEffect in useSchool syncs
  //    the school into the Zustand store. Hold the spinner for that tick.
  if (!profile?.is_super_admin && !school) return <Spinner />;

  return (
    <div className="flex h-screen bg-[#f7f6f2]">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-60 min-h-screen overflow-hidden">
        <TopBar title={getTitle(location.pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
