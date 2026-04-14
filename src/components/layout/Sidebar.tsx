import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, FileText, FolderOpen, ClipboardList,
  CheckSquare, BarChart3, Settings, LogOut, Shield, ShieldAlert,
  ChevronDown, Building2, ClipboardCheck, Award, TrendingUp, Users, Home,
  MessageSquare, CalendarCheck, GraduationCap, Upload, UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';
import { useSchool } from '../../hooks/useSchool';
import { usePermissions } from '../../hooks/usePermissions';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/utils';
import { NotificationBell } from '../NotificationBell';

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  /** Roles allowed to see this item. Omit = everyone (school-level users) */
  roles?: ('teacher' | 'hod' | 'school_admin' | 'super_admin' | 'chain_admin')[];
}

const NAV_ITEMS: NavItem[] = [
  // Teacher-specific nav
  { to: '/teacher-home',       icon: Home,            label: 'Home',                 roles: ['teacher'] },
  { to: '/teacher-assessment', icon: ClipboardCheck,  label: 'Self-Assessment',      roles: ['teacher'] },
  // Chain admin / super admin cross-school view
  { to: '/chain-dashboard',    icon: Building2,       label: 'Chain Dashboard',      roles: ['chain_admin', 'super_admin'] },
  // Admin / HOD nav
  { to: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard',            roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/domains',            icon: BookOpen,        label: 'Domains & Standards',  roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/self-evaluation',    icon: FileText,        label: 'Self-Evaluation',      roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/observations',       icon: ClipboardCheck,  label: 'Observations',         roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/cpd-log',            icon: GraduationCap,   label: 'CPD Log',              roles: ['teacher', 'hod', 'school_admin', 'super_admin'] },
  { to: '/appraisals',         icon: UserCheck,       label: 'Appraisals',           roles: ['teacher', 'hod', 'school_admin', 'super_admin'] },
  { to: '/benchmarking',       icon: BarChart3,       label: 'Benchmarking',         roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/judgements',         icon: Award,           label: 'Judgements',           roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/surveys',            icon: MessageSquare,   label: 'Surveys',              roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/performance-data',   icon: TrendingUp,      label: 'Performance Data',     roles: ['school_admin', 'super_admin'] },
  { to: '/student-import',     icon: Upload,          label: 'Import Data',          roles: ['school_admin', 'super_admin'] },
  { to: '/evidence',           icon: FolderOpen,      label: 'Evidence Library',     roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/improvement-plan',   icon: ClipboardList,   label: 'Improvement Plan',     roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/audit-prep',         icon: CheckSquare,     label: 'Audit Preparation',    roles: ['school_admin', 'super_admin'] },
  { to: '/review-visits',      icon: CalendarCheck,   label: 'Review Visits',         roles: ['school_admin', 'super_admin'] },
  { to: '/governance',         icon: Shield,          label: 'Governance',            roles: ['school_admin', 'super_admin'] },
  { to: '/reports',            icon: BarChart3,       label: 'Reports',              roles: ['hod', 'school_admin', 'super_admin'] },
  { to: '/settings',           icon: Settings,        label: 'Settings',             roles: ['school_admin', 'super_admin'] },
  { to: '/school-users',       icon: Users,           label: 'School Users',         roles: ['hod', 'school_admin', 'super_admin'] },
];

export function Sidebar() {
  const { school, profile } = useSchoolStore();
  const { allMemberships, switchSchool } = useSchool();
  const { isSuperAdmin, isSchoolAdmin, isHOD, isTeacher, isChainAdmin } = usePermissions();
  const { isOnline, pendingCount } = useOfflineQueue();
  const { rtl, setLanguage } = useUIStore();
  const { t } = useTranslation();
  const [schoolMenuOpen, setSchoolMenuOpen] = useState(false);

  const multiSchool = allMemberships.length > 1;

  // Derive which abstract role bucket this user falls into
  const roleBucket: 'super_admin' | 'school_admin' | 'hod' | 'teacher' | 'chain_admin' =
    isSuperAdmin  ? 'super_admin'  :
    isChainAdmin  ? 'chain_admin'  :
    isSchoolAdmin ? 'school_admin' :
    isHOD         ? 'hod'          :
    isTeacher     ? 'teacher'      :
    'school_admin'; // fallback — show everything rather than nothing

  function canSee(item: NavItem): boolean {
    if (!item.roles) return true; // no restriction = everyone
    return item.roles.includes(roleBucket);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#0c4e54] text-white flex flex-col z-40 rtl:left-auto rtl:right-0">
      {/* Logo + school name / switcher */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-white shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm">Madrasa Comply</div>
            <div className="text-xs text-white/60 truncate">
              {isSuperAdmin ? 'Platform Admin' : (school?.name_en || 'Loading…')}
            </div>
          </div>
          <NotificationBell />
        </div>

        {/* Offline indicator */}
        {!isOnline && (
          <div className="mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1 w-fit">
              <span className="leading-none">●</span>
              {pendingCount > 0 ? `Offline · ${pendingCount} pending` : 'Offline'}
            </span>
          </div>
        )}

        {/* Language toggle */}
        <div className="mt-2">
          <button
            onClick={() => setLanguage(rtl ? 'en' : 'ar')}
            className="text-xs px-2 py-0.5 rounded-full border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
          >
            {t('nav.language')}
          </button>
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
                  const memberSchool = m.school as { name_en: string } | undefined;
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
                      {memberSchool?.name_en ?? m.school_id}
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
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-b border-white/10 mb-1 rtl:flex-row-reverse',
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

        {/* Role-filtered nav items */}
        {NAV_ITEMS.filter(canSee).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors rtl:flex-row-reverse',
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

      {/* User info + logout */}
      <div className="p-4 border-t border-white/10">
        {profile?.full_name && (
          <div className="text-xs text-white/50 truncate mb-2 px-2">{profile.full_name}</div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-2 py-2 text-sm text-white/70 hover:text-white transition-colors rtl:flex-row-reverse"
        >
          <LogOut className="h-4 w-4" />
          {t('nav.signOut')}
        </button>
      </div>
    </aside>
  );
}
