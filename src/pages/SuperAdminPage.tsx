import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, TrendingDown, ClipboardList } from 'lucide-react';
import { seedSurveyQuestions } from '../../seed/survey_questions';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel } from '../lib/judgement';
import type { School } from '../types';

// ─── Types ────────────────────────────────────────────────────

type Tab = 'schools' | 'users' | 'analytics' | 'followup' | 'platform';

interface SchoolRow {
  id: string;
  name_en: string;
  name_ar: string | null;
  oaaaqa_code: string | null;
  school_type: string;
  governorate: string | null;
  education_cycle: string | null;
  is_active: boolean;
  subscription_tier: string;
}

interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_super_admin: boolean;
  is_sed_team: boolean;
  role: string;
  status: string;
  school_id: string;
  school_name: string;
  created_at: string;
}

interface AnalyticsData {
  total_schools: number;
  total_users: number;
  active_academic_years: number;
  schools_needing_attention: number;
  school_breakdown: Array<{
    school_id: string;
    name_en: string;
    overall_judgement: number | null;
    domain_completion_pct: number;
    last_activity: string | null;
  }>;
}

interface IndicatorRow {
  id: string;
  standard_id: string;
  domain_id: string;
  description_en: string;
  description_ar: string | null;
  descriptor_outstanding_en: string | null;
  descriptor_good_en: string | null;
  descriptor_satisfactory_en: string | null;
  descriptor_unsatisfactory_en: string | null;
  descriptor_nui_en: string | null;
  descriptor_outstanding_ar: string | null;
  descriptor_good_ar: string | null;
  descriptor_satisfactory_ar: string | null;
  descriptor_unsatisfactory_ar: string | null;
  descriptor_nui_ar: string | null;
}

// ─── Shared helper ────────────────────────────────────────────

async function invokeAdmin(action: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  // Let supabase.functions.invoke inject Authorization automatically from the
  // active session — avoids "Bearer undefined" when session hasn't resolved yet.
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: { action, ...params },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      // FunctionsHttpError.message is always the generic "Edge Function returned
      // a non-2xx status code". The real reason is in the response body JSON.
      let detail = error.message;
      try {
        const body = await error.context.json() as { error?: string };
        if (body?.error) detail = body.error;
      } catch {
        // response body wasn't JSON — keep the generic message
      }
      throw new Error(detail);
    }
    throw new Error(error.message);
  }
  const d = data as Record<string, unknown>;
  if (d?.error) throw new Error(d.error as string);
  return d;
}

// ─── Shared tab button (defined outside page to keep stable reference) ──────

function TabBtn({
  id,
  activeTab,
  onSelect,
  label,
}: {
  id: Tab;
  activeTab: Tab;
  onSelect: (t: Tab) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        activeTab === id ? 'bg-[#01696f] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [tab, setTab] = useState<Tab>('schools');

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Super Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">Platform-wide management for Madrasa Comply</p>
      </div>

      <div className="px-8 pt-6">
        <div className="flex gap-2 bg-white border border-gray-200 rounded-xl p-1.5 w-fit shadow-sm">
          <TabBtn id="schools"   activeTab={tab} onSelect={setTab} label="Schools"         />
          <TabBtn id="users"     activeTab={tab} onSelect={setTab} label="Users"           />
          <TabBtn id="analytics" activeTab={tab} onSelect={setTab} label="Analytics"       />
          <TabBtn id="followup"  activeTab={tab} onSelect={setTab} label="Follow-Up Watch" />
          <TabBtn id="platform"  activeTab={tab} onSelect={setTab} label="Platform"        />
        </div>
      </div>

      <div className="px-8 py-6">
        {tab === 'schools'   && <SchoolsTab />}
        {tab === 'users'     && <UsersTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'followup'  && <FollowUpWatchTab />}
        {tab === 'platform'  && <PlatformTab />}
      </div>
    </div>
  );
}

// ─── Schools Tab ──────────────────────────────────────────────

type SchoolPanelMode = null | 'create' | 'edit';

const EMPTY_SCHOOL_FORM = {
  name_en: '', name_ar: '', oaaaqa_code: '', school_type: 'government',
  governorate: '', education_cycle: '',
};

function SchoolsTab() {
  const navigate   = useNavigate();
  const { setImpersonating } = useSchoolStore();

  const [schools, setSchools]     = useState<SchoolRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<SchoolPanelMode>(null);
  const [editing, setEditing]     = useState<SchoolRow | null>(null);
  const [form, setForm]           = useState(EMPTY_SCHOOL_FORM);
  const [saving, setSaving]       = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('schools')
      .select('id, name_en, name_ar, oaaaqa_code, school_type, governorate, education_cycle, is_active, subscription_tier')
      .order('name_en');
    if (error) setError(error.message);
    else setSchools((data ?? []) as SchoolRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setForm(EMPTY_SCHOOL_FORM);
    setEditing(null);
    setPanelError(null);
    setPanelMode('create');
  }

  function openEdit(s: SchoolRow) {
    setForm({
      name_en:         s.name_en         ?? '',
      name_ar:         s.name_ar         ?? '',
      oaaaqa_code:     s.oaaaqa_code     ?? '',
      school_type:     s.school_type     ?? 'government',
      governorate:     s.governorate     ?? '',
      education_cycle: s.education_cycle ?? '',
    });
    setEditing(s);
    setPanelError(null);
    setPanelMode('edit');
  }

  async function handleSave() {
    setSaving(true);
    setPanelError(null);
    try {
      const payload = {
        name_en:         form.name_en         || null,
        name_ar:         form.name_ar         || null,
        oaaaqa_code:     form.oaaaqa_code     || null,
        school_type:     form.school_type,
        governorate:     form.governorate     || null,
        education_cycle: form.education_cycle || null,
      };
      if (panelMode === 'create') {
        await invokeAdmin('create_school', payload);
      } else if (editing) {
        await invokeAdmin('update_school', { school_id: editing.id, ...payload });
      }
      setPanelMode(null);
      await load();
    } catch (e: unknown) {
      setPanelError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleViewAsAdmin(s: SchoolRow) {
    setImpersonating(s as unknown as School);
    navigate('/dashboard');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-800">All Schools ({schools.length})</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
        >
          + New School
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <SkeletonTable cols={6} /> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'OAAAQA Code', 'Type', 'Governorate', 'Cycle', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schools.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {s.name_en}
                    {s.name_ar && <div className="text-xs text-gray-400 font-normal" dir="rtl">{s.name_ar}</div>}
                  </td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{s.oaaaqa_code || '—'}</td>
                  <td className="px-5 py-3 text-gray-600 capitalize">{s.school_type || '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{s.governorate || '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{s.education_cycle || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {s.is_active ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(s)} className="text-xs text-[#01696f] hover:underline mr-3 font-medium">Edit</button>
                    <button onClick={() => handleViewAsAdmin(s)} className="text-xs text-amber-600 hover:underline font-medium">View as Admin</button>
                  </td>
                </tr>
              ))}
              {!schools.length && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">No schools yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {panelMode && (
        <SidePanel
          title={panelMode === 'create' ? 'New School' : `Edit — ${editing?.name_en}`}
          onClose={() => setPanelMode(null)}
        >
          {panelError && <ErrorBanner message={panelError} />}
          <div className="space-y-4">
            <Field label="School Name (English) *">
              <PanelInput value={form.name_en} onChange={v => setForm(f => ({ ...f, name_en: v }))} placeholder="Al Noor International School" />
            </Field>
            <Field label="School Name (Arabic)">
              <PanelInput value={form.name_ar} onChange={v => setForm(f => ({ ...f, name_ar: v }))} dir="rtl" />
            </Field>
            <Field label="OAAAQA Code">
              <PanelInput value={form.oaaaqa_code} onChange={v => setForm(f => ({ ...f, oaaaqa_code: v }))} placeholder="e.g. 12345" />
            </Field>
            <Field label="School Type">
              <select value={form.school_type} onChange={e => setForm(f => ({ ...f, school_type: e.target.value }))} className={inputCls}>
                <option value="government">Government</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </Field>
            <Field label="Governorate">
              <PanelInput value={form.governorate} onChange={v => setForm(f => ({ ...f, governorate: v }))} placeholder="e.g. Muscat" />
            </Field>
            <Field label="Education Cycle">
              <PanelInput value={form.education_cycle} onChange={v => setForm(f => ({ ...f, education_cycle: v }))} placeholder="e.g. Basic, Post-Basic" />
            </Field>
          </div>

          {panelMode === 'edit' && editing && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => { setPanelMode(null); handleViewAsAdmin(editing); }}
                className="w-full py-2 border border-amber-300 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-50 transition-colors"
              >
                View as Admin →
              </button>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button onClick={handleSave} disabled={saving || !form.name_en} className={primaryBtn}>
              {saving ? 'Saving…' : panelMode === 'create' ? 'Create School' : 'Save Changes'}
            </button>
            <button onClick={() => setPanelMode(null)} className={secondaryBtn}>Cancel</button>
          </div>
        </SidePanel>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────

const ROLE_OPTIONS = [
  'school_admin', 'principal', 'vice_principal', 'senior_management',
  'head_of_department', 'quality_coordinator', 'teacher', 'auditor',
];

function UsersTab() {
  const [users, setUsers]           = useState<UserRow[]>([]);
  const [allSchools, setAllSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [editing, setEditing]       = useState<UserRow | null>(null);
  const [form, setForm]             = useState({ role: '', school_id: '', is_super_admin: false });
  const [saving, setSaving]         = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [resetLink, setResetLink]   = useState<string | null>(null);
  const [resetting, setResetting]   = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [sedTeamLoading, setSedTeamLoading] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [profilesRes, membershipsRes, schoolsRes] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, email, is_super_admin, is_sed_team, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('school_members')
        .select('user_id, role, status, school_id'),
      supabase.from('schools')
        .select('id, name_en, name_ar, oaaaqa_code, school_type, governorate, education_cycle, is_active, subscription_tier')
        .order('name_en'),
    ]);

    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return; }
    setAllSchools((schoolsRes.data ?? []) as SchoolRow[]);

    const schoolMap = Object.fromEntries((schoolsRes.data ?? []).map(s => [s.id, s.name_en as string]));
    const memberMap: Record<string, Array<{ role: string; status: string; school_id: string }>> = {};
    for (const m of membershipsRes.data ?? []) {
      if (!memberMap[m.user_id]) memberMap[m.user_id] = [];
      memberMap[m.user_id].push(m);
    }

    const rows: UserRow[] = (profilesRes.data ?? []).flatMap(p => {
      const memberships = memberMap[p.id] ?? [];
      if (!memberships.length) {
        return [{
          user_id:        p.id,
          full_name:      p.full_name ?? null,
          email:          p.email     ?? null,
          is_super_admin: Boolean(p.is_super_admin),
          is_sed_team:    Boolean((p as { is_sed_team?: boolean }).is_sed_team),
          role:           p.is_super_admin ? 'super_admin' : '—',
          status:         'active',
          school_id:      '',
          school_name:    '—',
          created_at:     p.created_at as string,
        }];
      }
      return memberships.map(m => ({
        user_id:        p.id,
        full_name:      p.full_name ?? null,
        email:          p.email     ?? null,
        is_super_admin: Boolean(p.is_super_admin),
        is_sed_team:    Boolean((p as { is_sed_team?: boolean }).is_sed_team),
        role:           m.role,
        status:         m.status,
        school_id:      m.school_id,
        school_name:    schoolMap[m.school_id] ?? '—',
        created_at:     p.created_at as string,
      }));
    });

    setUsers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openEdit(u: UserRow) {
    setEditing(u);
    setForm({ role: u.role, school_id: u.school_id, is_super_admin: u.is_super_admin });
    setPanelError(null);
    setResetLink(null);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setPanelError(null);
    try {
      await invokeAdmin('update_user', {
        user_id:       editing.user_id,
        role:          form.role          || undefined,
        school_id:     form.school_id     || undefined,
        is_super_admin: form.is_super_admin,
      });
      setEditing(null);
      await load();
    } catch (e: unknown) {
      setPanelError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!editing?.email) return;
    setResetting(true);
    setPanelError(null);
    try {
      const res = await invokeAdmin('reset_password', { email: editing.email });
      setResetLink(res.link as string ?? null);
    } catch (e: unknown) {
      setPanelError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }

  async function handleSedToggle(u: UserRow) {
    setSedTeamLoading(prev => new Set(prev).add(u.user_id));
    const { error } = await supabase
      .from('profiles')
      .update({ is_sed_team: !u.is_sed_team })
      .eq('id', u.user_id);
    if (!error) {
      setUsers(prev => prev.map(r => r.user_id === u.user_id ? { ...r, is_sed_team: !r.is_sed_team } : r));
    }
    setSedTeamLoading(prev => { const s = new Set(prev); s.delete(u.user_id); return s; });
  }

  async function handleDeactivate(u: UserRow) {
    if (!window.confirm(`Suspend ${u.full_name ?? u.email} from ${u.school_name}?`)) return;
    setDeactivating(u.user_id + u.school_id);
    try {
      await invokeAdmin('deactivate_user', { user_id: u.user_id, school_id: u.school_id || undefined });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeactivating(null);
    }
  }

  const filtered = filterText
    ? users.filter(u =>
        (u.full_name ?? '').toLowerCase().includes(filterText.toLowerCase()) ||
        (u.email     ?? '').toLowerCase().includes(filterText.toLowerCase()) ||
        u.school_name.toLowerCase().includes(filterText.toLowerCase())
      )
    : users;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-800">All Users ({users.length})</h2>
        <input
          type="text"
          placeholder="Search name, email, school…"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        />
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <SkeletonTable cols={7} /> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name / Email', 'Role', 'School', 'Status', 'SED Team', 'Joined', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u, i) => (
                <tr key={`${u.user_id}-${u.school_id}-${i}`} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-1.5">
                      {u.full_name || '—'}
                      {u.is_super_admin && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-semibold">SA</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{u.role.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{u.school_name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.status === 'active'    ? 'bg-green-100 text-green-700' :
                      u.status === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
                      u.status === 'suspended' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>{u.status}</span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleSedToggle(u)}
                      disabled={sedTeamLoading.has(u.user_id)}
                      title="SED Team members appear on the cover page of the School Evaluation Document"
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                        u.is_sed_team ? 'bg-[#01696f]' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                        u.is_sed_team ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(u)} className="text-xs text-[#01696f] hover:underline mr-2 font-medium">Edit</button>
                    <button
                      onClick={() => handleDeactivate(u)}
                      disabled={deactivating === u.user_id + u.school_id || u.status === 'suspended'}
                      className="text-xs text-red-500 hover:underline disabled:opacity-40"
                    >
                      {deactivating === u.user_id + u.school_id ? 'Suspending…' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit user panel */}
      {editing && (
        <SidePanel
          title={`Edit — ${editing.full_name ?? editing.email}`}
          onClose={() => setEditing(null)}
        >
          {panelError && <ErrorBanner message={panelError} />}
          <div className="space-y-4">
            <Field label="Role">
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
                {ROLE_OPTIONS.map(r => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="School Assignment">
              <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))} className={inputCls}>
                <option value="">— No school —</option>
                {allSchools.map(s => (
                  <option key={s.id} value={s.id}>{s.name_en}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Super Admin</p>
                <p className="text-xs text-gray-400">Full platform access</p>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, is_super_admin: !f.is_super_admin }))}
                className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${
                  form.is_super_admin ? 'bg-[#01696f]' : 'bg-gray-200'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.is_super_admin ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={handleSave} disabled={saving} className={primaryBtn}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => setEditing(null)} className={secondaryBtn}>Cancel</button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <button
              onClick={handleResetPassword}
              disabled={resetting || !editing.email}
              className="w-full py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {resetting ? 'Generating link…' : 'Reset Password'}
            </button>
          </div>

          {resetLink && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-800 mb-1.5">Recovery link (valid for 1 hour):</p>
              <p className="text-xs text-blue-700 break-all font-mono bg-white rounded px-2 py-1.5 border border-blue-100">
                {resetLink}
              </p>
              <button
                onClick={() => { void navigator.clipboard.writeText(resetLink); }}
                className="mt-2 text-xs text-blue-700 hover:underline font-medium"
              >
                Copy to clipboard
              </button>
            </div>
          )}
        </SidePanel>
      )}
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────

function AnalyticsTab() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await invokeAdmin('get_analytics');
        setAnalytics(data as unknown as AnalyticsData);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SkeletonGrid />;
  if (error)   return <ErrorBanner message={error} />;
  if (!analytics) return null;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard label="Total Schools"            value={analytics.total_schools}             icon="🏫" />
        <KpiCard label="Total Users"              value={analytics.total_users}               icon="👥" />
        <KpiCard label="Active Academic Years"    value={analytics.active_academic_years}     icon="📅" />
        <KpiCard label="Schools Needing Attention" value={analytics.schools_needing_attention} icon="⚠️" danger />
      </div>

      {/* Indicator Regressions */}
      <RegressionCard />

      {/* School breakdown table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">School Breakdown</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['School', 'Overall Judgement', 'Domain Completion', 'Last Calculated'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {analytics.school_breakdown.map(s => (
              <tr key={s.school_id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{s.name_en}</td>
                <td className="px-5 py-3">
                  {s.overall_judgement != null ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                      style={{ backgroundColor: JUDGEMENT_COLORS[s.overall_judgement as JudgementLevel] }}
                    >
                      {s.overall_judgement} — {JUDGEMENT_LABELS[s.overall_judgement as JudgementLevel]}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Not calculated</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-24">
                      <div
                        className="h-full rounded-full bg-[#01696f]"
                        style={{ width: `${s.domain_completion_pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 font-medium">{s.domain_completion_pct}%</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-400 text-xs">
                  {s.last_activity
                    ? new Date(s.last_activity).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </td>
              </tr>
            ))}
            {!analytics.school_breakdown.length && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Regression Card (used inside AnalyticsTab) ───────────────

interface RegressionRow {
  school_id: string;
  school_name: string;
  indicator_id: string;
  indicator_en: string;
  prev_rating: JudgementLevel;
  curr_rating: JudgementLevel;
}

function RegressionCard() {
  const [regressions, setRegressions] = useState<RegressionRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Fetch academic_years to identify current + prev per school
        const [yearsRes, ratingsRes, indicatorsRes, schoolsRes] = await Promise.all([
          supabase.from('academic_years').select('school_id, label, is_current').order('school_id').order('label', { ascending: false }),
          supabase.from('indicator_ratings').select('school_id, indicator_id, academic_year, rating'),
          supabase.from('indicators').select('id, description_en'),
          supabase.from('schools').select('id, name_en'),
        ]);

        const years   = (yearsRes.data   ?? []) as Array<{ school_id: string; label: string; is_current: boolean }>;
        const ratings = (ratingsRes.data ?? []) as Array<{ school_id: string; indicator_id: string; academic_year: string; rating: number }>;
        const indMap  = Object.fromEntries((indicatorsRes.data ?? []).map((i: { id: string; description_en: string }) => [i.id, i.description_en]));
        const schoolMap = Object.fromEntries((schoolsRes.data ?? []).map((s: { id: string; name_en: string }) => [s.id, s.name_en]));

        // Build current + previous year per school
        const yearsBySchool: Record<string, string[]> = {};
        for (const y of years) {
          if (!yearsBySchool[y.school_id]) yearsBySchool[y.school_id] = [];
          yearsBySchool[y.school_id].push(y.label);
        }

        // Build rating lookup: school_id+indicator_id+academic_year → rating
        const ratingMap: Record<string, number> = {};
        for (const r of ratings) {
          ratingMap[`${r.school_id}|${r.indicator_id}|${r.academic_year}`] = r.rating;
        }

        const found: RegressionRow[] = [];
        for (const [schoolId, sortedYears] of Object.entries(yearsBySchool)) {
          if (sortedYears.length < 2) continue;
          const currYear = sortedYears[0];
          const prevYear = sortedYears[1];

          // Get all indicators rated for this school this year
          const currRatings = ratings.filter(r => r.school_id === schoolId && r.academic_year === currYear);
          for (const curr of currRatings) {
            const prevKey = `${schoolId}|${curr.indicator_id}|${prevYear}`;
            const prevRating = ratingMap[prevKey];
            if (prevRating != null && curr.rating > prevRating) {
              found.push({
                school_id:    schoolId,
                school_name:  schoolMap[schoolId] ?? schoolId,
                indicator_id: curr.indicator_id,
                indicator_en: indMap[curr.indicator_id] ?? curr.indicator_id,
                prev_rating:  prevRating as JudgementLevel,
                curr_rating:  curr.rating as JudgementLevel,
              });
            }
          }
        }
        setRegressions(found);
      } catch (e) {
        console.error('[RegressionCard]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <div
        className={`bg-white border rounded-xl p-5 cursor-pointer hover:shadow-sm transition-shadow ${regressions.length > 0 ? 'border-red-200' : 'border-gray-200'}`}
        onClick={() => !loading && setModalOpen(true)}
      >
        <div className="flex items-center gap-3">
          <TrendingDown className={`h-6 w-6 shrink-0 ${regressions.length > 0 ? 'text-red-500' : 'text-gray-300'}`} />
          <div>
            <p className="text-xs text-gray-500">Indicator Regressions This Year</p>
            {loading
              ? <div className="h-8 w-12 bg-gray-100 rounded animate-pulse mt-1" />
              : <p className={`text-3xl font-bold mt-0.5 ${regressions.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {regressions.length}
                </p>
            }
          </div>
          {!loading && regressions.length > 0 && (
            <span className="ml-auto text-xs text-red-500 underline">View details</span>
          )}
        </div>
      </div>

      {/* Regression modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col z-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                Indicator Regressions This Year
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {regressions.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400">No regressions found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['School', 'Indicator', 'Previous', '→', 'Current'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {regressions.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs font-medium text-gray-900">{r.school_name}</td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-gray-800">{r.indicator_id}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[180px]">{r.indicator_en}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: JUDGEMENT_COLORS[r.prev_rating] }}>
                            {JUDGEMENT_LABELS[r.prev_rating]}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-gray-300">→</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: JUDGEMENT_COLORS[r.curr_rating] }}>
                            {JUDGEMENT_LABELS[r.curr_rating]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Follow-Up Watch Tab ──────────────────────────────────────

interface FollowUpRow {
  id: string;
  school_id: string;
  school_name: string;
  overall_judgement: JudgementLevel;
  visit_date: string;
  followup_deadline: string;
}

function FollowUpWatchTab() {
  const navigate = useNavigate();
  const { setImpersonating } = useSchoolStore();
  const [rows, setRows]       = useState<FollowUpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabase
          .from('review_visits')
          .select('id, school_id, overall_judgement, visit_date, followup_deadline, schools(name_en)')
          .not('followup_deadline', 'is', null)
          .order('followup_deadline', { ascending: true });
        if (qErr) throw qErr;
        setRows(
          ((data ?? []) as Array<{
            id: string; school_id: string; overall_judgement: number;
            visit_date: string; followup_deadline: string;
            schools: { name_en: string } | Array<{ name_en: string }> | null;
          }>).map((r) => ({
            id:                r.id,
            school_id:         r.school_id,
            school_name:       (Array.isArray(r.schools) ? r.schools[0] : r.schools)?.name_en ?? r.school_id,
            overall_judgement: r.overall_judgement as JudgementLevel,
            visit_date:        r.visit_date,
            followup_deadline: r.followup_deadline,
          }))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleViewSchool(row: FollowUpRow) {
    // Impersonate the school then navigate to its review visits page
    setImpersonating({ id: row.school_id, name_en: row.school_name } as unknown as School);
    navigate('/review-visits');
  }

  function daysRemaining(deadline: string): number {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(deadline); d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (loading) return <SkeletonTable cols={6} />;
  if (error)   return <ErrorBanner message={error} />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-800">Follow-Up Watch</h3>
        <span className="ml-auto text-xs text-gray-400">{rows.length} school{rows.length !== 1 ? 's' : ''} with pending follow-up visit</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          No pending follow-up visits.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['School', 'Original Judgement', 'Review Date', 'Follow-Up Deadline', 'Days Remaining', 'Action'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const days = daysRemaining(row.followup_deadline);
              const overdue = days < 0;
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{row.school_name}</td>
                  <td className="px-5 py-3">
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                      style={{ backgroundColor: JUDGEMENT_COLORS[row.overall_judgement] }}
                    >
                      {JUDGEMENT_LABELS[row.overall_judgement]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{fmtDate(row.visit_date)}</td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{fmtDate(row.followup_deadline)}</td>
                  <td className="px-5 py-3">
                    {overdue ? (
                      <span className="text-xs font-bold text-red-600">OVERDUE</span>
                    ) : (
                      <span className={`text-xs font-semibold ${days < 30 ? 'text-red-500' : days < 90 ? 'text-amber-600' : 'text-green-600'}`}>
                        {days}d
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleViewSchool(row)}
                      className="text-xs text-[#01696f] hover:underline font-medium"
                    >
                      View School
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Platform Tab ─────────────────────────────────────────────

function PlatformTab() {
  const [indicators, setIndicators] = useState<IndicatorRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [reseeding, setReseeding]   = useState(false);
  const [reseedMsg, setReseedMsg]   = useState<string | null>(null);
  const [expandedDescId, setExpandedDescId] = useState<string | null>(null);
  const [descDraft, setDescDraft]   = useState<Record<string, string>>({});
  const [savingDescId, setSavingDescId] = useState<string | null>(null);
  const [seedingSurveys, setSeedingSurveys] = useState(false);
  const [surveyMsg, setSurveyMsg]   = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('indicators')
        .select('id, standard_id, domain_id, description_en, description_ar, descriptor_outstanding_en, descriptor_good_en, descriptor_satisfactory_en, descriptor_unsatisfactory_en, descriptor_nui_en, descriptor_outstanding_ar, descriptor_good_ar, descriptor_satisfactory_ar, descriptor_unsatisfactory_ar, descriptor_nui_ar')
        .order('domain_id')
        .order('id');
      if (error) setError(error.message);
      else setIndicators((data ?? []) as IndicatorRow[]);
      setLoading(false);
    })();
  }, []);

  function openDescEditor(ind: IndicatorRow) {
    if (expandedDescId === ind.id) { setExpandedDescId(null); return; }
    setExpandedDescId(ind.id);
    setDescDraft({
      outstanding_en:    ind.descriptor_outstanding_en    ?? '',
      good_en:           ind.descriptor_good_en           ?? '',
      satisfactory_en:   ind.descriptor_satisfactory_en   ?? '',
      unsatisfactory_en: ind.descriptor_unsatisfactory_en ?? '',
      nui_en:            ind.descriptor_nui_en            ?? '',
      outstanding_ar:    ind.descriptor_outstanding_ar    ?? '',
      good_ar:           ind.descriptor_good_ar           ?? '',
      satisfactory_ar:   ind.descriptor_satisfactory_ar   ?? '',
      unsatisfactory_ar: ind.descriptor_unsatisfactory_ar ?? '',
      nui_ar:            ind.descriptor_nui_ar            ?? '',
    });
  }

  async function saveDescriptors(ind: IndicatorRow) {
    setSavingDescId(ind.id);
    const patch = {
      descriptor_outstanding_en:    descDraft['outstanding_en']    || null,
      descriptor_good_en:           descDraft['good_en']           || null,
      descriptor_satisfactory_en:   descDraft['satisfactory_en']   || null,
      descriptor_unsatisfactory_en: descDraft['unsatisfactory_en'] || null,
      descriptor_nui_en:            descDraft['nui_en']            || null,
      descriptor_outstanding_ar:    descDraft['outstanding_ar']    || null,
      descriptor_good_ar:           descDraft['good_ar']           || null,
      descriptor_satisfactory_ar:   descDraft['satisfactory_ar']   || null,
      descriptor_unsatisfactory_ar: descDraft['unsatisfactory_ar'] || null,
      descriptor_nui_ar:            descDraft['nui_ar']            || null,
    };
    const { error: saveErr } = await supabase.from('indicators').update(patch).eq('id', ind.id);
    if (saveErr) {
      setError(saveErr.message);
    } else {
      setIndicators(prev => prev.map(i => i.id === ind.id ? { ...i, ...patch } : i));
      setExpandedDescId(null);
    }
    setSavingDescId(null);
  }

  async function handleReseed() {
    setReseeding(true);
    setReseedMsg(null);
    try {
      const res = await invokeAdmin('reseed_indicators');
      setReseedMsg(res.message as string);
    } catch (e: unknown) {
      setReseedMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setReseeding(false);
    }
  }

  async function handleSeedSurveys() {
    if (!window.confirm('This will add default OAAAQA survey questions to all active survey templates. Continue?')) return;
    setSeedingSurveys(true);
    setSurveyMsg(null);
    try {
      const result = await seedSurveyQuestions(supabase);
      if (result.errors.length > 0) {
        setSurveyMsg({ text: `Seeded with errors: ${result.errors.join('; ')}`, ok: false });
      } else {
        setSurveyMsg({ text: `Default survey questions seeded (${result.created} created)`, ok: true });
      }
    } catch (e: unknown) {
      setSurveyMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSeedingSurveys(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Reseed section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Indicators</h3>
        <p className="text-sm text-gray-500 mb-4">
          Framework indicators are seeded via database migrations. Use this to verify the current state.
        </p>
        <button
          onClick={handleReseed}
          disabled={reseeding}
          className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
        >
          {reseeding ? 'Checking…' : 'Reseed Indicators'}
        </button>
        {reseedMsg && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
            {reseedMsg}
          </div>
        )}
      </div>

      {/* Seed Survey Questions */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Survey Questions</h3>
        <p className="text-sm text-gray-500 mb-4">
          Seed the default OAAAQA survey questions for staff, parent, and student templates.
          This operation is idempotent — it replaces platform-wide (school_id IS NULL) templates.
        </p>
        <button
          onClick={() => void handleSeedSurveys()}
          disabled={seedingSurveys}
          className="flex items-center gap-2 px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
        >
          <ClipboardList className="h-4 w-4" />
          {seedingSurveys ? 'Seeding…' : 'Seed Default Survey Questions'}
        </button>
        {surveyMsg && (
          <div className={`mt-3 p-3 rounded-lg text-sm border ${surveyMsg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {surveyMsg.text}
          </div>
        )}
      </div>

      {/* Indicators table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">All Indicators ({indicators.length})</h3>
        </div>
        {error && <ErrorBanner message={error} />}
        {loading ? <SkeletonTable cols={5} /> : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Code', 'Domain', 'Standard', 'Description (EN)', 'Description (AR)', 'Descriptors'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {indicators.map(ind => (
                  <>
                    <tr key={ind.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-gray-600">{ind.id}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{ind.domain_id}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{ind.standard_id}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-700 max-w-xs">
                        <p className="line-clamp-2">{ind.description_en}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs" dir="rtl">
                        <p className="line-clamp-2">{ind.description_ar ?? '—'}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => openDescEditor(ind)}
                          className="text-xs text-[#01696f] hover:underline font-medium flex items-center gap-1"
                        >
                          {expandedDescId === ind.id ? '▲ Close' : '▼ Edit'}
                        </button>
                      </td>
                    </tr>
                    {expandedDescId === ind.id && (
                      <tr key={`${ind.id}-desc`} className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-4">
                          <p className="text-xs font-semibold text-gray-700 mb-3">Grade Descriptors — {ind.id}</p>
                          <div className="grid grid-cols-2 gap-3">
                            {([
                              { key: 'outstanding',    label: 'Outstanding' },
                              { key: 'good',           label: 'Good' },
                              { key: 'satisfactory',   label: 'Satisfactory' },
                              { key: 'unsatisfactory', label: 'Unsatisfactory' },
                              { key: 'nui',            label: 'Needs Urgent Intervention' },
                            ] as const).map(({ key, label }) => (
                              <div key={key} className="contents">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">{label} (EN)</label>
                                  <textarea
                                    value={descDraft[`${key}_en`] ?? ''}
                                    onChange={e => setDescDraft(d => ({ ...d, [`${key}_en`]: e.target.value }))}
                                    rows={2}
                                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-[#01696f]"
                                    placeholder={`What ${label} looks like for this indicator…`}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">{label} (AR)</label>
                                  <textarea
                                    value={descDraft[`${key}_ar`] ?? ''}
                                    onChange={e => setDescDraft(d => ({ ...d, [`${key}_ar`]: e.target.value }))}
                                    rows={2}
                                    dir="rtl"
                                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-[#01696f]"
                                    placeholder="…"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => saveDescriptors(ind)}
                              disabled={savingDescId === ind.id}
                              className="px-4 py-1.5 bg-[#01696f] text-white text-xs font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
                            >
                              {savingDescId === ind.id ? 'Saving…' : 'Save Descriptors'}
                            </button>
                            <button
                              onClick={() => setExpandedDescId(null)}
                              className="px-4 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────

function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 shrink-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-3">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </>
  );
}

function KpiCard({ label, value, icon, danger = false }: { label: string; value: number; icon: string; danger?: boolean }) {
  return (
    <div className={`bg-white border rounded-xl p-5 ${danger && value > 0 ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={`text-3xl font-bold ${danger && value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function PanelInput({ value, onChange, placeholder, dir }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dir?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      dir={dir}
      className={inputCls}
    />
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{message}</div>
  );
}

function SkeletonTable({ cols }: { cols: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-4 border-b border-gray-100">
          {[...Array(cols)].map((__, j) => (
            <div key={j} className="h-4 bg-gray-100 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
          <div className="h-8 bg-gray-200 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f] bg-white';
const primaryBtn =
  'flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors';
const secondaryBtn =
  'flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors';
