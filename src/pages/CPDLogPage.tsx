import { useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../components/ui/toast';
import { useAcademicYears } from '../hooks/useAcademicYears';

// ─── Types ────────────────────────────────────────────────────

interface CPDEntry {
  id: string;
  school_id: string;
  teacher_id: string;
  academic_year: string;
  title: string;
  provider: string | null;
  cpd_date: string;
  hours: number;
  category: string | null;
  notes: string | null;
  evidence_path: string | null;
  created_at: string;
  teacher: { id: string; full_name: string | null } | null;
}

interface TeacherOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface CPDForm {
  teacher_id: string;
  title: string;
  provider: string;
  cpd_date: string;
  hours: string;
  category: string;
  notes: string;
  evidence_path: string;
}

const EMPTY_FORM: CPDForm = {
  teacher_id: '',
  title: '',
  provider: '',
  cpd_date: new Date().toISOString().slice(0, 10),
  hours: '1',
  category: '',
  notes: '',
  evidence_path: '',
};

// ─── Constants ────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  subject_knowledge: 'Subject Knowledge',
  pedagogy:          'Pedagogy',
  leadership:        'Leadership',
  safeguarding:      'Safeguarding',
  digital:           'Digital Skills',
  assessment:        'Assessment',
  other:             'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  subject_knowledge: '#01696f',
  pedagogy:          '#3b82f6',
  leadership:        '#8b5cf6',
  safeguarding:      '#ef4444',
  digital:           '#06b6d4',
  assessment:        '#f59e0b',
  other:             '#9ca3af',
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);

// ─── Queries ─────────────────────────────────────────────────

function useCPDEntries(
  schoolId: string | undefined,
  academicYear: string,
  teacherId?: string,
) {
  return useQuery({
    queryKey: ['cpd-entries', schoolId, academicYear, teacherId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('cpd_entries')
        .select('*, teacher:teacher_id(id, full_name)')
        .eq('school_id', schoolId!)
        .eq('academic_year', academicYear)
        .order('cpd_date', { ascending: false });
      if (teacherId) q = q.eq('teacher_id', teacherId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CPDEntry[];
    },
    enabled: !!schoolId && !!academicYear,
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

// ─── Page ─────────────────────────────────────────────────────

export default function CPDLogPage() {
  const { t } = useTranslation();
  const catLabel = (cat: string) => t(`cpd.cat_${cat}`, { defaultValue: CATEGORY_LABELS[cat] ?? cat });
  const { school, profile } = useSchoolStore();
  const { isTeacher } = usePermissions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { years, currentYear } = useAcademicYears();

  const [yearFilter, setYearFilter]         = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [modalMode, setModalMode]           = useState<'closed' | 'create' | 'edit'>('closed');
  const [activeEntry, setActiveEntry]       = useState<CPDEntry | null>(null);
  const [form, setForm]                     = useState<CPDForm>(EMPTY_FORM);
  const [saving, setSaving]                 = useState(false);
  const [uploading, setUploading]           = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolved year — falls through to current year, then first year, then calendar year
  const resolvedYear =
    yearFilter ||
    currentYear?.label ||
    years[0]?.label ||
    String(new Date().getFullYear());

  // Teachers can only see their own entries
  const ownTeacherFilter = isTeacher ? (profile?.id ?? undefined) : undefined;
  const { data: entries = [], isLoading } = useCPDEntries(school?.id, resolvedYear, ownTeacherFilter);
  const { data: teachers = [] } = useTeachers(school?.id);

  // ── Derived data ─────────────────────────────────────────────

  // For admin/HOD: group all entries by teacher for the summary table
  const teacherSummary = useMemo(() => {
    if (isTeacher) return [];
    const map = new Map<string, {
      full_name: string | null;
      hours: number;
      count: number;
      lastDate: string;
    }>();
    for (const e of entries) {
      const existing = map.get(e.teacher_id);
      if (existing) {
        existing.hours  += Number(e.hours);
        existing.count  += 1;
        if (e.cpd_date > existing.lastDate) existing.lastDate = e.cpd_date;
      } else {
        map.set(e.teacher_id, {
          full_name: e.teacher?.full_name ?? null,
          hours:     Number(e.hours),
          count:     1,
          lastDate:  e.cpd_date,
        });
      }
    }
    // Ensure all active teachers appear even with 0 entries
    for (const t of teachers) {
      if (!map.has(t.user_id)) {
        map.set(t.user_id, { full_name: t.full_name, hours: 0, count: 0, lastDate: '' });
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.hours - a.hours);
  }, [entries, teachers, isTeacher]);

  // Entries visible in the current panel (drill-down or own)
  const displayEntries = useMemo(() => {
    if (!isTeacher && selectedTeacherId) {
      return entries.filter(e => e.teacher_id === selectedTeacherId);
    }
    return entries;
  }, [entries, isTeacher, selectedTeacherId]);

  const totalHours = useMemo(
    () => displayEntries.reduce((s, e) => s + Number(e.hours), 0),
    [displayEntries],
  );

  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of displayEntries) {
      const cat = e.category ?? 'other';
      map.set(cat, (map.get(cat) ?? 0) + Number(e.hours));
    }
    return CATEGORIES
      .map(cat => ({ cat, name: catLabel(cat), hours: map.get(cat) ?? 0 }))
      .filter(d => d.hours > 0)
      .sort((a, b) => b.hours - a.hours);
  }, [displayEntries, t]);

  const selectedTeacherName = selectedTeacherId
    ? (teacherSummary.find(t => t.id === selectedTeacherId)?.full_name ?? 'Teacher')
    : null;

  // ── Open modal ────────────────────────────────────────────────
  function openCreate() {
    const defaultTeacher = isTeacher
      ? (profile?.id ?? '')
      : (selectedTeacherId ?? '');
    setActiveEntry(null);
    setForm({ ...EMPTY_FORM, teacher_id: defaultTeacher });
    setModalMode('create');
  }

  function openEdit(entry: CPDEntry) {
    setActiveEntry(entry);
    setForm({
      teacher_id:    entry.teacher_id,
      title:         entry.title,
      provider:      entry.provider ?? '',
      cpd_date:      entry.cpd_date,
      hours:         String(entry.hours),
      category:      entry.category ?? '',
      notes:         entry.notes ?? '',
      evidence_path: entry.evidence_path ?? '',
    });
    setModalMode('edit');
  }

  // ── Save ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!school || !profile) return;
    if (!form.title.trim()) { showToast('Title is required', 'error'); return; }
    if (!form.cpd_date)     { showToast('Date is required', 'error'); return; }
    const teacherId = isTeacher ? profile.id : form.teacher_id;
    if (!teacherId) { showToast('Select a teacher', 'error'); return; }

    const payload = {
      school_id:     school.id,
      teacher_id:    teacherId,
      academic_year: resolvedYear,
      title:         form.title.trim(),
      provider:      form.provider.trim() || null,
      cpd_date:      form.cpd_date,
      hours:         parseFloat(form.hours) || 1,
      category:      form.category || null,
      notes:         form.notes.trim() || null,
      evidence_path: form.evidence_path || null,
    };

    setSaving(true);
    let error: { message: string } | null = null;
    if (modalMode === 'edit' && activeEntry) {
      ({ error } = await supabase.from('cpd_entries').update(payload).eq('id', activeEntry.id));
    } else {
      ({ error } = await supabase.from('cpd_entries').insert(payload));
    }
    setSaving(false);
    if (error) { showToast(`Save failed: ${error.message}`, 'error'); return; }

    queryClient.invalidateQueries({ queryKey: ['cpd-entries', school.id] });
    showToast(modalMode === 'edit' ? 'Entry updated' : 'CPD entry added', 'success');
    setModalMode('closed');
  }

  // ── Delete ────────────────────────────────────────────────────
  async function handleDelete(entry: CPDEntry) {
    if (!window.confirm('Delete this CPD entry?')) return;
    const { error } = await supabase.from('cpd_entries').delete().eq('id', entry.id);
    if (error) { showToast(error.message, 'error'); return; }
    queryClient.invalidateQueries({ queryKey: ['cpd-entries', school?.id] });
    showToast('Entry deleted', 'info');
  }

  // ── File upload ───────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!school) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${school.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('cpd-evidence').upload(path, file);
    setUploading(false);
    if (error) { showToast(`Upload failed: ${error.message}`, 'error'); return; }
    setForm(f => ({ ...f, evidence_path: path }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [school, showToast]);

  async function openEvidence(path: string) {
    const { data } = await supabase.storage.from('cpd-evidence').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  // ── Render ────────────────────────────────────────────────────
  const showDrillDown = !isTeacher && selectedTeacherId !== null;
  const showSummaryTable = !isTeacher && selectedTeacherId === null;

  return (
    <div className="min-h-screen bg-[#f7f6f2]">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            {showDrillDown ? (
              <div>
                <button
                  onClick={() => setSelectedTeacherId(null)}
                  className="flex items-center gap-1 text-sm text-[#01696f] hover:text-[#0c4e54] mb-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('cpd.allTeachers')}
                </button>
                <h1 className="text-2xl font-semibold text-gray-900">{selectedTeacherName}</h1>
              </div>
            ) : (
              <h1 className="text-2xl font-semibold text-gray-900">{t('nav.cpdLog')}</h1>
            )}
            <p className="text-sm text-gray-500 mt-1">
              {showSummaryTable
                ? `${teachers.length} teacher${teachers.length !== 1 ? 's' : ''} · ${entries.reduce((s, e) => s + Number(e.hours), 0).toFixed(1)} total hours`
                : `${displayEntries.length} entr${displayEntries.length !== 1 ? 'ies' : 'y'} · ${totalHours.toFixed(1)} hours`
              }
            </p>
          </div>

          <div className="flex items-center gap-3">
            {years.length > 0 && (
              <select
                value={resolvedYear}
                onChange={e => setYearFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
              >
                {years.map(y => (
                  <option key={y.id} value={y.label}>{y.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
            >
              + {t('cpd.addEntry')}
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* ── Summary bar (when entries exist in current view) ── */}
        {(showDrillDown || isTeacher) && displayEntries.length > 0 && (
          <div className="grid grid-cols-2 gap-5">

            {/* Stats card */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                {resolvedYear} {t('cpd.yearSummary')}
              </p>
              <div className="flex items-end gap-8">
                <div>
                  <p className="text-4xl font-bold text-[#01696f]">{totalHours.toFixed(1)}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('cpd.totalHours')}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-700">{displayEntries.length}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('cpd.entries')}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-700">{categoryChartData.length}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('cpd.categories')}</p>
                </div>
              </div>
            </div>

            {/* Category chart */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('cpd.hoursByCategory')}
              </p>
              <ResponsiveContainer
                width="100%"
                height={Math.max(categoryChartData.length * 28, 70)}
              >
                <BarChart
                  layout="vertical"
                  data={categoryChartData}
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [Number(v ?? 0).toFixed(1) + ' hrs', 'Hours']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {categoryChartData.map(d => (
                      <Cell key={d.cat} fill={CATEGORY_COLORS[d.cat] ?? '#9ca3af'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── School-wide summary for admin/HOD overview ── */}
        {showSummaryTable && entries.length > 0 && (
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                {resolvedYear} — {t('cpd.schoolOverview')}
              </p>
              <div className="flex items-end gap-8">
                <div>
                  <p className="text-4xl font-bold text-[#01696f]">
                    {entries.reduce((s, e) => s + Number(e.hours), 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{t('cpd.totalHours')}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-700">{entries.length}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('cpd.entries')}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-700">
                    {teacherSummary.filter(ts => ts.hours > 0).length}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{t('cpd.activeTeachers')}</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('cpd.hoursByCategoryAll')}
              </p>
              {(() => {
                const allCatData = (() => {
                  const map = new Map<string, number>();
                  for (const e of entries) {
                    const cat = e.category ?? 'other';
                    map.set(cat, (map.get(cat) ?? 0) + Number(e.hours));
                  }
                  return CATEGORIES
                    .map(cat => ({ cat, name: catLabel(cat), hours: map.get(cat) ?? 0 }))
                    .filter(d => d.hours > 0)
                    .sort((a, b) => b.hours - a.hours);
                })();
                return (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(allCatData.length * 28, 70)}
                  >
                    <BarChart
                      layout="vertical"
                      data={allCatData}
                      margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [Number(v ?? 0).toFixed(1) + ' hrs', 'Hours']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={16}>
                        {allCatData.map(d => (
                          <Cell key={d.cat} fill={CATEGORY_COLORS[d.cat] ?? '#9ca3af'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Main content ── */}
        {isLoading ? (
          <SkeletonTable />
        ) : showSummaryTable ? (
          /* Admin/HOD: teacher summary table */
          teacherSummary.length === 0 ? (
            <EmptyState isTeacher={false} onAdd={openCreate} />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.teacher')}</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.totalHoursCol')}</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.entries')}</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.lastActivity')}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {teacherSummary.map(ts => (
                    <tr
                      key={ts.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedTeacherId(ts.id)}
                    >
                      <td className="px-5 py-3 font-medium text-gray-800">
                        {ts.full_name ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={
                          ts.hours >= 20 ? 'font-semibold text-green-700' :
                          ts.hours > 0   ? 'font-semibold text-amber-700' :
                          'text-gray-400'
                        }>
                          {ts.hours.toFixed(1)} hrs
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{ts.count}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{ts.lastDate || '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-xs text-[#01696f]">{t('cpd.viewEntries')} →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Teacher view or drill-down: entry table */
          displayEntries.length === 0 ? (
            <EmptyState isTeacher={isTeacher} onAdd={openCreate} />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.date')}</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.activity')}</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.provider')}</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.category')}</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.hours')}</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">{t('cpd.notes')}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 whitespace-nowrap text-gray-600 text-sm">
                        {entry.cpd_date}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-800">
                        <div className="flex items-center gap-2">
                          {entry.title}
                          {entry.evidence_path && (
                            <button
                              onClick={() => openEvidence(entry.evidence_path!)}
                              title="View evidence"
                              className="text-[#01696f] hover:text-[#0c4e54] text-base shrink-0"
                            >
                              📎
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{entry.provider ?? '—'}</td>
                      <td className="px-5 py-3">
                        {entry.category ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap"
                            style={{ backgroundColor: CATEGORY_COLORS[entry.category] ?? '#9ca3af' }}
                          >
                            {catLabel(entry.category)}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-700">
                        {Number(entry.hours).toFixed(1)}
                      </td>
                      <td className="px-5 py-3 max-w-xs">
                        {entry.notes
                          ? <p className="text-xs text-gray-500 line-clamp-2">{entry.notes}</p>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <button
                            onClick={() => openEdit(entry)}
                            className="text-xs text-[#01696f] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(entry)}
                            className="text-xs text-red-400 hover:text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Modal ── */}
      {modalMode !== 'closed' && (
        <Modal
          title={modalMode === 'edit' ? t('cpd.editEntry') : t('cpd.addEntry')}
          onClose={() => setModalMode('closed')}
        >
          <CPDEntryForm
            form={form}
            setForm={setForm}
            teachers={teachers}
            isTeacher={isTeacher}
            isEdit={modalMode === 'edit'}
            uploading={uploading}
            saving={saving}
            fileInputRef={fileInputRef}
            onFileUpload={handleFileUpload}
            onClearEvidence={() => setForm(f => ({ ...f, evidence_path: '' }))}
            onSave={handleSave}
            onCancel={() => setModalMode('closed')}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── CPD Entry Form ───────────────────────────────────────────

function CPDEntryForm({
  form, setForm, teachers, isTeacher, isEdit,
  uploading, saving, fileInputRef,
  onFileUpload, onClearEvidence, onSave, onCancel,
}: {
  form: CPDForm;
  setForm: React.Dispatch<React.SetStateAction<CPDForm>>;
  teachers: TeacherOption[];
  isTeacher: boolean;
  isEdit: boolean;
  uploading: boolean;
  saving: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearEvidence: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const catLabel = (cat: string) => t(`cpd.cat_${cat}`, { defaultValue: CATEGORY_LABELS[cat] ?? cat });
  return (
    <div className="space-y-4">
      {/* Teacher selector — admin/HOD only */}
      {!isTeacher && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cpd.teacher')} *
          </label>
          <select
            value={form.teacher_id}
            onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
          >
            <option value="">{t('observations.selectTeacher')}</option>
            {teachers.map(t => (
              <option key={t.user_id} value={t.user_id}>
                {t.full_name ?? t.email ?? t.user_id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {t('cpd.activityTitle')} *
        </label>
        <input
          type="text"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Differentiated Learning Workshop"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f] placeholder-gray-300"
        />
      </div>

      {/* Provider + Date + Hours */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cpd.provider')}
          </label>
          <input
            type="text"
            value={form.provider}
            onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
            placeholder="e.g. MOE Oman"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f] placeholder-gray-300"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cpd.date')} *
          </label>
          <input
            type="date"
            value={form.cpd_date}
            onChange={e => setForm(f => ({ ...f, cpd_date: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cpd.hours')} *
          </label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={form.hours}
            onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {t('cpd.category')}
        </label>
        <select
          value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        >
          <option value="">{t('cpd.selectCategory')}</option>
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{catLabel(cat)}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {t('cpd.notes')}
        </label>
        <textarea
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3}
          placeholder="Key learnings, reflections, how this will impact your practice…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f] placeholder-gray-300"
        />
      </div>

      {/* Evidence */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {t('sef.evidence')} <span className="text-gray-400 font-normal">({t('actions.optional')})</span>
        </label>
        {form.evidence_path ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs">
            <span className="text-base">📎</span>
            <span className="flex-1 text-[#01696f] truncate">{form.evidence_path.split('/').pop()}</span>
            <button onClick={onClearEvidence} className="text-gray-400 hover:text-red-500 shrink-0">✕</button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-[#01696f]/50 transition-colors"
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx"
              className="hidden"
              onChange={onFileUpload}
            />
            {uploading ? (
              <><InlineSpinner /><span className="text-xs text-[#01696f] ml-1">Uploading…</span></>
            ) : (
              <><span className="text-base">📁</span><span className="text-xs text-gray-400">Attach certificate or evidence (PDF, DOCX, JPG, PNG)</span></>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          {t('actions.cancel')}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
        >
          {saving ? <InlineSpinner /> : isEdit ? t('cpd.updateEntry') : t('cpd.addEntryBtn')}
        </button>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────

function EmptyState({ isTeacher, onAdd }: { isTeacher: boolean; onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
      <p className="text-4xl mb-4">🎓</p>
      <p className="text-base font-semibold text-gray-900">{t('cpd.noCpdEntries')}</p>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        {isTeacher ? t('cpd.noCpdEntriesHint') : t('cpd.noCpdEntriesAdminHint')}
      </p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54]"
      >
        + {t('cpd.addEntry')}
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
        {[80, 160, 100, 80, 50, 120].map((w, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded" style={{ width: w }} />
        ))}
      </div>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="px-5 py-4 border-b border-gray-100 flex gap-6">
          {[80, 160, 100, 80, 50, 120].map((w, j) => (
            <div key={j} className="h-3.5 bg-gray-100 rounded" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  );
}
