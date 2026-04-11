import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSchool } from '../../hooks/useSchool';
import { useSchoolStore } from '../../stores/schoolStore';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/teacher-home':     'Home',
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
  const location  = useLocation();
  const navigate  = useNavigate();
  const { isLoading, school, profile, error, needsOnboarding } = useSchool();
  const { impersonating, exitImpersonation, userRole } = useSchoolStore();

  useEffect(() => {
    if (needsOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [needsOnboarding, navigate]);

  // Teachers always land on their personalised homepage, not the admin dashboard
  useEffect(() => {
    if (!isLoading && userRole === 'teacher' && location.pathname === '/dashboard') {
      navigate('/teacher-home', { replace: true });
    }
  }, [isLoading, userRole, location.pathname, navigate]);

  // 1. Queries still in flight
  if (isLoading) return <Spinner />;

  // 2. Redirect pending
  if (needsOnboarding) return null;

  if (error) console.error('[AppShell] Failed to load school data:', error);

  // 3. Super admin without impersonation → their home is /super-admin
  if (profile?.is_super_admin && !impersonating) {
    return <Navigate to="/super-admin" replace />;
  }

  // 4. Regular user (or impersonating super admin) must have school loaded
  if (!impersonating && !school) return <Spinner />;

  return (
    <div className="flex h-screen bg-[#f7f6f2]">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-60 min-h-screen overflow-hidden">
        {/* Impersonation banner */}
        {impersonating && (
          <div className="flex items-center justify-between px-5 py-2 bg-orange-500 text-white text-sm shrink-0">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>
                Viewing as <strong>{impersonating.name_en}</strong> — Super Admin Mode
              </span>
            </div>
            <button
              onClick={() => { exitImpersonation(); navigate('/super-admin', { replace: true }); }}
              className="flex items-center gap-1.5 text-white/80 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
              Exit
            </button>
          </div>
        )}

        <TopBar title={getTitle(location.pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
