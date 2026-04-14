import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ChevronDown, ChevronRight, CheckCircle2, Circle,
  Archive, RotateCcw, X, AlertTriangle, MessageSquare, ListTodo, Download,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import {
  useAFIs, useCreateAFI, useUpdateAFI, useArchiveAFI,
  useTasks, useCreateTask, useCompleteTask,
  useImpactNotes, useAddImpactNote,
  type AFI, type AFIStatus, type ImpactLevel, type ActionTask,
} from '../hooks/useImprovementPlan';

// ─── Config ───────────────────────────────────────────────────

const STATUS_CFG: Record<AFIStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not Started', cls: 'bg-gray-100 text-gray-600' },
  in_progress:  { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
  completed:    { label: 'Complete',    cls: 'bg-green-100 text-green-700' },
  overdue:      { label: 'Overdue',     cls: 'bg-red-100 text-red-700' },
};

const IMPACT_CFG: Record<ImpactLevel, { label: string; cls: string }> = {
  not_met:       { label: 'Not Met',       cls: 'bg-red-100 text-red-700' },
  partially_met: { label: 'Partially Met', cls: 'bg-amber-100 text-amber-700' },
  met:           { label: 'Met',           cls: 'bg-blue-100 text-blue-700' },
  exceeded:      { label: 'Exceeded',      cls: 'bg-green-100 text-green-700' },
};

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement', '2': 'Personal Development',
  '3': 'Teaching & Assessment', '4': 'School Climate', '5': 'Leadership & Governance',
};

// ─── Framework hook ───────────────────────────────────────────

interface FrameworkIndicator {
  id: string;
  description_en: string;
  domain_id: string;
  standard_id: string;
}

function useFramework() {
  return useQuery({
    queryKey: ['indicators-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('indicators')
        .select('id, description_en, domain_id, standard_id')
        .order('id');
      if (error) throw error;
      return (data ?? []) as FrameworkIndicator[];
    },
    staleTime: 1000 * 60 * 60,
  });
}

// ─── School users hook ────────────────────────────────────────

interface SchoolUser { id: string; full_name: string | null; email: string | null }

function useSchoolUsers() {
  const { school } = useSchoolStore();
  return useQuery({
    queryKey: ['school-users-simple', school?.id],
    queryFn: async () => {
      if (!school) return [] as SchoolUser[];
      const { data } = await supabase
        .from('school_members')
        .select('user_id, profiles:profiles!school_members_user_id_fkey(full_name, email)')
        .eq('school_id', school.id)
        .eq('status', 'active');
      return ((data ?? []) as Array<{ user_id: string; profiles: unknown }>).map(m => {
        const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
          { full_name?: string; email?: string } | null;
        return { id: m.user_id, full_name: p?.full_name ?? null, email: p?.email ?? null };
      });
    },
    enabled: !!school,
  });
}

// ─── Empty form shape ─────────────────────────────────────────

interface AFIForm {
  id?: string;
  title: string;
  description: string;
  indicator_id: string;
  domain_id: string;
  expected_impact: string;
  due_date: string;
  owner_id: string;
  status: AFIStatus;
  success_metric: string;
}

const EMPTY_FORM: AFIForm = {
  title: '',
  description: '',
  indicator_id: '',
  domain_id: '',
  expected_impact: '',
  due_date: '',
  owner_id: '',
  status: 'not_started',
  success_metric: '',
};

// ─── Page ─────────────────────────────────────────────────────

// ─── CSV Export ───────────────────────────────────────────────

function escapeCSV(value: string | null | undefined): string {
  const str = value ?? '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(
  items: AFI[],
  userMap: Record<string, string>,
  indMap: Record<string, { id: string }>,
  academicYear: string,
) {
  const header = ['title', 'priority', 'status', 'assigned_to', 'due_date', 'linked_indicator', 'created_at'];
  const rows = items.map(a => [
    escapeCSV(a.title),
    escapeCSV(a.priority ?? ''),
    escapeCSV(a.status),
    escapeCSV(a.owner_id ? (userMap[a.owner_id] ?? a.owner_id) : ''),
    escapeCSV(a.due_date ?? ''),
    escapeCSV(a.indicator_id ? (indMap[a.indicator_id]?.id ?? a.indicator_id) : ''),
    escapeCSV(a.created_at),
  ]);

  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `improvement-plan-${academicYear}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────

export default function ImprovementPlanPage() {
  const { t } = useTranslation();
  const { school, academicYear } = useSchoolStore();
  const [showArchived, setShowArchived] = useState(false);
  const [filterStatus, setFilterStatus] = useState<AFIStatus | 'all'>('all');
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, 'tasks' | 'notes'>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AFIForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: afis = [], isLoading } = useAFIs(showArchived);
  const { data: indicators = [] } = useFramework();
  const { data: users = [] } = useSchoolUsers();
  const createAFI  = useCreateAFI();
  const updateAFI  = useUpdateAFI();
  const archiveAFI = useArchiveAFI();

  const userMap = Object.fromEntries(users.map(u => [u.id, u.full_name ?? u.email ?? u.id]));
  const indMap  = Object.fromEntries(indicators.map(i => [i.id, i]));

  // Filter
  const visible = afis.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterDomain !== 'all' && a.domain_id !== filterDomain) return false;
    return true;
  });

  // Stats
  const total     = afis.length;
  const inProg    = afis.filter(a => a.status === 'in_progress').length;
  const complete  = afis.filter(a => a.status === 'completed').length;
  const overdue   = afis.filter(a => a.status === 'overdue').length;

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(afi: AFI) {
    setForm({
      id: afi.id,
      title: afi.title,
      description: afi.description ?? '',
      indicator_id: afi.indicator_id ?? '',
      domain_id: afi.domain_id ?? '',
      expected_impact: afi.expected_impact ?? '',
      due_date: afi.due_date ?? '',
      owner_id: afi.owner_id ?? '',
      status: afi.status,
      success_metric: afi.success_metric ?? '',
    });
    setFormError(null);
    setShowForm(true);
  }

  async function saveForm() {
    setFormError(null);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      indicator_id: form.indicator_id || null,
      domain_id: form.domain_id || null,
      expected_impact: form.expected_impact.trim() || null,
      due_date: form.due_date || null,
      owner_id: form.owner_id || null,
      status: form.status,
      success_metric: form.success_metric.trim() || null,
    };
    try {
      if (form.id) {
        await updateAFI.mutateAsync({ id: form.id, ...payload });
      } else {
        await createAFI.mutateAsync(payload as Parameters<typeof createAFI.mutateAsync>[0]);
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
    setActiveTab(prev => ({ ...prev, [id]: prev[id] ?? 'tasks' }));
  }

  const filteredIndicators = form.domain_id
    ? indicators.filter(i => i.domain_id === form.domain_id)
    : indicators;

  const saving = createAFI.isPending || updateAFI.isPending;

  if (!school) return null;

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{t('improvement.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{school.name_en} · Areas for Improvement (AFIs)</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowArchived(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                showArchived
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Archive className="h-4 w-4" />
              {showArchived ? 'Active' : 'Archived'}
            </button>
            <button
              onClick={() => generateCSV(visible, userMap, indMap, academicYear)}
              disabled={visible.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              {t('surveys.exportCsv')}
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
            >
              <Plus className="h-4 w-4" />
              New AFI
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 flex gap-5 text-sm">
          <span className="text-gray-500">{total} total</span>
          {inProg > 0   && <span className="text-blue-600 font-medium">{inProg} in progress</span>}
          {complete > 0 && <span className="text-green-600 font-medium">{complete} complete</span>}
          {overdue > 0  && <span className="text-red-600 font-medium">{overdue} overdue</span>}
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div className="px-8 pt-5 flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as AFIStatus | 'all')}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        >
          <option value="all">All Statuses</option>
          {(Object.keys(STATUS_CFG) as AFIStatus[]).map(s => (
            <option key={s} value={s}>{({
              not_started: t('improvement.notStarted'),
              in_progress: t('improvement.inProgress'),
              completed:   t('improvement.completed'),
              overdue:     t('improvement.overdue'),
            } as Record<string, string>)[s] ?? STATUS_CFG[s].label}</option>
          ))}
        </select>
        <select
          value={filterDomain}
          onChange={e => setFilterDomain(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        >
          <option value="all">All Domains</option>
          {Object.entries(DOMAIN_NAMES).map(([id, name]) => (
            <option key={id} value={id}>Domain {id}: {name}</option>
          ))}
        </select>
      </div>

      {/* ── AFI List ───────────────────────────────────────── */}
      <div className="px-8 py-5 space-y-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />
          ))
        ) : visible.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <ListTodo className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">
              {showArchived ? 'No archived AFIs' : 'No areas for improvement yet'}
            </p>
            {!showArchived && (
              <p className="text-xs text-gray-400 mt-1">
                Create an AFI to track a specific weakness and the actions to address it.
              </p>
            )}
          </div>
        ) : (
          visible.map(afi => (
            <AFIRow
              key={afi.id}
              afi={afi}
              expanded={expandedId === afi.id}
              activeTab={(activeTab[afi.id] ?? 'tasks') as 'tasks' | 'notes'}
              userMap={userMap}
              indMap={indMap}
              onToggle={() => toggleExpand(afi.id)}
              onTabChange={tab => setActiveTab(prev => ({ ...prev, [afi.id]: tab }))}
              onEdit={() => openEdit(afi)}
              onArchive={() => archiveAFI.mutate({ id: afi.id, is_archived: !afi.is_archived })}
              showArchived={showArchived}
            />
          ))
        )}
      </div>

      {/* ── Create / Edit Form ─────────────────────────────── */}
      {showForm && (
        <AFIFormModal
          form={form}
          setForm={setForm}
          onSave={saveForm}
          onClose={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null); }}
          saving={saving}
          saveError={formError}
          indicators={filteredIndicators}
          allIndicators={indicators}
          users={users}
        />
      )}
    </div>
  );
}

// ─── AFI Row (with inline expand) ─────────────────────────────

interface AFIRowProps {
  afi: AFI;
  expanded: boolean;
  activeTab: 'tasks' | 'notes';
  userMap: Record<string, string>;
  indMap: Record<string, FrameworkIndicator>;
  onToggle: () => void;
  onTabChange: (tab: 'tasks' | 'notes') => void;
  onEdit: () => void;
  onArchive: () => void;
  showArchived: boolean;
}

function AFIRow({
  afi, expanded, activeTab, userMap, indMap,
  onToggle, onTabChange, onEdit, onArchive, showArchived,
}: AFIRowProps) {
  const { t } = useTranslation();
  const statusLabel: Record<string, string> = {
    not_started: t('improvement.notStarted'),
    in_progress:  t('improvement.inProgress'),
    completed:    t('improvement.completed'),
    overdue:      t('improvement.overdue'),
  };
  const updateAFI = useUpdateAFI();
  const navigate = useNavigate();
  const [completionDialog, setCompletionDialog] = useState(false);
  const cfg = STATUS_CFG[afi.status];
  const indicator = afi.indicator_id ? indMap[afi.indicator_id] : null;
  const ownerName = afi.owner_id ? (userMap[afi.owner_id] ?? '—') : '—';
  const isOverdue = afi.status === 'overdue';
  const dueLabel = afi.due_date
    ? new Date(afi.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  async function handleStatusChange(status: AFIStatus, tasks?: ActionTask[]) {
    if (status === 'completed' && tasks) {
      const open = tasks.filter(t => t.status !== 'completed');
      if (open.length > 0) {
        const proceed = window.confirm(
          `${open.length} task${open.length > 1 ? 's' : ''} still open. Mark AFI as complete anyway?`
        );
        if (!proceed) return;
      }
    }
    await updateAFI.mutateAsync({
      id: afi.id,
      status,
      completion_date: status === 'completed' ? new Date().toISOString().split('T')[0] : null,
    });

    // Improvement 5: show prompt if action has linked indicator and not yet prompted
    if (status === 'completed' && afi.indicator_id && !afi.completion_prompted) {
      setCompletionDialog(true);
      // Mark as prompted so dialog only shows once
      await supabase.from('action_items').update({ completion_prompted: true }).eq('id', afi.id);
    }
  }

  function handleUpdateIndicator() {
    setCompletionDialog(false);
    navigate(`/self-evaluation?indicator=${afi.indicator_id}`);
  }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-shadow ${
      expanded ? 'border-[#01696f] shadow-sm' : 'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <span className="shrink-0 text-gray-300">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{afi.title}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {indicator && (
              <span className="text-xs font-mono text-[#01696f] bg-[#01696f]/8 px-1.5 py-0.5 rounded">
                {indicator.id}
              </span>
            )}
            {afi.domain_id && (
              <span className="text-xs text-gray-400">Domain {afi.domain_id}</span>
            )}
            {ownerName !== '—' && (
              <span className="text-xs text-gray-400">Owner: {ownerName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {dueLabel && (
            <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
              {isOverdue ? '⚠ ' : ''}{dueLabel}
            </span>
          )}
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.cls}`}>
            {statusLabel[afi.status] ?? cfg.label}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Description / Expected Impact */}
          {(afi.description || afi.expected_impact) && (
            <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50/50">
              {afi.description && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-700">{afi.description}</p>
                </div>
              )}
              {afi.expected_impact && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Impact</p>
                  <p className="text-sm text-gray-700">{afi.expected_impact}</p>
                </div>
              )}
            </div>
          )}

          {/* Action bar */}
          <div className="px-5 py-3 flex items-center gap-2 flex-wrap border-b border-gray-100">
            {afi.status === 'not_started' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors"
              >
                → Start
              </button>
            )}
            {afi.status !== 'completed' && (
              <TasksAwareCompleteButton afiId={afi.id} onComplete={tasks => handleStatusChange('completed', tasks)} />
            )}
            {afi.status === 'completed' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition-colors"
              >
                Reopen
              </button>
            )}
            <button
              onClick={onEdit}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onArchive}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors ml-auto"
            >
              {showArchived
                ? <><RotateCcw className="h-3.5 w-3.5" /> Restore</>
                : <><Archive className="h-3.5 w-3.5" /> Archive</>}
            </button>
          </div>

          {/* Tabs */}
          <div className="px-5 pt-3">
            <div className="flex gap-1 mb-4">
              {(['tasks', 'notes'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-[#01696f] text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab === 'tasks'
                    ? <><ListTodo className="h-3.5 w-3.5" /> Tasks</>
                    : <><MessageSquare className="h-3.5 w-3.5" /> Impact Notes</>}
                </button>
              ))}
            </div>

            {activeTab === 'tasks'
              ? <TasksPanel afiId={afi.id} users={[]} userMap={{}} />
              : <ImpactNotesPanel afiId={afi.id} />
            }
          </div>
        </div>
      )}

      {/* ── Completion Dialog (Improvement 5) ── */}
      {completionDialog && indicator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Action Completed — Update Self-Evaluation?
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              This action was linked to{' '}
              <span className="font-mono text-[#01696f]">{indicator.id}</span>
              {': '}
              <span className="font-medium">{indicator.description_en}</span>.
              Would you like to update the improvement areas text for this indicator to reflect
              the completed action?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setCompletionDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Not Now
              </button>
              <button
                onClick={handleUpdateIndicator}
                className="px-4 py-2 text-sm font-medium text-white bg-[#01696f] rounded-lg hover:bg-[#0c4e54] transition-colors"
              >
                Update Indicator
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tasks-aware complete button ──────────────────────────────

function TasksAwareCompleteButton({
  afiId,
  onComplete,
}: {
  afiId: string;
  onComplete: (tasks: ActionTask[]) => void;
}) {
  const { data: tasks = [] } = useTasks(afiId);
  return (
    <button
      onClick={() => onComplete(tasks)}
      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100 transition-colors"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      Mark Complete
    </button>
  );
}

// ─── Tasks Panel ──────────────────────────────────────────────

function TasksPanel({
  afiId,
  userMap,
}: {
  afiId: string;
  users: SchoolUser[];
  userMap: Record<string, string>;
}) {
  const { data: tasks = [], isLoading } = useTasks(afiId);
  const createTask  = useCreateTask();
  const completeTask = useCompleteTask();
  const [newTitle, setNewTitle] = useState('');

  async function addTask() {
    if (!newTitle.trim()) return;
    await createTask.mutateAsync({ action_item_id: afiId, title: newTitle.trim() });
    setNewTitle('');
  }

  const openCount = tasks.filter(t => t.status !== 'completed').length;

  return (
    <div className="pb-5">
      {openCount > 0 && (
        <div className="flex items-center gap-1.5 mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {openCount} task{openCount > 1 ? 's' : ''} open — complete all before marking AFI done
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-1.5 mb-3">
          {tasks.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No tasks yet — add one below.</p>
          )}
          {tasks.map(task => (
            <div
              key={task.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                task.status === 'completed'
                  ? 'border-green-100 bg-green-50/50'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <button
                onClick={() => task.status !== 'completed' && completeTask.mutate({ id: task.id, action_item_id: afiId })}
                className="shrink-0"
                disabled={task.status === 'completed'}
              >
                {task.status === 'completed'
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <Circle className="h-4 w-4 text-gray-300 hover:text-[#01696f] transition-colors" />
                }
              </button>
              <span className={`flex-1 text-xs ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {task.title}
              </span>
              {task.due_date && (
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              )}
              {task.owner_id && userMap[task.owner_id] && (
                <span className="text-xs text-gray-400 shrink-0">{userMap[task.owner_id]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add task */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void addTask()}
          placeholder="Add a task…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        />
        <button
          onClick={addTask}
          disabled={!newTitle.trim() || createTask.isPending}
          className="px-3 py-2 bg-[#01696f] text-white text-xs font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Impact Notes Panel ───────────────────────────────────────

function ImpactNotesPanel({ afiId }: { afiId: string }) {
  const { data: notes = [], isLoading } = useImpactNotes(afiId);
  const addNote = useAddImpactNote();
  const [content, setContent] = useState('');
  const [impact, setImpact] = useState<ImpactLevel | ''>('');

  async function submit() {
    if (!content.trim()) return;
    await addNote.mutateAsync({
      action_item_id: afiId,
      content: content.trim(),
      current_impact: impact || null,
    });
    setContent('');
    setImpact('');
  }

  return (
    <div className="pb-5">
      {/* Existing notes */}
      {isLoading ? (
        <div className="space-y-2 mb-4">
          {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {notes.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No impact notes yet — add one below.</p>
          )}
          {notes.map(note => (
            <div key={note.id} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="text-xs text-gray-700 flex-1">{note.content}</p>
                {note.current_impact && (
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${IMPACT_CFG[note.current_impact].cls}`}>
                    {IMPACT_CFG[note.current_impact].label}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {new Date(note.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add note */}
      <div className="space-y-2">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={2}
          placeholder="Describe the current impact and progress…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        />
        <div className="flex items-center gap-2">
          <select
            value={impact}
            onChange={e => setImpact(e.target.value as ImpactLevel | '')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
          >
            <option value="">Current impact…</option>
            {(Object.keys(IMPACT_CFG) as ImpactLevel[]).map(l => (
              <option key={l} value={l}>{IMPACT_CFG[l].label}</option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={!content.trim() || addNote.isPending}
            className="px-3 py-2 bg-[#01696f] text-white text-xs font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-40 transition-colors"
          >
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AFI Form Modal ───────────────────────────────────────────

interface AFIFormModalProps {
  form: AFIForm;
  setForm: React.Dispatch<React.SetStateAction<AFIForm>>;
  onSave: () => Promise<void>;
  onClose: () => void;
  saving: boolean;
  saveError?: string | null;
  indicators: FrameworkIndicator[];
  allIndicators: FrameworkIndicator[];
  users: SchoolUser[];
}

function AFIFormModal({
  form, setForm, onSave, onClose, saving, saveError, indicators, allIndicators, users,
}: AFIFormModalProps) {
  const isEdit = !!form.id;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl shadow-xl sm:max-w-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Area for Improvement' : 'New Area for Improvement'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Title */}
          <FormField
            label="Title *"
            hint="Be Specific — state the exact change, not 'improve' or 'better'"
          >
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Increase student proficiency in Mathematics from 58% to 75%"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
            />
          </FormField>

          {/* Domain → Indicator cascade */}
          <FormField
            label="Linked Domain"
            hint="Be Relevant — link to the specific OAAAQA domain this addresses"
          >
            <select
              value={form.domain_id}
              onChange={e => setForm(f => ({ ...f, domain_id: e.target.value, indicator_id: '' }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
            >
              <option value="">— None —</option>
              {Object.entries(DOMAIN_NAMES).map(([id, name]) => (
                <option key={id} value={id}>Domain {id}: {name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Linked Indicator">
            <select
              value={form.indicator_id}
              onChange={e => setForm(f => ({ ...f, indicator_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
            >
              <option value="">— None —</option>
              {(form.domain_id ? indicators : allIndicators).map(i => (
                <option key={i.id} value={i.id}>
                  {i.id} — {i.description_en.substring(0, 65)}{i.description_en.length > 65 ? '…' : ''}
                </option>
              ))}
            </select>
          </FormField>

          {/* Description */}
          <FormField
            label="Description"
            hint="Be Achievable — describe the approach with current resources"
          >
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Describe the root cause and the planned approach…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f]"
            />
          </FormField>

          {/* Expected Impact */}
          <FormField
            label="Expected Impact"
            hint="Be Measurable — include numbers, e.g. 'increase from 58% to 75%'"
          >
            <input
              type="text"
              value={form.expected_impact}
              onChange={e => setForm(f => ({ ...f, expected_impact: e.target.value }))}
              placeholder="e.g. Proficiency rate rises by 17 percentage points by end of T3"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
            />
          </FormField>

          {/* Due date + Owner */}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Due Date"
              hint="Be Time-bound — a date keeps the team accountable"
            >
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
              />
            </FormField>
            <FormField label="Owner">
              <select
                value={form.owner_id}
                onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
              >
                <option value="">— Unassigned —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
                ))}
              </select>
            </FormField>
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <FormField label="Status">
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as AFIStatus }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
              >
                {(Object.keys(STATUS_CFG) as AFIStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                ))}
              </select>
            </FormField>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
          {saveError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onSave}
              disabled={saving || !form.title.trim()}
              className="flex-1 py-2.5 bg-[#01696f] text-white text-sm font-medium rounded-xl hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create AFI'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Form field wrapper ───────────────────────────────────────

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">💡 {hint}</p>}
    </div>
  );
}
