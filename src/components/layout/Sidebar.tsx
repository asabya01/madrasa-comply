import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, FileText, FolderOpen, ClipboardList,
  CheckSquare, BarChart3, Settings, LogOut, Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/domains', icon: BookOpen, label: 'Domains & Standards' },
  { to: '/evidence', icon: FolderOpen, label: 'Evidence Library' },
  { to: '/self-evaluation', icon: FileText, label: 'Self-Evaluation' },
  { to: '/improvement-plan', icon: ClipboardList, label: 'Improvement Plan' },
  { to: '/audit-prep', icon: CheckSquare, label: 'Audit Preparation' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { school } = useSchoolStore();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#0c4e54] text-white flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
        <Shield className="h-7 w-7 text-white" />
        <div>
          <div className="font-semibold text-sm">Madrasa Comply</div>
          <div className="text-xs text-white/60 truncate max-w-[140px]">
            {school?.name_en || 'Loading...'}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-white/20 text-white font-medium'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-2 py-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
