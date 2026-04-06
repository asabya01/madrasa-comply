import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { useAcademicYears } from '../hooks/useAcademicYears';

type SettingsTab = 'profile' | 'academic-years' | 'audit' | 'notifications';

export default function SettingsPage() {
  const { school, setSchool } = useSchoolStore();
  const perms = usePermissions();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        name_en: school.name_en || '',
        name_ar: school.name_ar || '',
        school_type: school.school_type || 'public',
        governorate: school.governorate || '',
        wilayat: school.wilayat || '',
        principal_name: school.principal_name || '',
        total_students_male: school.total_students_male || 0,
        total_students_female: school.total_students_female || 0,
        total_teachers: school.total_teachers || 0,
        vision_statement: school.vision_statement || '',
        mission_statement: school.mission_statement || '',
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
        <div className="flex gap-1.5 bg-white border border-gray-200 rounded-xl p-1.5 w-fit shadow-sm">
          <TabBtn id="profile" label="School Profile" />
          <TabBtn id="academic-years" label="Academic Years" />
          <TabBtn id="audit" label="Audit Dates" />
          <TabBtn id="notifications" label="Notifications" />
        </div>
      </div>

      <div className="px-8 py-6 max-w-3xl">

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
                  onChange={e => setForm(f => ({ ...f, school_type: e.target.value as any }))}
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
      </div>
    </div>
  );
}

// ─── Academic Years Panel ─────────────────────────────────────

function AcademicYearsPanel() {
  const { years, currentYear, loading, error, createYear, setCurrentYear, deleteYear } = useAcademicYears();
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      await createYear(newLabel.trim(), newStart || undefined, newEnd || undefined);
      setShowCreate(false);
      setNewLabel('');
      setNewStart('');
      setNewEnd('');
    } catch (e: any) {
      setActionError(e.message);
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
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54]"
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
          <button onClick={() => setShowCreate(true)} className="mt-2 text-[#01696f] text-sm hover:underline">
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
                {year.is_current && (
                  <span className="w-2 h-2 bg-[#01696f] rounded-full" />
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-800">{year.label}</p>
                  {year.start_date && year.end_date && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(year.start_date).toLocaleDateString()} –{' '}
                      {new Date(year.end_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {year.is_current && (
                  <span className="text-xs px-2 py-0.5 bg-[#01696f] text-white rounded-full font-medium">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
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

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">New Academic Year</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-4">
              <Field label="Year Label *">
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. 2025-2026"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date">
                  <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} className={inputCls} />
                </Field>
                <Field label="End Date">
                  <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} className={inputCls} />
                </Field>
              </div>
              {actionError && (
                <p className="text-red-600 text-sm">{actionError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newLabel.trim()}
                  className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Year'}
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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!school?.id) return;
    (async () => {
      const { data } = await supabase.from('audit_settings').select('*').eq('school_id', school.id).maybeSingle();
      if (data) {
        setForm({
          expected_audit_date: data.expected_audit_date || '',
          last_audit_date: data.last_audit_date || '',
          last_audit_judgement: data.last_audit_judgement || '',
          notes: data.notes || '',
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
      school_id: school.id,
      expected_audit_date: form.expected_audit_date || null,
      last_audit_date: form.last_audit_date || null,
      last_audit_judgement: form.last_audit_judgement || null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
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
