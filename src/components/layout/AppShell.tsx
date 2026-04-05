import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSchool } from '../../hooks/useSchool';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/domains': 'Domains & Standards',
  '/evidence': 'Evidence Library',
  '/self-evaluation': 'Self-Evaluation Document',
  '/improvement-plan': 'Improvement Plan',
  '/audit-prep': 'Audit Preparation',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

function getTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/domains/') && pathname.split('/').length === 3) return 'Domain Detail';
  if (pathname.startsWith('/domains/') && pathname.split('/').length === 4) return 'Standard Rating';
  return 'Madrasa Comply';
}

export function AppShell() {
  const location = useLocation();
  // Bootstrap school/profile into Zustand store for the whole app
  useSchool();

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
