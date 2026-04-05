import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';
import { formatDate } from '../lib/utils';
import type { ActionItem } from '../types';

const STATUS_COLUMNS = [
  { key: 'not_started', label: 'Not Started', color: 'bg-gray-100' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-blue-50' },
  { key: 'completed',   label: 'Completed',   color: 'bg-green-50' },
  { key: 'overdue',     label: 'Overdue',      color: 'bg-red-50' },
] as const;

type Status = typeof STATUS_COLUMNS[number]['key'];

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'overdue',     label: 'Overdue' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-[#a12c7b] text-white',
  high:     'bg-[#da7101] text-white',
  medium:   'bg-[#d19900] text-white',
  low:      'bg-[#437a22] text-white',
};

type ItemForm = {
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  due_date: string;
  indicator_id: string;
  success_metric: string;
};

const EMPTY_FORM: ItemForm = {
  title: '', description: '', priority: 'medium',
  due_date: '', indicator_id: '', success_metric: '',
};

export function ImprovementPlanPage() {
  const { school, academicYear, profile } = useSchoolStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [addOpen, setAddOpen]         = useState(false);
  const [editItem, setEditItem]       = useState<ActionItem | null>(null);
  const [deleteItem, setDeleteItem]   = useState<ActionItem | null>(null);
  const [form, setForm]               = useState<ItemForm>(EMPTY_FORM);
  const [editForm, setEditForm]       = useState<ItemForm>(EMPTY_FORM);

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['action-items'] });
    queryClient.invalidateQueries({ queryKey: ['action-items-widget'] });
    queryClient.invalidateQueries({ queryKey: ['action-stats'] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!school) return;
      const { error } = await supabase.from('action_items').insert({
        school_id:      school.id,
        title:          form.title,
        description:    form.description,
        priority:       form.priority,
        due_date:       form.due_date || null,
        indicator_id:   form.indicator_id || null,
        success_metric: form.success_metric,
        academic_year:  academicYear,
        created_by:     profile?.id,
        source:         'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setForm(EMPTY_FORM);
      showToast('Action item added', 'success');
    },
    onError: (e: Error) => showToast(`Failed to add: ${e.message}`, 'error'),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editItem) return;
      const { error } = await supabase.from('action_items').update({
        title:          editForm.title,
        description:    editForm.description,
        priority:       editForm.priority,
        due_date:       editForm.due_date || null,
        indicator_id:   editForm.indicator_id || null,
        success_metric: editForm.success_metric,
      }).eq('id', editItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditItem(null);
      showToast('Action updated', 'success');
    },
    onError: (e: Error) => showToast(`Failed to update: ${e.message}`, 'error'),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from('action_items').update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      showToast('Status updated', 'success');
    },
    onError: (e: Error) => showToast(`Failed: ${e.message}`, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('action_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setDeleteItem(null);
      showToast('Action deleted', 'success');
    },
    onError: (e: Error) => showToast(`Failed to delete: ${e.message}`, 'error'),
  });

  const total     = actions?.length || 0;
  const completed = actions?.filter((a) => a.status === 'completed').length || 0;
  const overdue   = actions?.filter((a) => a.status === 'overdue').length || 0;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-6 p-4 bg-white rounded-lg border border-[#e2e0db]">
        <div><span className="text-2xl font-bold text-[#1a1a1a]">{total}</span><span className="text-xs text-[#6b7280] ml-1">Total</span></div>
        <div><span className="text-2xl font-bold text-[#437a22]">{completed}</span><span className="text-xs text-[#6b7280] ml-1">Completed ({total ? Math.round(completed/total*100) : 0}%)</span></div>
        {overdue > 0 && <div><span className="text-2xl font-bold text-red-600">{overdue}</span><span className="text-xs text-[#6b7280] ml-1">Overdue</span></div>}
        <Button onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }} className="ml-auto gap-2">
          <Plus className="h-4 w-4" /> Add Action
        </Button>
      </div>

      {/* Kanban board */}
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
                  <ActionCard
                    key={action.id}
                    action={action}
                    onStatusChange={(status) => updateStatus.mutate({ id: action.id, status })}
                    onEdit={() => {
                      setEditItem(action);
                      setEditForm({
                        title:          action.title,
                        description:    action.description || '',
                        priority:       action.priority,
                        due_date:       action.due_date || '',
                        indicator_id:   action.indicator_id || '',
                        success_metric: action.success_metric || '',
                      });
                    }}
                    onDelete={() => setDeleteItem(action)}
                  />
                ))}
                {colActions.length === 0 && (
                  <p className="text-xs text-[#6b7280] text-center py-4">No items</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      <ActionFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Action Item"
        form={form}
        setForm={setForm}
        onSubmit={() => addMutation.mutate()}
        isPending={addMutation.isPending}
        submitLabel="Add Action"
      />

      {/* Edit Modal */}
      <ActionFormDialog
        open={!!editItem}
        onOpenChange={(v) => { if (!v) setEditItem(null); }}
        title="Edit Action Item"
        form={editForm}
        setForm={setEditForm}
        onSubmit={() => editMutation.mutate()}
        isPending={editMutation.isPending}
        submitLabel="Save Changes"
      />

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={(v) => { if (!v) setDeleteItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Action Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#6b7280]">
            Are you sure you want to delete <strong className="text-[#1a1a1a]">"{deleteItem?.title}"</strong>? This cannot be undone.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteItem(null)} className="flex-1">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Action Card ── */
function ActionCard({
  action,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  action: ActionItem;
  onStatusChange: (s: Status) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <p className="text-xs font-medium text-[#1a1a1a] leading-tight flex-1">{action.title}</p>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="text-[#6b7280] hover:text-[#01696f]" title="Edit">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={onDelete} className="text-[#6b7280] hover:text-red-500" title="Delete">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

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
          <div className={`flex items-center gap-1 text-xs mb-2 ${action.status === 'overdue' ? 'text-red-600' : 'text-[#6b7280]'}`}>
            {action.status === 'overdue' && <AlertTriangle className="h-3 w-3" />}
            <Calendar className="h-3 w-3" />
            {formatDate(action.due_date)}
          </div>
        )}

        {/* Status selector — move to any status */}
        <select
          className="w-full text-xs border border-[#e2e0db] rounded px-1.5 py-1 bg-white text-[#1a1a1a] mt-1"
          value={action.status}
          onChange={(e) => onStatusChange(e.target.value as Status)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </CardContent>
    </Card>
  );
}

/* ── Shared Add/Edit Form Dialog ── */
function ActionFormDialog({
  open, onOpenChange, title, form, setForm, onSubmit, isPending, submitLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  form: ItemForm;
  setForm: (f: ItemForm) => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Action title*"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#6b7280]">Priority</label>
              <select
                className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm mt-1"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as ItemForm['priority'] })}
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
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <Input
            placeholder="Indicator ID (e.g. 3.3.1)"
            value={form.indicator_id}
            onChange={(e) => setForm({ ...form, indicator_id: e.target.value })}
          />
          <Input
            placeholder="Success metric"
            value={form.success_metric}
            onChange={(e) => setForm({ ...form, success_metric: e.target.value })}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button onClick={onSubmit} disabled={!form.title || isPending} className="flex-1">
              {isPending ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
