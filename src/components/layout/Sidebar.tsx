import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, FileText, FolderOpen, ClipboardList,
  CheckSquare, BarChart3, Settings, LogOut, Shield, ShieldAlert,
  ChevronDown, Building2,
} from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';
import { useSchool } from '../../hooks/useSchool';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/domains',          icon: BookOpen,         label: 'Domains & Standards' },
  { to: '/evidence',         icon: FolderOpen,       label: 'Evidence Library' },
  { to: '/self-evaluation',  icon: FileText,         label: 'Self-Evaluation' },
  { to: '/improvement-plan', icon: ClipboardList,    label: 'Improvement Plan' },
  { to: '/audit-prep',       icon: CheckSquare,      label: 'Audit Preparation' },
  { to: '/reports',          icon: BarChart3,        label: 'Reports' },
  { to: '/settings',         icon: Settings,         label: 'Settings' },
];

export function Sidebar() {
  const { school, profile } = useSchoolStore();
  const { allMemberships, switchSchool } = useSchool();
  const [schoolMenuOpen, setSchoolMenuOpen] = useState(false);

  const isSuperAdmin = profile?.is_super_admin ?? false;
  const multiSchool  = allMemberships.length > 1;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#0c4e54] text-white flex flex-col z-40">
      {/* Logo + school name / switcher */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-white shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-sm">Madrasa Comply</div>
            <div className="text-xs text-white/60 truncate">
              {isSuperAdmin ? 'Platform Admin' : (school?.name || 'Loading…')}
            </div>
          </div>
        </div>

        {/* School switcher — only shown when user belongs to multiple schools */}
        {multiSchool && (
          <div className="mt-3 relative">
            <button
              onClick={() => setSchoolMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 w-full text-xs text-white/70 hover:text-white transition-colors"
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1 text-left">Switch school</span>
              <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', schoolMenuOpen && 'rotate-180')} />
            </button>

            {schoolMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-full bg-[#0a3d42] border border-white/10 rounded-md shadow-lg z-50">
                {allMemberships.map((m) => {
                  const memberSchool = m.school as { name: string } | undefined;
                  return (
                    <button
                      key={m.school_id}
                      onClick={() => { switchSchool(m.school_id); setSchoolMenuOpen(false); }}
                      className={cn(
                        'block w-full text-left px-3 py-2 text-xs transition-colors',
                        m.school_id === school?.id
                          ? 'text-white bg-white/10'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      )}
                    >
                      {memberSchool?.name ?? m.school_id}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {/* Admin Panel link — only for super admins */}
        {isSuperAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-b border-white/10 mb-1',
                isActive
                  ? 'bg-white/20 text-white font-medium'
                  : 'text-amber-300 hover:bg-white/10 hover:text-white'
              )
            }
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Admin Panel
          </NavLink>
        )}

        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
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
