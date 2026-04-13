import { useState, useRef, useCallback, useMemo, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { List, CalendarDays, ChevronDown, ChevronUp, Link2, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../components/ui/toast';
import {
  JUDGEMENT_LABELS_SHORT,
  JUDGEMENT_COLORS,
  type JudgementLevel,
} from '../lib/judgement';
import { formatDate } from '../lib/utils';
import { ObservationCalendar, type CalObservation } from '../components/ObservationCalendar';

// ─── Types ────────────────────────────────────────────────────

interface TeacherOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface ClassOption {
  id: string;
  label: string;
  subject: string;
}

interface IndicatorRow {
  id: string;
  standard_id: string;
  description_en: string;
  order_num: number;
}

interface StandardRow {
  id: string;
  name_en: string;
  is_primary: boolean;
  order_num: number;
}

interface Observation {
  id: string;
  school_id: string;
  observer_id: string;
  teacher_id: string;
  class_id: string | null;
  observed_at: string;
  domain3_ratings: Record<string, number>;
  qualitative_notes: string | null;
  evidence_files: string[] | null;
  created_at: string;
  // scheduling fields (migration 038)
  scheduled_date: string | null;
  assigned_observer: string | null;
  obs_status: 'scheduled' | 'completed' | 'cancelled';
  // coaching fields (migration 039)
  coaching_notes: string | null;
  teacher_response: string | null;
  reobserve_date: string | null;
  coaching_status: 'none' | 'feedback_given' | 'teacher_responded' | 'closed';
  // cycle fields (migration 043)
  cycle_number: number;
  parent_obs_id: string | null;
  // joined
  teacher:  { id: string; full_name: string | null } | null;
  observer: { id: string; full_name: string | null } | null;
  class:    { id: string; label: string; subject: string } | null;
}

interface ObsForm {
  teacher_id: string;
  class_id: string;
  observed_at: string;
  scheduled_date: string;
  assigned_observer: string;
  ratings: Record<string, number | null>;
  qualitative_notes: string;
  attachPaths: string[];
  parent_obs_id: string | null;
  cycle_number: number;
}

const EMPTY_FORM: ObsForm = {
  teacher_id: '',
  class_id: '',
  observed_at: toLocalDatetimeValue(new Date()),
  scheduled_date: '',
  assigned_observer: '',
  ratings: {},
  qualitative_notes: '',
  attachPaths: [],
  parent_obs_id: null,
  cycle_number: 1,
};

// ─── Helpers ─────────────────────────────────────────────────

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ratedCount(ratings: Record<string, number | null>): number {
  return Object.values(ratings).filter(v => v != null).length;
}

function avgRating(ratings: Record<string, number | null>): string {
  const vals = Object.values(ratings).filter((v): v is number => v != null);
  if (!vals.length) return '—';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function getObsChain(obsId: string, allObs: Observation[]): Observation[] {
  const byId = Object.fromEntries(allObs.map(o => [o.id, o]));
  let root = byId[obsId];
  if (!root) return [];
  while (root.parent_obs_id && byId[root.parent_obs_id]) root = byId[root.parent_obs_id];
  const childrenOf: Record<string, string[]> = {};
  for (const o of allObs) {
    if (o.parent_obs_id) (childrenOf[o.parent_obs_id] ??= []).push(o.id);
  }
  const chain: Observation[] = [];
  let cur: Observation | undefined = root;
  while (cur) {
    chain.push(cur);
    const kids = childrenOf[cur.id];
    cur = kids?.[0] ? byId[kids[0]] : undefined;
  }
  return chain;
}

const OBS_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  scheduled: { bg: 'bg-blue-50',  text: 'text-blue-700',  label: 'Scheduled' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', label: 'Completed' },
  cancelled: { bg: 'bg-red-50',   text: 'text-red-600',   label: 'Cancelled' },
};

const COACHING_STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  none:              { bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200', label: 'No Feedback' },
  feedback_given:    { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200', label: 'Awaiting Response' },
  teacher_responded: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', label: 'Teacher Responded' },
  closed:            { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', label: 'Closed' },
};

const COACHING_FILTER_CHIPS = [
  { value: 'all',              label: 'All' },
  { value: 'feedback_given',   label: 'Awaiting Feedback' },
  { value: 'teacher_responded',label: 'Teacher Responded' },
  { value: 'closed',           label: 'Closed' },
];

// ─── Queries ─────────────────────────────────────────────────

function useObservations(schoolId: string | undefined) {
  return useQuery({
    queryKey: ['observations', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classroom_observations')
        .select(`
          *,
          teacher:teacher_id(id, full_name),
          observer:observer_id(id, full_name),
          class:class_id(id, label, subject)
        `)
        .eq('school_id', schoolId!)
        .order('observed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Observation[];
    },
    enabled: !!schoolId,
  });
}

function useTeachers(schoolId: string | undefined) {
  return useQuery({
    queryKey: ['school-teachers', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_members')
        .select('user_id, profiles!school_members_user_id_fkey(full_name, email)')
        .eq('school_id', schoolId!)
        .eq('role', 'teacher')
        .eq('status', 'active')
        .order('user_id');
      if (error) throw error;
      type Row = { user_id: string; profiles: { full_name: string | null; email: string | null }[] | null };
      return (data ?? []).map((m) => {
        const r = m as unknown as Row;
        const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
        return {
          user_id:   r.user_id,
          full_name: p?.full_name ?? null,
          email:     p?.email     ?? null,
        } satisfies TeacherOption;
      });
    },
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
  });
}

function useObservers(schoolId: string | undefined) {
  return useQuery({
    queryKey: ['school-observers', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_members')
        .select('user_id, profiles!school_members_user_id_fkey(full_name, email)')
        .eq('school_id', schoolId!)
        .in('role', ['school_admin', 'principal', 'vice_principal', 'head_of_department', 'quality_coordinator'])
        .eq('status', 'active')
        .order('user_id');
      if (error) throw error;
      type Row = { user_id: string; profiles: { full_name: string | null; email: string | null }[] | null };
      return (data ?? []).map((m) => {
        const r = m as unknown as Row;
        const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
        return {
          user_id:   r.user_id,
          full_name: p?.full_name ?? null,
          email:     p?.email     ?? null,
        } satisfies TeacherOption;
      });
    },
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
  });
}

function useClasses(schoolId: string | undefined, teacherId: string) {
  return useQuery({
    queryKey: ['classes-for-teacher', schoolId, teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, label, subject')
        .eq('school_id', schoolId!)
        .eq('teacher_id', teacherId)
        .order('label');
      if (error) throw error;
      return (data ?? []) as ClassOption[];
    },
    enabled: !!schoolId && !!teacherId,
  });
}

function useDomain3Framework() {
  return useQuery({
    queryKey: ['domain3-framework'],
    queryFn: async () => {
      const [{ data: standards, error: se }, { data: indicators, error: ie }] = await Promise.all([
        supabase.from('standards').select('id, name_en, is_primary, order_num').eq('domain_id', '3').order('order_num'),
        supabase.from('indicators').select('id, standard_id, description_en, order_num').eq('domain_id', '3').order('order_num'),
      ]);
      if (se) throw se;
      if (ie) throw ie;
      return { standards: (standards ?? []) as StandardRow[], indicators: (indicators ?? []) as IndicatorRow[] };
    },
    staleTime: 1000 * 60 * 60,
  });
}

// ─── Page ─────────────────────────────────────────────────────

export default function ClassroomObservationsPage() {
  const { school, profile } = useSchoolStore();
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [modalMode, setModalMode] = useState<'closed' | 'create' | 'edit' | 'view'>('closed');
  const [activeObs, setActiveObs] = useState<Observation | null>(null);
  const [form, setForm] = useState<ObsForm>(EMPTY_FORM);
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterCoaching, setFilterCoaching] = useState<string>('all');
  const [expandedCoachingId, setExpandedCoachingId] = useState<string | null>(null);
  const [cycleViewObsId, setCycleViewObsId]         = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachUploading, setAttachUploading] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);

  // Calendar state
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const { data: observations = [], isLoading } = useObservations(school?.id);
  // Set of obs IDs that are parents (have at least one child observation)
  const parentObsIds = useMemo(
    () => new Set(observations.filter(o => o.parent_obs_id).map(o => o.parent_obs_id!)),
    [observations],
  );
  const { data: teachers = [] } = useTeachers(school?.id);
  const { data: observers = [] } = useObservers(school?.id);
  const { data: classes = [] } = useClasses(school?.id, form.teacher_id);
  const { data: framework } = useDomain3Framework();

  // Calendar data derived from observations
  const calendarObs = useMemo<CalObservation[]>(() =>
    observations.map((obs) => ({
      id:           obs.id,
      date:         obs.scheduled_date ?? obs.observed_at.slice(0, 10),
      teacher_name: obs.teacher?.full_name ?? '—',
      subject:      obs.class?.subject ?? 'General',
      obs_status:   obs.obs_status ?? 'completed',
    })),
    [observations],
  );

  // ── Permission guard ─────────────────────────────────────────
  if (!perms.canRecordObservations) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center max-w-sm">
          <p className="text-3xl mb-3">🔒</p>
          <p className="text-base font-semibold text-gray-900">Access Restricted</p>
          <p className="text-sm text-gray-500 mt-1">
            Recording classroom observations requires Head of Department or School Admin access.
          </p>
        </div>
      </div>
    );
  }

  // ── Open form helpers ────────────────────────────────────────
  function openCreate() {
    setForm({ ...EMPTY_FORM, observed_at: toLocalDatetimeValue(new Date()) });
    setActiveObs(null);
    setModalMode('create');
  }

  function openEdit(obs: Observation) {
    setActiveObs(obs);
    setForm({
      teacher_id:        obs.teacher_id,
      class_id:          obs.class_id ?? '',
      observed_at:       toLocalDatetimeValue(new Date(obs.observed_at)),
      scheduled_date:    obs.scheduled_date ?? '',
      assigned_observer: obs.assigned_observer ?? '',
      ratings:           { ...obs.domain3_ratings },
      qualitative_notes: obs.qualitative_notes ?? '',
      attachPaths:       obs.evidence_files ?? [],
      parent_obs_id:     obs.parent_obs_id ?? null,
      cycle_number:      obs.cycle_number ?? 1,
    });
    setModalMode('edit');
  }

  function openView(obs: Observation) {
    setActiveObs(obs);
    setModalMode('view');
  }

  function openReobs(parentObs: Observation) {
    setForm({
      ...EMPTY_FORM,
      teacher_id:    parentObs.teacher_id,
      class_id:      parentObs.class_id ?? '',
      observed_at:   toLocalDatetimeValue(new Date()),
      scheduled_date: parentObs.reobserve_date ?? '',
      parent_obs_id: parentObs.id,
      cycle_number:  (parentObs.cycle_number ?? 1) + 1,
    });
    setActiveObs(null);
    setModalMode('create');
  }

  function closeModal() {
    setModalMode('closed');
    setActiveObs(null);
  }

  // ── Save observation ─────────────────────────────────────────
  async function handleSave() {
    if (!school || !profile) return;
    if (!form.teacher_id) { showToast('Select a teacher', 'error'); return; }
    if (!form.observed_at) { showToast('Set observation date', 'error'); return; }

    const cleanRatings: Record<string, number> = {};
    for (const [k, v] of Object.entries(form.ratings)) {
      if (v != null) cleanRatings[k] = v;
    }

    const obs_status: 'scheduled' | 'completed' =
      ratedCount(cleanRatings) > 0 ? 'completed' : 'scheduled';

    const payload = {
      school_id:         school.id,
      observer_id:       profile.id,
      teacher_id:        form.teacher_id,
      class_id:          form.class_id || null,
      observed_at:       new Date(form.observed_at).toISOString(),
      domain3_ratings:   cleanRatings,
      qualitative_notes: form.qualitative_notes || null,
      evidence_files:    form.attachPaths.length ? form.attachPaths : null,
      scheduled_date:    form.scheduled_date || null,
      assigned_observer: form.assigned_observer || null,
      obs_status,
      parent_obs_id:     form.parent_obs_id || null,
      cycle_number:      form.cycle_number ?? 1,
    };

    setSaving(true);
    let error: { message: string } | null = null;

    if (modalMode === 'edit' && activeObs) {
      ({ error } = await supabase
        .from('classroom_observations')
        .update(payload)
        .eq('id', activeObs.id));
    } else {
      ({ error } = await supabase.from('classroom_observations').insert(payload));
    }

    setSaving(false);
    if (error) { showToast(`Save failed: ${error.message}`, 'error'); return; }

    queryClient.invalidateQueries({ queryKey: ['observations', school.id] });
    showToast(modalMode === 'edit' ? 'Observation updated' : 'Observation recorded', 'success');
    closeModal();
  }

  // ── Delete observation ───────────────────────────────────────
  async function handleDelete(obs: Observation) {
    if (!window.confirm('Delete this observation permanently?')) return;
    const { error } = await supabase.from('classroom_observations').delete().eq('id', obs.id);
    if (error) { showToast(error.message, 'error'); return; }
    queryClient.invalidateQueries({ queryKey: ['observations', school?.id] });
    showToast('Observation deleted', 'info');
    if (modalMode !== 'closed') closeModal();
  }

  // ── Attach evidence file ─────────────────────────────────────
  const handleAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!school) return;
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setAttachUploading(true);
    const newPaths: string[] = [];
    for (const file of files) {
      const path = `observations/${school.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('evidence-files').upload(path, file);
      if (error) { showToast(`Upload failed: ${error.message}`, 'error'); continue; }
      newPaths.push(path);
    }
    setForm(prev => ({ ...prev, attachPaths: [...prev.attachPaths, ...newPaths] }));
    setAttachUploading(false);
    if (attachInputRef.current) attachInputRef.current.value = '';
  }, [school, showToast]);

  async function removeAttach(path: string) {
    setForm(prev => ({ ...prev, attachPaths: prev.attachPaths.filter(p => p !== path) }));
  }

  // ── Signed URL for a storage path ───────────────────────────
  async function openStoragePath(path: string) {
    const { data } = await supabase.storage.from('evidence-files').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  // ── Filtered list ────────────────────────────────────────────
  const filtered = observations
    .filter(o => filterTeacher === 'all' || o.teacher_id === filterTeacher)
    .filter(o => {
      if (filterCoaching === 'all') return true;
      return (o.coaching_status ?? 'none') === filterCoaching;
    });

  const totalD3 = framework?.indicators.length ?? 0;

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Classroom Observations</h1>
            <p className="text-sm text-gray-500 mt-1">
              Domain 3 — {observations.length} observation{observations.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* List / Calendar toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>

            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
            >
              + Record Observation
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          {/* ── Filter bar ── */}
          <div className="px-8 pt-5 space-y-3">
            {/* Teacher filter */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500">Filter by teacher:</label>
              <select
                value={filterTeacher}
                onChange={e => setFilterTeacher(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
              >
                <option value="all">All teachers</option>
                {teachers.map(t => (
                  <option key={t.user_id} value={t.user_id}>
                    {t.full_name ?? t.email ?? t.user_id}
                  </option>
                ))}
              </select>
              {filterTeacher !== 'all' && (
                <button onClick={() => setFilterTeacher('all')} className="text-xs text-gray-400 hover:text-gray-600">
                  ✕ Clear
                </button>
              )}
            </div>

            {/* Coaching status filter chips */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 mr-1">Coaching:</span>
              {COACHING_FILTER_CHIPS.map(chip => (
                <button
                  key={chip.value}
                  onClick={() => setFilterCoaching(chip.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterCoaching === chip.value
                      ? 'bg-[#01696f] text-white border-[#01696f]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Cycle Timeline ── */}
          {cycleViewObsId !== null && (() => {
            const chain = getObsChain(cycleViewObsId, observations);
            return chain.length >= 2 ? (
              <div className="px-8 pt-3">
                <CycleTimeline chain={chain} onClose={() => setCycleViewObsId(null)} />
              </div>
            ) : null;
          })()}

          {/* ── Observations list ── */}
          <div className="px-8 py-5">
            {isLoading ? (
              <SkeletonTable />
            ) : filtered.length === 0 ? (
              <EmptyState onRecord={openCreate} />
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Date</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Cycle</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Teacher</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Class</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Coaching</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Indicators</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Avg Rating</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Observer</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(obs => {
                      const rated  = Object.values(obs.domain3_ratings ?? {}).filter(v => v != null).length;
                      const avg    = avgRating(obs.domain3_ratings ?? {});
                      const avgNum = parseFloat(avg);
                      const statusStyle   = OBS_STATUS_STYLES[obs.obs_status ?? 'completed'];
                      const coachStyle    = COACHING_STATUS_STYLES[obs.coaching_status ?? 'none'];
                      const isExpanded    = expandedCoachingId === obs.id;
                      const showCoaching  = obs.obs_status === 'completed';
                      return (
                        <Fragment key={obs.id}>
                          <tr
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => openView(obs)}
                          >
                            <td className="px-5 py-3 whitespace-nowrap text-gray-700 font-medium">
                              {obs.scheduled_date
                                ? <><span className="text-blue-600">{obs.scheduled_date}</span><br/><span className="text-[10px] text-gray-400">scheduled</span></>
                                : formatDate(obs.observed_at)
                              }
                            </td>
                            <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    const cycleNum = obs.cycle_number ?? 1;
                                    const hasChain = cycleNum > 1 || parentObsIds.has(obs.id);
                                    if (hasChain) setCycleViewObsId(cycleViewObsId === obs.id ? null : obs.id);
                                  }}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                                    (obs.cycle_number ?? 1) > 1 || parentObsIds.has(obs.id)
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 cursor-pointer'
                                      : 'bg-gray-50 text-gray-500 border-gray-200 cursor-default'
                                  }`}
                                  title={(obs.cycle_number ?? 1) > 1 || parentObsIds.has(obs.id) ? 'View cycle timeline' : undefined}
                                >
                                  Obs {obs.cycle_number ?? 1}
                                </button>
                                {obs.parent_obs_id && (() => {
                                  const parent = observations.find(o => o.id === obs.parent_obs_id);
                                  const parentDate = parent?.scheduled_date ?? parent?.observed_at.slice(0, 10) ?? 'earlier';
                                  return (
                                    <span title={`Follow-up to ${parentDate} observation`} className="text-gray-400 cursor-help">
                                      <Link2 className="h-3 w-3" />
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-gray-700">
                              {obs.teacher?.full_name ?? '—'}
                            </td>
                            <td className="px-5 py-3 text-gray-500">
                              {obs.class ? `${obs.class.label} · ${obs.class.subject}` : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                                {statusStyle.label}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {showCoaching ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${coachStyle.bg} ${coachStyle.text} ${coachStyle.border}`}>
                                  {coachStyle.label}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-xs text-gray-500">{rated}/{totalD3}</span>
                              <div className="mt-1 h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${totalD3 ? (rated / totalD3) * 100 : 0}%`,
                                    backgroundColor: totalD3 && rated / totalD3 >= 0.8 ? '#437a22' : '#d19900',
                                  }}
                                />
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              {!isNaN(avgNum) ? (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                                  style={{ backgroundColor: JUDGEMENT_COLORS[Math.round(avgNum) as JudgementLevel] }}
                                >
                                  {avg}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-gray-500 text-xs">
                              {obs.observer?.full_name ?? '—'}
                            </td>
                            <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                {showCoaching && (
                                  <button
                                    onClick={() => setExpandedCoachingId(isExpanded ? null : obs.id)}
                                    className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
                                    title="Open coaching panel"
                                  >
                                    Coaching
                                    {isExpanded
                                      ? <ChevronUp className="h-3 w-3" />
                                      : <ChevronDown className="h-3 w-3" />
                                    }
                                  </button>
                                )}
                                <button onClick={() => openEdit(obs)} className="text-xs text-[#01696f] hover:underline">
                                  Edit
                                </button>
                                <button onClick={() => handleDelete(obs)} className="text-xs text-red-400 hover:text-red-600 hover:underline">
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && showCoaching && (
                            <CoachingPanel
                              obs={obs}
                              profileId={profile?.id ?? null}
                              schoolId={school?.id ?? ''}
                              onScheduleReobs={openReobs}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Calendar view ── */
        <div className="px-8 py-5">
          {isLoading ? (
            <div className="h-96 bg-white rounded-xl border border-gray-200 animate-pulse" />
          ) : (
            <ObservationCalendar
              observations={calendarObs}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onDayClick={() => {/* popover handled inside the component */}}
            />
          )}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <Modal
          title={modalMode === 'edit' ? 'Edit Observation' : 'Record Classroom Observation'}
          wide
          onClose={closeModal}
        >
          <ObservationForm
            form={form}
            setForm={setForm}
            teachers={teachers}
            observers={observers}
            classes={classes}
            framework={framework}
            attachInputRef={attachInputRef}
            attachUploading={attachUploading}
            saving={saving}
            onAttach={handleAttach}
            onRemoveAttach={removeAttach}
            onOpenPath={openStoragePath}
            onSave={handleSave}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {/* ── View Modal ── */}
      {modalMode === 'view' && activeObs && (
        <Modal title="Observation Detail" wide onClose={closeModal}>
          <ObservationDetail
            obs={activeObs}
            framework={framework}
            onEdit={() => openEdit(activeObs)}
            onDelete={() => handleDelete(activeObs)}
            onOpenPath={openStoragePath}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Coaching Panel ───────────────────────────────────────────

function CoachingPanel({
  obs,
  profileId,
  schoolId,
  onScheduleReobs,
}: {
  obs: Observation;
  profileId: string | null;
  schoolId: string;
  onScheduleReobs: (obs: Observation) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [notes,         setNotes]         = useState(obs.coaching_notes ?? '');
  const [response,      setResponse]      = useState(obs.teacher_response ?? '');
  const [reobserveDate, setReobserveDate] = useState(obs.reobserve_date ?? '');
  const [status,        setStatus]        = useState<string>(obs.coaching_status ?? 'none');
  const [saving,        setSaving]        = useState(false);

  const isTeacher = profileId === obs.teacher_id;

  async function save() {
    setSaving(true);
    const patch: Record<string, string | null> = { coaching_status: status };
    if (!isTeacher) {
      patch.coaching_notes  = notes || null;
      patch.reobserve_date  = reobserveDate || null;
    } else {
      patch.teacher_response = response || null;
    }
    const { error } = await supabase
      .from('classroom_observations')
      .update(patch)
      .eq('id', obs.id);
    setSaving(false);
    if (error) { showToast(`Save failed: ${error.message}`, 'error'); return; }
    showToast('Coaching saved', 'success');
    queryClient.invalidateQueries({ queryKey: ['observations', schoolId] });
  }

  return (
    <tr>
      <td colSpan={10} className="px-5 pb-4 pt-0 bg-amber-50/20">
        <div className="border border-amber-200 rounded-xl p-4 space-y-4 bg-white shadow-sm">
          {/* Panel header */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Post-Observation Coaching
            </p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Status:</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#01696f]"
              >
                <option value="none">No Feedback</option>
                <option value="feedback_given">Awaiting Response</option>
                <option value="teacher_responded">Teacher Responded</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Notes + Response */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Observer Coaching Notes
                {isTeacher && <span className="text-gray-400 font-normal ml-1">(read-only)</span>}
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={isTeacher}
                rows={5}
                placeholder="Post-observation coaching feedback for the teacher…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f] disabled:bg-gray-50 disabled:text-gray-500 placeholder-gray-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Teacher Response
                {!isTeacher && <span className="text-gray-400 font-normal ml-1">(teacher only)</span>}
              </label>
              <textarea
                value={response}
                onChange={e => setResponse(e.target.value)}
                disabled={!isTeacher}
                rows={5}
                placeholder="Teacher's reflection and response to the feedback…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f] disabled:bg-gray-50 disabled:text-gray-500 placeholder-gray-300"
              />
            </div>
          </div>

          {/* Re-observe date + save */}
          <div className="flex items-end gap-4 flex-wrap">
            {!isTeacher && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Re-Observe Date</label>
                <input
                  type="date"
                  value={reobserveDate}
                  onChange={e => setReobserveDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                />
                {obs.reobserve_date && obs.reobserve_date !== reobserveDate && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Current: {obs.reobserve_date}
                  </p>
                )}
              </div>
            )}
            {!isTeacher && obs.reobserve_date && (
              (obs.coaching_status === 'teacher_responded' || obs.coaching_status === 'closed') && (
                <button
                  onClick={() => onScheduleReobs(obs)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-indigo-300 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-50 transition-colors"
                  title={`Schedule follow-up observation for ${obs.reobserve_date}`}
                >
                  <RotateCcw className="h-4 w-4" />
                  Schedule Re-observation
                </button>
              )
            )}
            <div className="flex-1" />
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <InlineSpinner /> : null}
              {isTeacher ? 'Save Response' : 'Save Coaching'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Cycle Timeline ───────────────────────────────────────────

function CycleTimeline({ chain, onClose }: { chain: Observation[]; onClose: () => void }) {
  if (chain.length < 2) return null;

  return (
    <div className="mb-4 bg-white border border-indigo-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-indigo-500" />
          <p className="text-sm font-semibold text-gray-800">
            Observation Cycle — {chain[0].teacher?.full_name ?? '—'}
          </p>
          <span className="text-xs text-gray-400">{chain.length} observations</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕ Close</button>
      </div>

      {/* Vertical timeline — border-left approach, no extra packages */}
      <div className="relative ml-3">
        {/* continuous vertical line */}
        <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-gray-200" />

        {chain.map((obs, idx) => {
          const avg      = avgRating(obs.domain3_ratings ?? {});
          const avgNum   = parseFloat(avg);
          const prevObs  = chain[idx - 1];
          const nextObs  = chain[idx + 1];

          // Improvement vs previous obs (lower number = better in OAAAQA)
          let improvTag: React.ReactNode = null;
          if (prevObs) {
            const prevAvg = parseFloat(avgRating(prevObs.domain3_ratings ?? {}));
            if (!isNaN(avgNum) && !isNaN(prevAvg)) {
              if (avgNum < prevAvg) {
                improvTag = <span className="text-xs font-semibold text-green-600">↑ Improved</span>;
              } else if (avgNum > prevAvg) {
                improvTag = <span className="text-xs font-semibold text-red-500">↓ Declined</span>;
              } else {
                improvTag = <span className="text-xs font-semibold text-gray-400">→ Unchanged</span>;
              }
            }
          }

          return (
            <div key={obs.id}>
              {/* Observation node */}
              <div className="relative flex items-start gap-4 pb-3">
                <div className="relative z-10 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold shrink-0 mt-0.5">
                  {obs.cycle_number ?? idx + 1}
                </div>
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="text-xs font-semibold text-gray-700">Obs {obs.cycle_number ?? idx + 1}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {obs.scheduled_date ?? formatDate(obs.observed_at)}
                      </span>
                      {obs.class && (
                        <span className="text-xs text-gray-400 ml-2">
                          · {obs.class.label} — {obs.class.subject}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isNaN(avgNum) ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: JUDGEMENT_COLORS[Math.round(avgNum) as JudgementLevel] }}
                        >
                          {avg} avg
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Not rated</span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${OBS_STATUS_STYLES[obs.obs_status ?? 'completed'].bg} ${OBS_STATUS_STYLES[obs.obs_status ?? 'completed'].text}`}>
                        {OBS_STATUS_STYLES[obs.obs_status ?? 'completed'].label}
                      </span>
                      {improvTag}
                    </div>
                  </div>
                </div>
              </div>

              {/* Coaching bridge between this and next obs */}
              {nextObs && (
                <div className="relative flex items-start gap-4 pb-3">
                  <div className="relative z-10 flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 border-2 border-amber-300 shrink-0 mt-0.5">
                    <span className="text-[9px] text-amber-700 font-bold">C</span>
                  </div>
                  <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-amber-700">Coaching</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${COACHING_STATUS_STYLES[obs.coaching_status ?? 'none'].bg} ${COACHING_STATUS_STYLES[obs.coaching_status ?? 'none'].text} ${COACHING_STATUS_STYLES[obs.coaching_status ?? 'none'].border}`}>
                        {COACHING_STATUS_STYLES[obs.coaching_status ?? 'none'].label}
                      </span>
                    </div>
                    {obs.coaching_notes && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{obs.coaching_notes}</p>
                    )}
                    {obs.teacher_response && (
                      <p className="text-xs text-blue-600 mt-1 line-clamp-1">
                        Teacher: {obs.teacher_response}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Observation Form ─────────────────────────────────────────

function ObservationForm({
  form, setForm, teachers, observers, classes, framework,
  attachInputRef, attachUploading, saving,
  onAttach, onRemoveAttach, onOpenPath, onSave, onCancel,
}: {
  form: ObsForm;
  setForm: React.Dispatch<React.SetStateAction<ObsForm>>;
  teachers: TeacherOption[];
  observers: TeacherOption[];
  classes: ClassOption[];
  framework: { standards: StandardRow[]; indicators: IndicatorRow[] } | undefined;
  attachInputRef: React.RefObject<HTMLInputElement | null>;
  attachUploading: boolean;
  saving: boolean;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttach: (path: string) => void;
  onOpenPath: (path: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const rated = ratedCount(form.ratings);
  const total = framework?.indicators.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Row 1: Teacher + Class + Observed At */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Teacher *
          </label>
          <select
            value={form.teacher_id}
            onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value, class_id: '' }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
          >
            <option value="">Select teacher…</option>
            {teachers.map(t => (
              <option key={t.user_id} value={t.user_id}>
                {t.full_name ?? t.email ?? t.user_id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Class
          </label>
          <select
            value={form.class_id}
            onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
            disabled={!form.teacher_id}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f] disabled:bg-gray-50 disabled:text-gray-400"
          >
            {!form.teacher_id ? (
              <option value="">Select a teacher first</option>
            ) : (
              <>
                <option value="">No class (general)</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {c.subject}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Observed At *
          </label>
          <input
            type="datetime-local"
            value={form.observed_at}
            onChange={e => setForm(f => ({ ...f, observed_at: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
          />
        </div>
      </div>

      {/* Row 2: Scheduled Date + Assigned Observer */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50/40 border border-blue-100 rounded-xl">
        <div>
          <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5">
            Schedule Date <span className="text-blue-400 font-normal">(optional — plan ahead)</span>
          </label>
          <input
            type="date"
            value={form.scheduled_date}
            onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5">
            Assigned Observer <span className="text-blue-400 font-normal">(optional)</span>
          </label>
          <select
            value={form.assigned_observer}
            onChange={e => setForm(f => ({ ...f, assigned_observer: e.target.value }))}
            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            <option value="">Unassigned</option>
            {observers.map(o => (
              <option key={o.user_id} value={o.user_id}>
                {o.full_name ?? o.email ?? o.user_id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Domain 3 indicator ratings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Domain 3 Indicator Ratings
          </label>
          <span className="text-xs text-gray-400">{rated}/{total} rated</span>
        </div>

        {!framework ? (
          <div className="h-32 bg-gray-50 rounded-xl animate-pulse" />
        ) : (
          <div className="space-y-3">
            {framework.standards.map(std => {
              const indicators = framework.indicators.filter(i => i.standard_id === std.id);
              return (
                <div key={std.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 font-mono">{std.id}</span>
                    <span className="text-xs font-semibold text-gray-700">{std.name_en}</span>
                    {std.is_primary && (
                      <span className="text-xs px-1.5 py-0.5 bg-[#01696f]/10 text-[#01696f] rounded font-medium">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {indicators.map(ind => (
                      <div key={ind.id} className="flex items-center gap-4 px-4 py-3">
                        <span className="text-xs font-mono font-bold text-gray-400 w-12 shrink-0">
                          {ind.id}
                        </span>
                        <p className="flex-1 text-xs text-gray-600 leading-relaxed min-w-0">
                          {ind.description_en}
                        </p>
                        <RatingButtons
                          value={form.ratings[ind.id] ?? null}
                          onChange={v => setForm(f => ({
                            ...f,
                            ratings: { ...f.ratings, [ind.id]: v },
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Qualitative notes */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Qualitative Notes
        </label>
        <textarea
          value={form.qualitative_notes}
          onChange={e => setForm(f => ({ ...f, qualitative_notes: e.target.value }))}
          rows={4}
          placeholder="Describe key observations, strengths, and areas for development…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f] placeholder-gray-400"
        />
      </div>

      {/* Evidence attachments */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Evidence Attachments
        </label>
        <div className="space-y-1.5">
          {form.attachPaths.map(p => (
            <div key={p} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs">
              <span className="text-base">📎</span>
              <button
                onClick={() => onOpenPath(p)}
                className="flex-1 text-left text-[#01696f] hover:underline truncate"
              >
                {p.split('/').pop()}
              </button>
              <button onClick={() => onRemoveAttach(p)} className="text-gray-400 hover:text-red-500 shrink-0">✕</button>
            </div>
          ))}

          <div
            className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-[#01696f]/50 transition-colors"
            onClick={() => !attachUploading && attachInputRef.current?.click()}
          >
            <input
              ref={attachInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
              className="hidden"
              onChange={onAttach}
            />
            {attachUploading ? (
              <><InlineSpinner /><span className="text-xs text-[#01696f]">Uploading…</span></>
            ) : (
              <><span className="text-base">📁</span><span className="text-xs text-gray-400">Attach files (PDF, DOCX, XLSX, JPG, PNG)</span></>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
        >
          {saving ? <InlineSpinner /> : 'Save Observation'}
        </button>
      </div>
    </div>
  );
}

// ─── Observation Detail (view mode) ──────────────────────────

function ObservationDetail({
  obs, framework, onEdit, onDelete, onOpenPath,
}: {
  obs: Observation;
  framework: { standards: StandardRow[]; indicators: IndicatorRow[] } | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPath: (path: string) => void;
}) {
  const statusStyle  = OBS_STATUS_STYLES[obs.obs_status ?? 'completed'];
  const coachStyle   = COACHING_STATUS_STYLES[obs.coaching_status ?? 'none'];
  return (
    <div className="space-y-5">
      {/* Meta */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <MetaField label="Teacher"     value={obs.teacher?.full_name ?? '—'} />
        <MetaField label="Class"       value={obs.class ? `${obs.class.label} · ${obs.class.subject}` : 'General observation'} />
        <MetaField label="Observed At" value={formatDate(obs.observed_at)} />
        <MetaField label="Observer"    value={obs.observer?.full_name ?? '—'} />
        <MetaField
          label="Rated"
          value={`${Object.values(obs.domain3_ratings ?? {}).filter(v => v != null).length} / ${framework?.indicators.length ?? '—'} indicators`}
        />
        <MetaField label="Avg Rating"  value={avgRating(obs.domain3_ratings ?? {})} />
        {obs.scheduled_date && (
          <MetaField label="Scheduled Date" value={obs.scheduled_date} />
        )}
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Status</p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
        </div>
        {obs.obs_status === 'completed' && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Coaching</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${coachStyle.bg} ${coachStyle.text} ${coachStyle.border}`}>
              {coachStyle.label}
            </span>
          </div>
        )}
        {obs.reobserve_date && (
          <MetaField label="Re-Observe Date" value={obs.reobserve_date} />
        )}
      </div>

      {/* Coaching notes + teacher response (if any) */}
      {(obs.coaching_notes || obs.teacher_response) && (
        <div className="border border-amber-200 rounded-xl p-4 space-y-3 bg-amber-50/30">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Coaching</p>
          {obs.coaching_notes && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Observer Notes</p>
              <p className="text-sm text-gray-700 bg-white rounded-lg px-3 py-2.5 border border-amber-100 leading-relaxed whitespace-pre-wrap">
                {obs.coaching_notes}
              </p>
            </div>
          )}
          {obs.teacher_response && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Teacher Response</p>
              <p className="text-sm text-gray-700 bg-white rounded-lg px-3 py-2.5 border border-amber-100 leading-relaxed whitespace-pre-wrap">
                {obs.teacher_response}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Domain 3 ratings */}
      {framework && Object.keys(obs.domain3_ratings ?? {}).length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Indicator Ratings</p>
          {framework.standards.map(std => {
            const indicators = framework.indicators.filter(i => i.standard_id === std.id);
            const anyRated = indicators.some(i => obs.domain3_ratings?.[i.id] != null);
            if (!anyRated) return null;
            return (
              <div key={std.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-400 font-mono mr-2">{std.id}</span>
                  <span className="text-xs font-semibold text-gray-700">{std.name_en}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {indicators.map(ind => {
                    const r = obs.domain3_ratings?.[ind.id];
                    if (r == null) return null;
                    const level = r as JudgementLevel;
                    return (
                      <div key={ind.id} className="flex items-center gap-4 px-4 py-2.5">
                        <span className="text-xs font-mono font-bold text-gray-400 w-12 shrink-0">{ind.id}</span>
                        <p className="flex-1 text-xs text-gray-600 min-w-0 truncate">{ind.description_en}</p>
                        <span
                          className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: JUDGEMENT_COLORS[level] }}
                        >
                          {r} — {JUDGEMENT_LABELS_SHORT[level]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Qualitative notes */}
      {obs.qualitative_notes && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Qualitative Notes</p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 leading-relaxed whitespace-pre-wrap">
            {obs.qualitative_notes}
          </p>
        </div>
      )}

      {/* Attachments */}
      {obs.evidence_files?.length ? (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Attachments ({obs.evidence_files.length})
          </p>
          <div className="space-y-1.5">
            {obs.evidence_files.map(p => (
              <button
                key={p}
                onClick={() => onOpenPath(p)}
                className="flex items-center gap-2 w-full px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs text-left hover:bg-gray-100 transition-colors"
              >
                <span className="text-base">📎</span>
                <span className="text-[#01696f] hover:underline truncate">{p.split('/').pop()}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button onClick={onDelete} className="px-4 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
          Delete
        </button>
        <button onClick={onEdit} className="px-5 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54]">
          Edit Observation
        </button>
      </div>
    </div>
  );
}

// ─── Rating Buttons ───────────────────────────────────────────

function RatingButtons({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-1 shrink-0">
      {([1, 2, 3, 4, 5] as JudgementLevel[]).map(level => {
        const active = value === level;
        return (
          <button
            key={level}
            title={`${level} — ${JUDGEMENT_LABELS_SHORT[level]}`}
            onClick={() => onChange(active ? null : level)}
            className={`w-7 h-7 rounded-md text-xs font-bold transition-all border-2 ${
              active
                ? 'text-white border-transparent scale-105 shadow-sm'
                : 'text-gray-400 bg-white border-gray-200 hover:border-gray-300'
            }`}
            style={active ? { backgroundColor: JUDGEMENT_COLORS[level], borderColor: JUDGEMENT_COLORS[level] } : {}}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────

function Modal({ title, wide, onClose, children }: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] w-full ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function EmptyState({ onRecord }: { onRecord: () => void }) {
  return (
    <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
      <p className="text-4xl mb-4">📋</p>
      <p className="text-base font-semibold text-gray-900">No observations yet</p>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        Record your first classroom observation to get started.
      </p>
      <button
        onClick={onRecord}
        className="px-5 py-2.5 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54]"
      >
        + Record Observation
      </button>
    </div>
  );
}

function InlineSpinner() {
  return (
    <svg className="inline animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SkeletonTable() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex gap-6">
        {[80, 100, 80, 60, 80, 60, 60, 80].map((w, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded" style={{ width: w }} />
        ))}
      </div>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="px-5 py-4 border-b border-gray-100 flex gap-6">
          {[80, 100, 80, 60, 80, 60, 60, 80].map((w, j) => (
            <div key={j} className="h-3.5 bg-gray-100 rounded" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  );
}
