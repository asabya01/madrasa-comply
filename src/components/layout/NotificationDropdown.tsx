import { useState, useRef, useEffect } from 'react';
import { Bell, AlertTriangle, Clock, FileX, Calendar, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';

interface Notification {
  id: string;
  type: 'nui' | 'overdue' | 'evidence_gap' | 'audit';
  title: string;
  detail: string;
  href: string;
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { school } = useSchoolStore();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', school?.id],
    queryFn: async (): Promise<Notification[]> => {
      if (!school) return [];
      const results: Notification[] = [];

      // NUI indicators (rating = 5)
      const { data: nuiRatings } = await supabase
        .from('indicator_ratings')
        .select('indicator_id, rating')
        .eq('school_id', school.id)
        .eq('rating', 5);
      if (nuiRatings && nuiRatings.length > 0) {
        results.push({
          id: 'nui',
          type: 'nui',
          title: `${nuiRatings.length} NUI indicator${nuiRatings.length > 1 ? 's' : ''}`,
          detail: 'Needs Urgent Intervention — immediate action required',
          href: '/domains',
        });
      }

      // Overdue action items
      const today = new Date().toISOString().split('T')[0];
      const { data: overdueActions } = await supabase
        .from('action_items')
        .select('id')
        .eq('school_id', school.id)
        .or(`status.eq.overdue,and(due_date.lt.${today},status.neq.completed)`);
      if (overdueActions && overdueActions.length > 0) {
        results.push({
          id: 'overdue',
          type: 'overdue',
          title: `${overdueActions.length} overdue action${overdueActions.length > 1 ? 's' : ''}`,
          detail: 'Past due date and not yet completed',
          href: '/improvement-plan',
        });
      }

      // Evidence gaps (indicators with 0 linked files)
      const { data: indicators } = await supabase
        .from('indicators')
        .select('id');
      const { data: links } = await supabase
        .from('evidence_indicator_links')
        .select('indicator_id')
        .eq('school_id', school.id);
      const covered = new Set((links || []).map((l) => l.indicator_id));
      const gapCount = (indicators || []).filter((i) => !covered.has(i.id)).length;
      if (gapCount > 0) {
        results.push({
          id: 'gaps',
          type: 'evidence_gap',
          title: `${gapCount} indicator${gapCount > 1 ? 's' : ''} missing evidence`,
          detail: 'No evidence files linked to these indicators',
          href: '/evidence',
        });
      }

      // Audit date approaching within 30 days
      const { data: auditSettings } = await supabase
        .from('audit_settings')
        .select('expected_audit_date')
        .eq('school_id', school.id)
        .maybeSingle();
      if (auditSettings?.expected_audit_date) {
        const daysUntil = Math.ceil(
          (new Date(auditSettings.expected_audit_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntil > 0 && daysUntil <= 30) {
          results.push({
            id: 'audit',
            type: 'audit',
            title: `Audit in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
            detail: 'OAAAQA audit date is approaching — check readiness',
            href: '/audit-prep',
          });
        }
      }

      return results;
    },
    enabled: !!school,
    staleTime: 1000 * 60 * 5,
  });

  const ICON_MAP = {
    nui: <AlertTriangle className="h-4 w-4 text-[#a12c7b]" />,
    overdue: <Clock className="h-4 w-4 text-[#da7101]" />,
    evidence_gap: <FileX className="h-4 w-4 text-amber-500" />,
    audit: <Calendar className="h-4 w-4 text-[#006494]" />,
  };

  const COLOR_MAP = {
    nui: 'border-l-[#a12c7b]',
    overdue: 'border-l-[#da7101]',
    evidence_gap: 'border-l-amber-400',
    audit: 'border-l-[#006494]',
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1 text-[#6b7280] hover:text-[#1a1a1a]"
      >
        <Bell className="h-5 w-5" />
        {notifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-80 bg-white border border-[#e2e0db] rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e0db]">
            <span className="text-sm font-semibold text-[#1a1a1a]">Alerts</span>
            <button onClick={() => setOpen(false)} className="text-[#6b7280] hover:text-[#1a1a1a]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-[#6b7280]">All clear — no alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-[#e2e0db] max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  to={n.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-l-2 ${COLOR_MAP[n.type]}`}
                >
                  <div className="mt-0.5 shrink-0">{ICON_MAP[n.type]}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1a1a1a]">{n.title}</p>
                    <p className="text-xs text-[#6b7280] mt-0.5 leading-tight">{n.detail}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
