import { Outlet, Navigate } from 'react-router-dom';
import { SuperAdminSidebar } from './SuperAdminSidebar';
import { useSchool } from '../../hooks/useSchool';

export function SuperAdminShell() {
  const { profile, isLoading } = useSchool();

  if (isLoading) {
    return (
      <div className="flex h-screen bg-[#0f0720]">
        <div className="w-60 bg-[#1a0a2e] shrink-0" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-white/40">Loading…</div>
        </div>
      </div>
    );
  }

  // Non-super-admins get redirected to the regular dashboard
  if (profile && !profile.is_super_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-screen bg-[#f7f6f2]">
      <SuperAdminSidebar />
      <div className="flex-1 flex flex-col ml-60 min-h-screen overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
