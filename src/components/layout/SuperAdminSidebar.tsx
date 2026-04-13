import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut, ShieldAlert, GitBranch,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

export function SuperAdminSidebar() {
  const navigate  = useNavigate();
  const location  = useLocation();

  const onSuperAdmin = location.pathname === '/super-admin';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#1a0a2e] text-white flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
        <ShieldAlert className="h-7 w-7 text-purple-400 shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-sm">Madrasa Comply</div>
          <div className="text-xs text-purple-300">Super Admin</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {/* Overview — always visible, active when on /super-admin */}
        <button
          onClick={() => navigate('/super-admin')}
          className={cn(
            'flex items-center gap-3 w-full px-5 py-2.5 text-sm transition-colors text-left',
            onSuperAdmin
              ? 'bg-white/20 text-white font-medium'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Overview
        </button>
      </nav>

      {/* Framework Versions — route-based */}
      <div className="border-t border-white/10 pt-2 pb-1">
        <NavLink
          to="/framework-versions"
          className={({ isActive }) => cn(
            'flex items-center gap-3 w-full px-5 py-2.5 text-sm transition-colors',
            isActive
              ? 'bg-white/20 text-white font-medium'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <GitBranch className="h-4 w-4 shrink-0" />
          Framework Versions
        </NavLink>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <NavLink
          to="/dashboard"
          className="flex items-center gap-3 w-full px-2 py-2 text-sm text-purple-300 hover:text-white transition-colors mb-1"
        >
          <LayoutDashboard className="h-4 w-4" />
          Switch to School View
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-2 py-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
