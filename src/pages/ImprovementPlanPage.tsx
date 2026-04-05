import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useSchoolStore } from '../stores/schoolStore';
import { formatDate } from '../lib/utils';
import type { ActionItem } from '../types';

const STATUS_COLUMNS = [
  { key: 'not_started', label: 'Not Started', color: 'bg-gray-100' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-blue-50' },
  { key: 'completed', label: 'Completed', color: 'bg-green-50' },
  { key: 'overdue', label: 'Overdue', color: 'bg-red-50' },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-[#a12c7b] text-white',
  high: 'bg-[#da7101] text-white',
  medium: 'bg-[#d19900] text-white',
  low: 'bg-[#437a22] text-white',
};

export function ImprovementPlanPage() {
  const { school, academicYear, profile } = useSchoolStore();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [newItem, setNewItem] = useState<{
    title: string; description: string; priority: 'critical' | 'high' | 'medium' | 'low';
    due_date: string; indicator_id: string; success_metric: string;
  }>({
    title: '', description: '', priority: 'medium',
    due_date: '', indicator_id: '', success_metric: '',
  });

  const { data: actions } = useQuery({
    queryKey: ['action-items', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase
        .from('action_items')
        .select('*')
        .eq('school_id', school.id)
        .order('created_at', { ascending: false });
      return (data || []) as ActionItem[];
    },
    enabled: !!school,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!school) return;
      await supabase.from('action_items').insert({
        school_id: school.id,
        title: newItem.title,
        description: newItem.description,
        priority: newItem.priority,
        due_date: newItem.due_date || null,
        indicator_id: newItem.indicator_id || null,
        success_metric: newItem.success_metric,
        academic_year: academicYear,
        created_by: profile?.id,
        source: 'manual',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items'] });
      queryClient.invalidateQueries({ queryKey: ['action-items-widget'] });
      queryClient.invalidateQueries({ queryKey: ['action-stats'] });
      setModalOpen(false);
      setNewItem({ title: '', description: '', priority: 'medium', due_date: '', indicator_id: '', success_metric: '' });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from('action_items').update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-items'] }),
  });

  const total = actions?.length || 0;
  const completed = actions?.filter((a) => a.status === 'completed').length || 0;
  const overdue = actions?.filter((a) => a.status === 'overdue').length || 0;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-6 p-4 bg-white rounded-lg border border-[#e2e0db]">
        <div><span className="text-2xl font-bold text-[#1a1a1a]">{total}</span><span className="text-xs text-[#6b7280] ml-1">Total</span></div>
        <div><span className="text-2xl font-bold text-[#437a22]">{completed}</span><span className="text-xs text-[#6b7280] ml-1">Completed ({total ? Math.round(completed/total*100) : 0}%)</span></div>
        {overdue > 0 && <div><span className="text-2xl font-bold text-red-600">{overdue}</span><span className="text-xs text-[#6b7280] ml-1">Overdue</span></div>}
        <Button onClick={() => setModalOpen(true)} className="ml-auto gap-2">
          <Plus className="h-4 w-4" /> Add Action
        </Button>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATUS_COLUMNS.map((col) => {
          const colActions = (actions || []).filter((a) => a.status === col.key);
          return (
            <div key={col.key} className={`rounded-lg p-3 ${col.color} min-h-[200px]`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#1a1a1a]">{col.label}</h3>
                <span className="text-xs text-[#6b7280]">{colActions.length}</span>
              </div>
              <div className="space-y-2">
                {colActions.map((action) => (
                  <Card key={action.id} className="shadow-none">
                    <CardContent className="p-3">
                      <p className="text-xs font-medium text-[#1a1a1a] mb-1.5">{action.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLORS[action.priority]}`}>
                          {action.priority}
                        </span>
                        {action.indicator_id && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            {action.indicator_id}
                          </span>
                        )}
                      </div>
                      {action.due_date && (
                        <div className={`flex items-center gap-1 text-xs ${action.status === 'overdue' ? 'text-red-600' : 'text-[#6b7280]'}`}>
                          {action.status === 'overdue' && <AlertTriangle className="h-3 w-3" />}
                          <Calendar className="h-3 w-3" />
                          {formatDate(action.due_date)}
                        </div>
                      )}
                      {/* Status change */}
                      {action.status !== 'completed' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: action.id, status: action.status === 'not_started' ? 'in_progress' : 'completed' })}
                          className="mt-2 text-xs text-[#01696f] hover:underline flex items-center gap-1"
                        >
                          {action.status === 'not_started' ? 'Start' : 'Complete'}
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {colActions.length === 0 && (
                  <p className="text-xs text-[#6b7280] text-center py-4">No items</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Action Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Action Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Action title*"
              value={newItem.title}
              onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
            />
            <Textarea
              placeholder="Description"
              value={newItem.description}
              onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#6b7280]">Priority</label>
                <select
                  className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm mt-1"
                  value={newItem.priority}
                  onChange={(e) => setNewItem({ ...newItem, priority: e.target.value as 'critical' | 'high' | 'medium' | 'low' })}
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#6b7280]">Due Date</label>
                <Input
                  type="date"
                  value={newItem.due_date}
                  onChange={(e) => setNewItem({ ...newItem, due_date: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <Input
              placeholder="Indicator ID (e.g. 3.3.1)"
              value={newItem.indicator_id}
              onChange={(e) => setNewItem({ ...newItem, indicator_id: e.target.value })}
            />
            <Input
              placeholder="Success metric"
              value={newItem.success_metric}
              onChange={(e) => setNewItem({ ...newItem, success_metric: e.target.value })}
            />
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={() => addMutation.mutate()} disabled={!newItem.title || addMutation.isPending} className="flex-1">
                {addMutation.isPending ? 'Adding...' : 'Add Action'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
