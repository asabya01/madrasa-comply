import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';
import { Button } from '../ui/button';
import { formatDate } from '../../lib/utils';
import type { ActionItem } from '../../types';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-[#a12c7b]',
  high: 'text-[#da7101]',
  medium: 'text-[#d19900]',
  low: 'text-[#437a22]',
};

export function ActionItemsWidget() {
  const { school } = useSchoolStore();
  const queryClient = useQueryClient();

  const { data: actions } = useQuery({
    queryKey: ['action-items-widget', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase
        .from('action_items')
        .select('*')
        .eq('school_id', school.id)
        .in('status', ['not_started', 'in_progress', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(5);
      return (data || []) as ActionItem[];
    },
    enabled: !!school,
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('action_items')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-items-widget'] }),
  });

  if (!actions?.length) {
    return <p className="text-sm text-[#6b7280]">No pending action items.</p>;
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <div key={action.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-[#e2e0db] bg-white">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {action.status === 'overdue' && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
              <p className="text-sm font-medium text-[#1a1a1a] truncate">{action.title}</p>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-medium ${PRIORITY_COLORS[action.priority]}`}>
                {action.priority}
              </span>
              {action.due_date && (
                <span className={`text-xs ${action.status === 'overdue' ? 'text-red-500' : 'text-[#6b7280]'}`}>
                  Due {formatDate(action.due_date)}
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 h-7 w-7 p-0"
            onClick={() => completeMutation.mutate(action.id)}
            title="Mark complete"
          >
            <CheckCircle className="h-4 w-4 text-[#437a22]" />
          </Button>
        </div>
      ))}
    </div>
  );
}
