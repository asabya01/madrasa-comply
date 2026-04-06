import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import type { ActionItem, Domain, Indicator } from '../types';

type Status = 'not_started' | 'in_progress' | 'completed' | 'overdue';
type Priority = 'critical' | 'high' | 'medium' | 'low';

const STATUS_COLUMNS: { key: Status; label: string; color: string }[] = [
  { key: 'not_started', label: 'Not Started', color: 'bg-gray-100' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-blue-50' },
  { key: 'completed', label: 'Completed', color: 'bg-green-50' },
  { key: 'overdue', label: 'Overdue', color: 'bg-red-50' },
];

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

interface ActionForm {
  id?: string;           // present = edit mode
  title: string;
  description: string;
  indicator_id: string;
  domain_id: string;
  owner_id: string;
  due_date: string;
  status: Status;
  priority: Priority;
  success_metric: string;
  academic_year: string;
}

const EMPTY_FORM: ActionForm = {
  title: '',
  description: '',
  indicator_id: '',
  domain_id: '',
  owner_id: '',
  due_date: '',
  status: 'not_started',
  priority: 'medium',
  success_metric: '',
  academic_year: '2024-2025',
};

export default function ImprovementPlanPage() {
  const { school, profile } = useSchoolStore();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ActionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');

  useEffect(() => {
    if (school?.id) {
      loadActions();
      loadFramework();
    }
  }, [school?.id]);

  async function loadActions() {
    if (!school?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('action_items')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });
    if (!error) setActions(data || []);
    setLoading(false);
  }

  async function loadFramework() {
    const [{ data: d }, { data: i }] = await Promise.all([
      supabase.from('domains').select('*').order('order_num'),
      supabase.from('indicators').select('id, description_en, domain_id, standard_id').order('order_num'),
    ]);
    if (d) setDomains(d);
    if (i) setIndicators(i as Indicator[]);
  }

  // ── Save action item ─────────────────────────────────────────
  // KEY FIX: use .update().eq('id', id) for existing rows,
  //          .insert() for new rows — never .upsert() on existing
  //          PKs which causes 409 conflicts.
  async function saveAction() {
    if (!school?.id || !form.title.trim()) return;
    setSaving(true);
    setError(null);

    const payload = {
      school_id: school.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      indicator_id: form.indicator_id || null,
      domain_id: form.domain_id || null,
      owner_id: form.owner_id || null,
      due_date: form.due_date || null,
      status: form.status,
      priority: form.priority,
      success_metric: form.success_metric.trim() || null,
      academic_year: form.academic_year,
    };

    try {
      if (form.id) {
        // EDIT: targeted update — never causes 409
        const { error } = await supabase
          .from('action_items')
          .update(payload)
          .eq('id', form.id)
          .eq('school_id', school.id); // belt-and-suspenders RLS safety
        if (error) throw error;
      } else {
        // CREATE: plain insert — let DB generate the UUID
        const { error } = await supabase
          .from('action_items')
          .insert({ ...payload, created_by: profile?.id });
        if (error) throw error;
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadActions();
    } catch (e: any) {
      setError(e.message || 'Failed to save action item');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAction(id: string) {
    if (!window.confirm('Delete this action item?')) return;
    await supabase.from('action_items').delete().eq('id', id);
    loadActions();
  }

  async function quickStatusUpdate(action: ActionItem, status: Status) {
    // Targeted update — no conflict risk
    await supabase
      .from('action_items')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', action.id);
    loadActions();
  }

  function openEdit(action: ActionItem) {
    setForm({
      id: action.id,
      title: action.title,
      description: action.description || '',
      indicator_id: action.indicator_id || '',
      domain_id: action.domain_id || '',
      owner_id: action.owner_id || '',
      due_date: action.due_date || '',
      status: action.status as Status,
      priority: action.priority as Priority,
      success_metric: action.success_metric || '',
      academic_year: action.academic_year || '2024-2025',
    });
    setShowModal(true);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  // ── Filtering ────────────────────────────────────────────────
  const filtered = actions.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterDomain !== 'all' && a.domain_id !== filterDomain) return false;
    if (filterPriority !== 'all' && a.priority !== filterPriority) return false;
    return true;
  });

  const byStatus = (status: Status) => filtered.filter(a => a.status === status);

  // Stats
  const total = actions.length;
  const completed = actions.filter(a => a.status === 'completed').length;
  const overdue = actions.filter(a => a.status === 'overdue').length;
  const completePct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Improvement Plan</h1>
            <p className="text-sm text-gray-500 mt-1">{school?.name_en}</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
          >
            + Add Action
          </button>
        </div>

        {/* Stats */}
        <div className="mt-5 flex gap-6 text-sm">
          <span className="text-gray-600">{total} total</span>
          <span className="text-green-700 font-medium">{completePct}% complete</span>
          {overdue > 0 && (
            <span className="text-red-600 font-medium">{overdue} overdue</span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="px-8 pt-5 flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        >
          <option value="all">All Statuses</option>
          {STATUS_COLUMNS.map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <select
          value={filterDomain}
          onChange={e => setFilterDomain(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        >
          <option value="all">All Domains</option>
          {domains.map(d => (
            <option key={d.id} value={d.id}>Domain {d.id}: {d.name_en}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Kanban Board */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {STATUS_COLUMNS.map(c => (
              <div key={c.key} className="space-y-3">
                <div className="h-6 bg-gray-200 rounded animate-pulse w-24" />
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {STATUS_COLUMNS.map(col => {
              const colItems = byStatus(col.key);
              return (
                <div key={col.key}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                      {colItems.length}
                    </span>
                  </div>
                  <div className={`min-h-[120px] rounded-xl p-3 space-y-3 ${col.color} border border-gray-200/80`}>
                    {colItems.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-6">No items</p>
                    )}
                    {colItems.map(action => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        onEdit={openEdit}
                        onDelete={deleteAction}
                        onStatusChange={quickStatusUpdate}
                        indicators={indicators}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {form.id ? 'Edit Action Item' : 'Add Action Item'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >×</button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <Field label="Title *">
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="What needs to be done?"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Additional context..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Priority">
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                  >
                    {STATUS_COLUMNS.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Linked Domain">
                <select
                  value={form.domain_id}
                  onChange={e => setForm(f => ({ ...f, domain_id: e.target.value, indicator_id: '' }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                >
                  <option value="">— None —</option>
                  {domains.map(d => (
                    <option key={d.id} value={d.id}>Domain {d.id}: {d.name_en}</option>
                  ))}
                </select>
              </Field>

              {form.domain_id && (
                <Field label="Linked Indicator">
                  <select
                    value={form.indicator_id}
                    onChange={e => setForm(f => ({ ...f, indicator_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                  >
                    <option value="">— None —</option>
                    {indicators
                      .filter(i => i.domain_id === form.domain_id)
                      .map(i => (
                        <option key={i.id} value={i.id}>
                          {i.id} — {i.description_en.substring(0, 60)}...
                        </option>
                      ))}
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Due Date">
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                  />
                </Field>
                <Field label="Academic Year">
                  <select
                    value={form.academic_year}
                    onChange={e => setForm(f => ({ ...f, academic_year: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                  >
                    <option value="2024-2025">2024–2025</option>
                    <option value="2023-2024">2023–2024</option>
                  </select>
                </Field>
              </div>

              <Field label="Success Metric">
                <input
                  type="text"
                  value={form.success_metric}
                  onChange={e => setForm(f => ({ ...f, success_metric: e.target.value }))}
                  placeholder="How will you know this is done?"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                />
              </Field>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveAction}
                  disabled={saving || !form.title.trim()}
                  className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Add Action'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Action Card ──────────────────────────────────────────────

function ActionCard({
  action,
  onEdit,
  onDelete,
  onStatusChange,
  indicators,
}: {
  action: ActionItem;
  onEdit: (a: ActionItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (a: ActionItem, s: Status) => void;
  indicators: Indicator[];
}) {
  const indicator = indicators.find(i => i.id === action.indicator_id);
  const isOverdue =
    action.due_date &&
    new Date(action.due_date) < new Date() &&
    action.status !== 'completed';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-gray-800 leading-snug flex-1">{action.title}</h4>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(action)}
            className="text-gray-400 hover:text-gray-600 text-xs p-0.5"
            title="Edit"
          >✎</button>
          <button
            onClick={() => onDelete(action.id)}
            className="text-gray-400 hover:text-red-500 text-xs p-0.5"
            title="Delete"
          >×</button>
        </div>
      </div>

      {indicator && (
        <span className="inline-block text-xs bg-[#01696f]/10 text-[#01696f] rounded px-1.5 py-0.5 font-mono mb-2">
          {indicator.id}
        </span>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[action.priority as Priority] || PRIORITY_COLORS.medium}`}>
          {action.priority}
        </span>
        {action.due_date && (
          <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
            {isOverdue ? '⚠ ' : ''}{new Date(action.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {/* Quick status move buttons */}
      <div className="flex gap-1 mt-3 pt-3 border-t border-gray-100">
        {action.status !== 'completed' && (
          <button
            onClick={() => onStatusChange(action, 'completed')}
            className="flex-1 text-xs py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
          >
            ✓ Done
          </button>
        )}
        {action.status === 'not_started' && (
          <button
            onClick={() => onStatusChange(action, 'in_progress')}
            className="flex-1 text-xs py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
          >
            → Start
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Form field wrapper ───────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
