import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { useAcademicYears } from '../hooks/useAcademicYears';

type SettingsTab = 'profile' | 'academic-years' | 'audit' | 'notifications' | 'users';

// ─── Role options shown in the invite / edit dropdowns ───────
const ROLE_OPTIONS = [
  { value: 'school_admin', label: 'School Admin' },
  { value: 'hod',          label: 'Head of Department' },
  { value: 'teacher',      label: 'Teacher' },
  { value: 'viewer',       label: 'Viewer (read-only)' },
] as const;

type UIRole = typeof ROLE_OPTIONS[number]['value'];

// DB role values as stored in school_members
type DBRole =
  | 'school_admin'
  | 'head_of_department'
  | 'teacher'
  | 'auditor';

const UI_TO_DB_ROLE: Record<UIRole, DBRole> = {
  school_admin: 'school_admin',
  hod:          'head_of_department',
  teacher:      'teacher',
  viewer:       'auditor',
};

const DB_TO_UI_ROLE: Partial<Record<string, UIRole>> = {
  school_admin:      'school_admin',
  head_of_department: 'hod',
  teacher:           'teacher',
  auditor:           'viewer',
};

const ROLE_LABELS: Record<string, string> = {
  school_admin:       'School Admin',
  principal:          'Principal',
  vice_principal:     'Vice Principal',
  senior_management:  'Senior Management',
  head_of_department: 'Head of Department',
  quality_coordinator:'Quality Coordinator',
  teacher:            'Teacher',
  auditor:            'Viewer',
};

// ─── Types ────────────────────────────────────────────────────

interface Member {
  id: string;          // school_members.id
  user_id: string;
  role: string;
  status: string;
  email: string;
  full_name: string | null;
  department: string | null;
}

interface ClassRow {
  id: string;
  label: string;
  subject: string;
  teacher_id: string | null;
}

// ─── Main page ────────────────────────────────────────────────

export default function SchoolSettingsPage() {
  const { school, setSchool } = useSchoolStore();
  const perms = usePermissions();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // School profile form state
  const [form, setForm] = useState({
    name_en: '',
    name_ar: '',
    school_type: 'public' as 'public' | 'private',
    governorate: '',
    wilayat: '',
    principal_name: '',
    total_students_male: 0,
    total_students_female: 0,
    total_teachers: 0,
    vision_statement: '',
    mission_statement: '',
  });

  useEffect(() => {
    if (school) {
      setForm({
        name_en:               school.name_en || '',
        name_ar:               school.name_ar || '',
        school_type:           (school.school_type || 'public') as 'public' | 'private',
        governorate:           school.governorate || '',
        wilayat:               school.wilayat || '',
        principal_name:        school.principal_name || '',
        total_students_male:   school.total_students_male || 0,
        total_students_female: school.total_students_female || 0,
        total_teachers:        school.total_teachers || 0,
        vision_statement:      school.vision_statement || '',
        mission_statement:     school.mission_statement || '',
      });
    }
  }, [school?.id]);

  async function saveProfile() {
    if (!school?.id) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('schools')
      .update(form)
      .eq('id', school.id)
      .select()
      .single();
    if (error) {
      setError(error.message);
    } else {
      setSchool(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  const TabBtn = ({ id, label }: { id: SettingsTab; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        activeTab === id
          ? 'bg-[#01696f] text-white'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">{school?.name_en}</p>
      </div>

      <div className="px-8 pt-6">
        <div className="flex gap-1.5 flex-wrap bg-white border border-gray-200 rounded-xl p-1.5 w-fit shadow-sm">
          <TabBtn id="profile"        label="School Profile" />
          <TabBtn id="academic-years" label="Academic Years" />
          <TabBtn id="audit"          label="Audit Dates" />
          <TabBtn id="notifications"  label="Notifications" />
          {perms.canManageUsers && <TabBtn id="users" label="Users" />}
        </div>
      </div>

      <div className="px-8 py-6 max-w-4xl">

        {/* ── SCHOOL PROFILE ──────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            <h2 className="text-base font-semibold text-gray-800">School Profile</h2>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
            )}
            {saved && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                ✓ Profile saved successfully.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="School Name (English) *">
                <input
                  type="text"
                  value={form.name_en}
                  onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="School Name (Arabic)">
                <input
                  type="text"
                  value={form.name_ar}
                  onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
                  dir="rtl"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="School Type">
                <select
                  value={form.school_type}
                  onChange={e => setForm(f => ({ ...f, school_type: e.target.value as 'public' | 'private' }))}
                  className={inputCls}
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </Field>
              <Field label="Governorate">
                <input
                  type="text"
                  value={form.governorate}
                  onChange={e => setForm(f => ({ ...f, governorate: e.target.value }))}
                  placeholder="e.g. Muscat"
                  className={inputCls}
                />
              </Field>
              <Field label="Wilayat">
                <input
                  type="text"
                  value={form.wilayat}
                  onChange={e => setForm(f => ({ ...f, wilayat: e.target.value }))}
                  placeholder="e.g. Seeb"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Principal Name">
              <input
                type="text"
                value={form.principal_name}
                onChange={e => setForm(f => ({ ...f, principal_name: e.target.value }))}
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Male Students">
                <input
                  type="number"
                  min={0}
                  value={form.total_students_male}
                  onChange={e => setForm(f => ({ ...f, total_students_male: +e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Female Students">
                <input
                  type="number"
                  min={0}
                  value={form.total_students_female}
                  onChange={e => setForm(f => ({ ...f, total_students_female: +e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Total Teachers">
                <input
                  type="number"
                  min={0}
                  value={form.total_teachers}
                  onChange={e => setForm(f => ({ ...f, total_teachers: +e.target.value }))}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Vision Statement">
              <textarea
                value={form.vision_statement}
                onChange={e => setForm(f => ({ ...f, vision_statement: e.target.value }))}
                rows={3}
                className={`${inputCls} resize-none`}
                placeholder="The school's vision..."
              />
            </Field>

            <Field label="Mission Statement">
              <textarea
                value={form.mission_statement}
                onChange={e => setForm(f => ({ ...f, mission_statement: e.target.value }))}
                rows={3}
                className={`${inputCls} resize-none`}
                placeholder="The school's mission..."
              />
            </Field>

            <div className="flex justify-end pt-2">
              <button
                onClick={saveProfile}
                disabled={saving || !perms.canManageUsers}
                className="px-6 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        )}

        {/* ── ACADEMIC YEARS ───────────────────────────────────── */}
        {activeTab === 'academic-years' && <AcademicYearsPanel />}

        {/* ── AUDIT DATES ──────────────────────────────────────── */}
        {activeTab === 'audit' && <AuditDatesPanel />}

        {/* ── NOTIFICATIONS ────────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Notification Preferences</h2>
            <p className="text-sm text-gray-500">Email notification configuration coming soon.</p>
          </div>
        )}

        {/* ── USERS ────────────────────────────────────────────── */}
        {activeTab === 'users' && <UsersPanel />}

      </div>
    </div>
  );
}

// ─── Academic Years Panel ─────────────────────────────────────

const ALL_YEAR_OPTIONS: string[] = Array.from({ length: 21 }, (_, i) => {
  const start = 2024 + i;
  return `${start}-${start + 1}`;
});

function AcademicYearsPanel() {
  const { years, loading, error, createYear, setCurrentYear, deleteYear } = useAcademicYears();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const existingLabels = new Set(years.map(y => y.label));
  const availableOptions = ALL_YEAR_OPTIONS.filter(y => !existingLabels.has(y));

  function openCreate() {
    setSelectedLabel(availableOptions[0] ?? '');
    setActionError(null);
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!selectedLabel) return;
    setCreating(true);
    setActionError(null);
    try {
      await createYear(selectedLabel);
      setShowCreate(false);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Academic Years</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            The active year determines which data is shown across the app.
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={availableOptions.length === 0}
          className="px-3 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New Year
        </button>
      </div>

      {(error || actionError) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error || actionError}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : years.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">No academic years configured.</p>
          <button onClick={openCreate} className="mt-2 text-[#01696f] text-sm hover:underline">
            Create your first year
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {years.map(year => (
            <div
              key={year.id}
              className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                year.is_current
                  ? 'border-[#01696f] bg-[#01696f]/5'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {year.is_current && <span className="w-2 h-2 bg-[#01696f] rounded-full" />}
                <p className="text-sm font-semibold text-gray-800">{year.label}</p>
                {year.is_current && (
                  <span className="text-xs px-2 py-0.5 bg-[#01696f] text-white rounded-full font-medium">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!year.is_current && (
                  <button
                    onClick={() => setCurrentYear(year.id)}
                    className="text-xs text-[#01696f] hover:underline font-medium"
                  >
                    Set Active
                  </button>
                )}
                {!year.is_current && (
                  <button
                    onClick={() => deleteYear(year.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Add Academic Year</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <Field label="Academic Year">
                <select
                  value={selectedLabel}
                  onChange={e => setSelectedLabel(e.target.value)}
                  className={inputCls}
                >
                  {availableOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </Field>
              {actionError && <p className="text-red-600 text-sm">{actionError}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={creating || !selectedLabel}
                  className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
                >
                  {creating ? 'Adding...' : 'Add Year'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
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

// ─── Audit Dates Panel ────────────────────────────────────────

function AuditDatesPanel() {
  const { school } = useSchoolStore();
  const [form, setForm] = useState({ expected_audit_date: '', last_audit_date: '', last_audit_judgement: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!school?.id) return;
    (async () => {
      const { data } = await supabase.from('audit_settings').select('*').eq('school_id', school.id).maybeSingle();
      if (data) {
        setForm({
          expected_audit_date:  data.expected_audit_date  || '',
          last_audit_date:      data.last_audit_date      || '',
          last_audit_judgement: data.last_audit_judgement || '',
          notes:                data.notes                || '',
        });
      }
      setLoading(false);
    })();
  }, [school?.id]);

  async function save() {
    if (!school?.id) return;
    setSaving(true);
    setError(null);
    const payload = {
      school_id:            school.id,
      expected_audit_date:  form.expected_audit_date  || null,
      last_audit_date:      form.last_audit_date      || null,
      last_audit_judgement: form.last_audit_judgement || null,
      notes:                form.notes                || null,
      updated_at:           new Date().toISOString(),
    };
    const { error } = await supabase.from('audit_settings').upsert(payload, { onConflict: 'school_id' });
    if (error) setError(error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setSaving(false);
  }

  if (loading) return <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse h-48" />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-800">Audit Dates</h2>
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {saved && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">✓ Audit dates saved.</div>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Expected Audit Date">
          <input type="date" value={form.expected_audit_date} onChange={e => setForm(f => ({ ...f, expected_audit_date: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="Last Audit Date">
          <input type="date" value={form.last_audit_date} onChange={e => setForm(f => ({ ...f, last_audit_date: e.target.value }))} className={inputCls} />
        </Field>
      </div>
      <Field label="Last Audit Judgement">
        <select value={form.last_audit_judgement} onChange={e => setForm(f => ({ ...f, last_audit_judgement: e.target.value }))} className={inputCls}>
          <option value="">— Not set —</option>
          <option value="Outstanding">Outstanding</option>
          <option value="Good">Good</option>
          <option value="Satisfactory">Satisfactory</option>
          <option value="Unsatisfactory">Unsatisfactory</option>
          <option value="Needs Urgent Intervention">Needs Urgent Intervention</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className={`${inputCls} resize-none`} placeholder="Any notes about the upcoming or last audit..." />
      </Field>
      <div className="flex justify-end pt-2">
        <button onClick={save} disabled={saving} className="px-6 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Audit Dates'}
        </button>
      </div>
    </div>
  );
}

// ─── Users Panel ──────────────────────────────────────────────

function UsersPanel() {
  const { school } = useSchoolStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '', full_name: '', role: 'teacher' as UIRole, subject_area: '',
  });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Edit modal state
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState({
    role: 'teacher' as UIRole, subject_area: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState<string | null>(null);

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving]         = useState(false);

  async function load() {
    if (!school?.id) return;
    setLoading(true);
    setError(null);
    const [{ data: memberRows, error: membErr }, { data: classRows }] = await Promise.all([
      supabase
        .from('school_members')
        .select('id, user_id, role, status, profiles!school_members_user_id_fkey(email, full_name, department)')
        .eq('school_id', school.id)
        .order('role'),
      supabase
        .from('classes')
        .select('id, label, subject, teacher_id')
        .eq('school_id', school.id)
        .order('label'),
    ]);

    if (membErr) {
      setError(membErr.message);
    } else {
      const mapped: Member[] = (memberRows ?? []).map((m: Record<string, unknown>) => {
        const p = m.profiles as { email?: string; full_name?: string; department?: string } | null;
        return {
          id:         m.id as string,
          user_id:    m.user_id as string,
          role:       m.role as string,
          status:     m.status as string,
          email:      p?.email      ?? '',
          full_name:  p?.full_name  ?? null,
          department: p?.department ?? null,
        };
      });
      setMembers(mapped);
    }

    setClasses(
      (classRows ?? []).map((c: Record<string, unknown>) => ({
        id:         c.id as string,
        label:      c.label as string,
        subject:    c.subject as string,
        teacher_id: c.teacher_id as string | null,
      }))
    );
    setLoading(false);
  }

  useEffect(() => { void load(); }, [school?.id]);

  // ── Invite ────────────────────────────────────────────────
  function openInvite() {
    setInviteForm({ email: '', full_name: '', role: 'teacher', subject_area: '' });
    setInviteError(null);
    setInviteSuccess(null);
    setShowInvite(true);
  }

  async function handleInvite() {
    if (!school?.id || !inviteForm.email || !inviteForm.role) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setInviteError('Not authenticated'); setInviting(false); return; }

    const res = await supabase.functions.invoke('invite-user', {
      body: {
        email:        inviteForm.email.trim(),
        full_name:    inviteForm.full_name.trim() || undefined,
        role:         inviteForm.role,
        subject_area: inviteForm.subject_area.trim() || undefined,
        school_id:    school.id,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.error || (res.data as { error?: string } | null)?.error) {
      setInviteError(
        (res.data as { error?: string } | null)?.error ?? res.error?.message ?? 'Invite failed'
      );
    } else {
      setInviteSuccess(`Invitation sent to ${inviteForm.email}`);
      setInviteForm({ email: '', full_name: '', role: 'teacher', subject_area: '' });
      await load();
    }
    setInviting(false);
  }

  // ── Edit member ───────────────────────────────────────────
  function openEdit(m: Member) {
    setEditMember(m);
    setEditForm({
      role:         (DB_TO_UI_ROLE[m.role] ?? 'teacher') as UIRole,
      subject_area: m.department ?? '',
    });
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editMember || !school?.id) return;
    setEditSaving(true);
    setEditError(null);

    const dbRole = UI_TO_DB_ROLE[editForm.role];

    // Update school_members role
    const { error: smErr } = await supabase
      .from('school_members')
      .update({ role: dbRole })
      .eq('id', editMember.id);

    if (smErr) { setEditError(smErr.message); setEditSaving(false); return; }

    // Update profiles.role + profiles.department
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ role: dbRole, department: editForm.subject_area || null })
      .eq('id', editMember.user_id);

    if (profErr) { setEditError(profErr.message); setEditSaving(false); return; }

    setEditMember(null);
    await load();
    setEditSaving(false);
  }

  // ── Classes assignment for a teacher ─────────────────────
  const teacherClasses = editMember
    ? classes.filter(c => c.teacher_id === editMember.user_id)
    : [];

  const allClassesForTeacher = editMember
    ? classes.filter(c => c.teacher_id === editMember.user_id || c.teacher_id === null)
    : [];

  async function toggleClass(cls: ClassRow, assigned: boolean) {
    if (!editMember) return;
    await supabase
      .from('classes')
      .update({ teacher_id: assigned ? editMember.user_id : null })
      .eq('id', cls.id);
    await load();
  }

  // ── Remove member ─────────────────────────────────────────
  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const { error } = await supabase
      .from('school_members')
      .delete()
      .eq('id', removeTarget.id);
    if (!error) {
      setRemoveTarget(null);
      await load();
    }
    setRemoving(false);
  }

  // ── Role needs subject area ───────────────────────────────
  const needsSubject = (r: UIRole) => r === 'teacher' || r === 'hod';

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-gray-800">School Users</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Invite and manage staff access to this school.
          </p>
        </div>
        <button
          onClick={openInvite}
          className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
        >
          + Invite User
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">No users found. Invite someone to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left pb-3 font-medium text-gray-500 pr-4">Name / Email</th>
                <th className="text-left pb-3 font-medium text-gray-500 pr-4">Role</th>
                <th className="text-left pb-3 font-medium text-gray-500 pr-4">Subject</th>
                <th className="text-left pb-3 font-medium text-gray-500 pr-4">Status</th>
                <th className="text-right pb-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-gray-800">{m.full_name || '—'}</div>
                    <div className="text-gray-400 text-xs">{m.email}</div>
                  </td>
                  <td className="py-3 pr-4 text-gray-700">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </td>
                  <td className="py-3 pr-4 text-gray-500">
                    {m.department || '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : m.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => openEdit(m)}
                      className="text-xs text-[#01696f] hover:underline mr-3 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setRemoveTarget(m)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── INVITE MODAL ─────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Invite User</h3>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {inviteSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                ✓ {inviteSuccess}
              </div>
            )}
            {inviteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {inviteError}
              </div>
            )}

            <div className="space-y-4">
              <Field label="Email address *">
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="teacher@school.edu.om"
                  className={inputCls}
                  autoFocus
                />
              </Field>
              <Field label="Full name">
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Optional"
                  className={inputCls}
                />
              </Field>
              <Field label="Role *">
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as UIRole }))}
                  className={inputCls}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </Field>
              {needsSubject(inviteForm.role) && (
                <Field label="Subject area">
                  <input
                    type="text"
                    value={inviteForm.subject_area}
                    onChange={e => setInviteForm(f => ({ ...f, subject_area: e.target.value }))}
                    placeholder="e.g. Mathematics"
                    className={inputCls}
                  />
                </Field>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteForm.email}
                className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
              >
                {inviting ? 'Sending invite...' : 'Send Invitation'}
              </button>
              <button
                onClick={() => setShowInvite(false)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MEMBER MODAL ────────────────────────────────── */}
      {editMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit — {editMember.full_name || editMember.email}
              </h3>
              <button onClick={() => setEditMember(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {editError}
              </div>
            )}

            <div className="space-y-4">
              <Field label="Role">
                <select
                  value={editForm.role}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value as UIRole }))}
                  className={inputCls}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </Field>

              {needsSubject(editForm.role) && (
                <Field label="Subject area">
                  <input
                    type="text"
                    value={editForm.subject_area}
                    onChange={e => setEditForm(f => ({ ...f, subject_area: e.target.value }))}
                    placeholder="e.g. Mathematics"
                    className={inputCls}
                  />
                </Field>
              )}

              {/* ── Class assignment (teachers only) ──────────── */}
              {editForm.role === 'teacher' && classes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assigned Classes
                  </label>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {allClassesForTeacher.map(cls => {
                      const assigned = teacherClasses.some(tc => tc.id === cls.id);
                      return (
                        <label
                          key={cls.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={assigned}
                            onChange={e => void toggleClass(cls, e.target.checked)}
                            className="accent-[#01696f]"
                          />
                          <span className="text-sm text-gray-700">
                            {cls.label}
                            <span className="text-gray-400 ml-1.5 text-xs">({cls.subject})</span>
                          </span>
                        </label>
                      );
                    })}
                    {allClassesForTeacher.length === 0 && (
                      <p className="px-3 py-3 text-sm text-gray-400">No unassigned classes available.</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Only unassigned classes and classes already assigned to this teacher are shown.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditMember(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REMOVE CONFIRMATION ───────────────────────────────── */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Remove User</h3>
            <p className="text-sm text-gray-600 mb-5">
              Remove <strong>{removeTarget.full_name || removeTarget.email}</strong> from this school?
              Their account will not be deleted — they will simply lose access.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f] bg-white';
