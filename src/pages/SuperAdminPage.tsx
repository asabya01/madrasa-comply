import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, TrendingDown, ClipboardList, Eye, EyeOff, Check, MoreHorizontal } from 'lucide-react';
import { seedSurveyQuestions } from '../../seed/survey_questions';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel } from '../lib/judgement';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
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
  subscription_expires_at: string | null;
}

interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_super_admin: boolean;
  is_sed_team: boolean;
  is_active: boolean;
  role: string;
  status: string;
  school_id: string;
  school_name: string;
  created_at: string;
}

interface AnalyticsSchoolDetail {
  id: string;
  name_en: string;
  governorate: string | null;
  subscription_tier: string;
  subscription_expires_at: string | null;
  user_count: number;
  last_activity: string | null;
}

interface AnalyticsData {
  total_schools: number;
  total_users: number;
  total_seds: number;
  ai_requests_30d: number;
  schools_by_tier: Array<{ tier: string; count: number }>;
  seds_by_month: Array<{ month: string; count: number }>;
  schools_detail: AnalyticsSchoolDetail[];
}

// ─── Tier helpers ─────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  trial:        'Trial (30 days)',
  starter:      'Starter — 350 OMR/yr',
  essential:    'Starter — 350 OMR/yr',
  professional: 'Professional — 650 OMR/yr',
  premium:      'Premium — 950 OMR/yr',
  chain:        'Chain — 1,200 OMR/school/yr',
  enterprise:   'Enterprise — Custom',
};

const TIER_COLOURS: Record<string, string> = {
  trial:        'bg-gray-100 text-gray-600 border-gray-300',
  starter:      'bg-blue-100 text-blue-700 border-blue-200',
  essential:    'bg-blue-100 text-blue-700 border-blue-200',
  professional: 'bg-purple-100 text-purple-700 border-purple-200',
  premium:      'bg-indigo-100 text-indigo-700 border-indigo-200',
  chain:        'bg-amber-100 text-amber-700 border-amber-200',
  enterprise:   'bg-rose-100 text-rose-700 border-rose-200',
};

const TIER_PIE_COLOURS: Record<string, string> = {
  trial:        '#9ca3af',
  starter:      '#3b82f6',
  essential:    '#3b82f6',
  professional: '#a855f7',
  premium:      '#6366f1',
  chain:        '#f59e0b',
  enterprise:   '#f43f5e',
};

const OMAN_GOVERNORATES = [
  'Muscat', 'Dhofar', 'Musandam', 'Al Buraymi', 'Al Wusta',
  'North Al Batinah', 'South Al Batinah', 'North Al Sharqiyah',
  'South Al Sharqiyah', 'Ad Dhahirah', 'Al Dakhiliyah',
];

function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().slice(0, 10);
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

const EMPTY_EDIT_FORM = {
  name_en: '', name_ar: '', oaaaqa_code: '', school_type: 'government',
  governorate: '', education_cycle: '',
};

// 3-step wizard state
const EMPTY_WIZARD = {
  // step 1
  name_en: '', name_ar: '', school_type: 'government', oaaaqa_code: '', governorate: '',
  // step 2
  full_name: '', email: '', password: '',
  // step 3
  tier: 'trial', expiry_date: defaultExpiry(),
};

function SchoolsTab() {
  const navigate            = useNavigate();
  const { setImpersonating } = useSchoolStore();

  const [schools, setSchools]       = useState<SchoolRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Edit panel (existing schools)
  const [editingSchool, setEditingSchool]   = useState<SchoolRow | null>(null);
  const [editForm, setEditForm]             = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving]         = useState(false);
  const [editError, setEditError]           = useState<string | null>(null);

  // Tier popover
  const [tierEditId, setTierEditId]         = useState<string | null>(null);
  const [tierForm, setTierForm]             = useState({ tier: 'trial', expiry_date: '' });
  const [tierSaving, setTierSaving]         = useState(false);

  // Creation wizard
  const [wizardOpen, setWizardOpen]         = useState(false);
  const [wizardStep, setWizardStep]         = useState(1);
  const [wizard, setWizard]                 = useState(EMPTY_WIZARD);
  const [wizardSaving, setWizardSaving]     = useState(false);
  const [wizardError, setWizardError]       = useState<string | null>(null);
  const [showPw, setShowPw]                 = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from('schools')
      .select('id, name_en, name_ar, oaaaqa_code, school_type, governorate, education_cycle, is_active, subscription_tier, subscription_expires_at')
      .order('name_en');
    if (qErr) setError(qErr.message);
    else setSchools((data ?? []) as SchoolRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openEdit(s: SchoolRow) {
    setEditForm({
      name_en:         s.name_en         ?? '',
      name_ar:         s.name_ar         ?? '',
      oaaaqa_code:     s.oaaaqa_code     ?? '',
      school_type:     s.school_type     ?? 'government',
      governorate:     s.governorate     ?? '',
      education_cycle: s.education_cycle ?? '',
    });
    setEditingSchool(s);
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editingSchool) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await invokeAdmin('update_school', {
        school_id:       editingSchool.id,
        name_en:         editForm.name_en         || null,
        name_ar:         editForm.name_ar         || null,
        oaaaqa_code:     editForm.oaaaqa_code     || null,
        school_type:     editForm.school_type,
        governorate:     editForm.governorate     || null,
        education_cycle: editForm.education_cycle || null,
      });
      setEditingSchool(null);
      await load();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  }

  function openTierEdit(s: SchoolRow) {
    if (tierEditId === s.id) { setTierEditId(null); return; }
    setTierForm({
      tier:        s.subscription_tier        ?? 'trial',
      expiry_date: s.subscription_expires_at ? s.subscription_expires_at.slice(0, 10) : '',
    });
    setTierEditId(s.id);
  }

  async function handleTierSave(schoolId: string) {
    setTierSaving(true);
    try {
      await invokeAdmin('update_subscription', {
        school_id:   schoolId,
        tier:        tierForm.tier,
        expiry_date: tierForm.expiry_date || null,
      });
      setTierEditId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTierSaving(false);
    }
  }

  function openWizard() {
    setWizard(EMPTY_WIZARD);
    setWizardStep(1);
    setWizardError(null);
    setShowPw(false);
    setWizardOpen(true);
  }

  async function handleWizardFinish() {
    setWizardSaving(true);
    setWizardError(null);
    try {
      await invokeAdmin('create_school_full', {
        name_en:     wizard.name_en,
        name_ar:     wizard.name_ar     || null,
        school_type: wizard.school_type,
        oaaaqa_code: wizard.oaaaqa_code || null,
        governorate: wizard.governorate || null,
        full_name:   wizard.full_name,
        email:       wizard.email,
        password:    wizard.password,
        tier:        wizard.tier,
        expiry_date: wizard.expiry_date || null,
      });
      setWizardOpen(false);
      await load();
    } catch (e: unknown) {
      setWizardError(e instanceof Error ? e.message : String(e));
    } finally {
      setWizardSaving(false);
    }
  }

  function handleViewAsAdmin(s: SchoolRow) {
    setImpersonating(s as unknown as School);
    navigate('/dashboard');
  }

  const step1Valid = wizard.name_en.trim().length > 0;
  const step2Valid = wizard.full_name.trim().length > 0 && wizard.email.trim().length > 0 && wizard.password.length >= 8;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-800">All Schools ({schools.length})</h2>
        <button
          onClick={openWizard}
          className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
        >
          + New School
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <SkeletonTable cols={8} /> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'OAAAQA Code', 'Type', 'Governorate', 'Tier', 'Status', ''].map(h => (
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
                  <td className="px-5 py-3 relative">
                    <button
                      onClick={() => openTierEdit(s)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border cursor-pointer transition-opacity hover:opacity-80 ${TIER_COLOURS[s.subscription_tier] ?? TIER_COLOURS.trial}`}
                    >
                      {TIER_LABELS[s.subscription_tier] ?? s.subscription_tier}
                    </button>
                    {tierEditId === s.id && (
                      <div className="absolute z-30 top-9 left-0 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-64">
                        <p className="text-xs font-semibold text-gray-700 mb-3">Update Subscription</p>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Tier</label>
                            <select
                              value={tierForm.tier}
                              onChange={e => setTierForm(f => ({ ...f, tier: e.target.value }))}
                              className={inputCls}
                            >
                              {Object.entries(TIER_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Expiry Date</label>
                            <input
                              type="date"
                              value={tierForm.expiry_date}
                              onChange={e => setTierForm(f => ({ ...f, expiry_date: e.target.value }))}
                              className={inputCls}
                            />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => void handleTierSave(s.id)}
                              disabled={tierSaving}
                              className="flex-1 py-1.5 bg-[#01696f] text-white text-xs font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 flex items-center justify-center gap-1"
                            >
                              {tierSaving ? 'Saving…' : <><Check className="h-3 w-3" /> Save</>}
                            </button>
                            <button
                              onClick={() => setTierEditId(null)}
                              className="flex-1 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
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

      {/* Edit school side panel */}
      {editingSchool && (
        <SidePanel
          title={`Edit — ${editingSchool.name_en}`}
          onClose={() => setEditingSchool(null)}
        >
          {editError && <ErrorBanner message={editError} />}
          <div className="space-y-4">
            <Field label="School Name (English) *">
              <PanelInput value={editForm.name_en} onChange={v => setEditForm(f => ({ ...f, name_en: v }))} placeholder="Al Noor International School" />
            </Field>
            <Field label="School Name (Arabic)">
              <PanelInput value={editForm.name_ar} onChange={v => setEditForm(f => ({ ...f, name_ar: v }))} dir="rtl" />
            </Field>
            <Field label="OAAAQA Code">
              <PanelInput value={editForm.oaaaqa_code} onChange={v => setEditForm(f => ({ ...f, oaaaqa_code: v }))} placeholder="e.g. 12345" />
            </Field>
            <Field label="School Type">
              <select value={editForm.school_type} onChange={e => setEditForm(f => ({ ...f, school_type: e.target.value }))} className={inputCls}>
                <option value="government">Government</option>
                <option value="private">Private</option>
              </select>
            </Field>
            <Field label="Governorate">
              <select value={editForm.governorate} onChange={e => setEditForm(f => ({ ...f, governorate: e.target.value }))} className={inputCls}>
                <option value="">— Select —</option>
                {OMAN_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Education Cycle">
              <PanelInput value={editForm.education_cycle} onChange={v => setEditForm(f => ({ ...f, education_cycle: v }))} placeholder="e.g. Basic, Post-Basic" />
            </Field>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={() => { setEditingSchool(null); handleViewAsAdmin(editingSchool); }}
              className="w-full py-2 border border-amber-300 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-50 transition-colors"
            >
              View as Admin →
            </button>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => void handleEditSave()} disabled={editSaving || !editForm.name_en} className={primaryBtn}>
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => setEditingSchool(null)} className={secondaryBtn}>Cancel</button>
          </div>
        </SidePanel>
      )}

      {/* School creation wizard */}
      <Dialog open={wizardOpen} onOpenChange={open => { if (!wizardSaving) setWizardOpen(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New School — Step {wizardStep} of 3</DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex items-center gap-2">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  n < wizardStep ? 'bg-[#01696f] text-white' : n === wizardStep ? 'bg-[#01696f] text-white ring-4 ring-[#01696f]/20' : 'bg-gray-100 text-gray-400'
                }`}>
                  {n < wizardStep ? <Check className="h-3.5 w-3.5" /> : n}
                </div>
                <span className={`text-xs ${n === wizardStep ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {n === 1 ? 'School Details' : n === 2 ? 'Admin User' : 'Review & Subscribe'}
                </span>
                {n < 3 && <div className="h-px w-6 bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>

          {wizardError && <ErrorBanner message={wizardError} />}

          {/* Step 1 */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <Field label="School Name (English) *">
                <PanelInput value={wizard.name_en} onChange={v => setWizard(w => ({ ...w, name_en: v }))} placeholder="Al Noor International School" />
              </Field>
              <Field label="School Name (Arabic)">
                <PanelInput value={wizard.name_ar} onChange={v => setWizard(w => ({ ...w, name_ar: v }))} dir="rtl" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="School Type">
                  <select value={wizard.school_type} onChange={e => setWizard(w => ({ ...w, school_type: e.target.value }))} className={inputCls}>
                    <option value="government">Government</option>
                    <option value="private">Private</option>
                  </select>
                </Field>
                <Field label="OAAAQA Code">
                  <PanelInput value={wizard.oaaaqa_code} onChange={v => setWizard(w => ({ ...w, oaaaqa_code: v }))} placeholder="e.g. 12345" />
                </Field>
              </div>
              <Field label="Governorate">
                <select value={wizard.governorate} onChange={e => setWizard(w => ({ ...w, governorate: e.target.value }))} className={inputCls}>
                  <option value="">— Select Governorate —</option>
                  {OMAN_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
            </div>
          )}

          {/* Step 2 */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                This user will be created as <strong>school_admin</strong> and can log in immediately with the temporary password.
              </div>
              <Field label="Full Name *">
                <PanelInput value={wizard.full_name} onChange={v => setWizard(w => ({ ...w, full_name: v }))} placeholder="Ahmad Al-Rashidi" />
              </Field>
              <Field label="Email Address *">
                <input
                  type="email"
                  value={wizard.email}
                  onChange={e => setWizard(w => ({ ...w, email: e.target.value }))}
                  placeholder="admin@school.edu.om"
                  className={inputCls}
                />
              </Field>
              <Field label="Temporary Password * (min 8 chars)">
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={wizard.password}
                    onChange={e => setWizard(w => ({ ...w, password: e.target.value }))}
                    placeholder="••••••••"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {wizard.password.length > 0 && wizard.password.length < 8 && (
                  <p className="text-xs text-red-500 mt-1">Password must be at least 8 characters</p>
                )}
              </Field>
            </div>
          )}

          {/* Step 3 */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Subscription Tier">
                  <select value={wizard.tier} onChange={e => setWizard(w => ({ ...w, tier: e.target.value }))} className={inputCls}>
                    {Object.entries(TIER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Expiry Date">
                  <input
                    type="date"
                    value={wizard.expiry_date}
                    onChange={e => setWizard(w => ({ ...w, expiry_date: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
              </div>
              {/* Summary card */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Review Summary</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-gray-400 text-xs">School</span><p className="font-medium text-gray-900 truncate">{wizard.name_en}</p></div>
                  {wizard.name_ar && <div><span className="text-gray-400 text-xs">Arabic Name</span><p className="font-medium text-gray-900" dir="rtl">{wizard.name_ar}</p></div>}
                  <div><span className="text-gray-400 text-xs">Type</span><p className="text-gray-700 capitalize">{wizard.school_type}</p></div>
                  {wizard.governorate && <div><span className="text-gray-400 text-xs">Governorate</span><p className="text-gray-700">{wizard.governorate}</p></div>}
                  {wizard.oaaaqa_code && <div><span className="text-gray-400 text-xs">OAAAQA Code</span><p className="font-mono text-gray-700">{wizard.oaaaqa_code}</p></div>}
                  <div><span className="text-gray-400 text-xs">Admin Name</span><p className="font-medium text-gray-900">{wizard.full_name}</p></div>
                  <div><span className="text-gray-400 text-xs">Admin Email</span><p className="text-gray-700">{wizard.email}</p></div>
                  <div><span className="text-gray-400 text-xs">Tier</span>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium border mt-0.5 ${TIER_COLOURS[wizard.tier] ?? TIER_COLOURS.trial}`}>
                      {TIER_LABELS[wizard.tier]}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-2">
            {wizardStep > 1 && (
              <button onClick={() => setWizardStep(s => s - 1)} className={secondaryBtn} disabled={wizardSaving}>
                ← Back
              </button>
            )}
            {wizardStep < 3 ? (
              <button
                onClick={() => setWizardStep(s => s + 1)}
                disabled={wizardStep === 1 ? !step1Valid : !step2Valid}
                className={primaryBtn}
              >
                Next →
              </button>
            ) : (
              <button onClick={() => void handleWizardFinish()} disabled={wizardSaving} className={primaryBtn}>
                {wizardSaving ? 'Creating…' : 'Create School'}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────

const ROLE_OPTIONS = [
  'school_admin', 'principal', 'vice_principal', 'quality_coordinator',
  'head_of_department', 'teacher', 'auditor', 'chain_admin',
];

function UsersTab() {
  const [users, setUsers]         = useState<UserRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  // Dropdown menu per row
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Edit dialog
  const [editUser, setEditUser]   = useState<UserRow | null>(null);
  const [editForm, setEditForm]   = useState({ full_name: '', email: '', role: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reset password dialog
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [newPw, setNewPw]         = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError]   = useState<string | null>(null);

  // Delete dialog
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // SED team toggle
  const [sedTeamLoading, setSedTeamLoading] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [profilesRes, membershipsRes, schoolsRes] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, email, role, is_super_admin, is_sed_team, is_active, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('school_members')
        .select('user_id, role, status, school_id'),
      supabase.from('schools')
        .select('id, name_en')
        .order('name_en'),
    ]);

    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return; }

    const schoolMap = Object.fromEntries((schoolsRes.data ?? []).map(s => [s.id, s.name_en as string]));
    const memberMap: Record<string, Array<{ role: string; status: string; school_id: string }>> = {};
    for (const m of membershipsRes.data ?? []) {
      if (!memberMap[m.user_id]) memberMap[m.user_id] = [];
      memberMap[m.user_id].push(m);
    }

    const rows: UserRow[] = (profilesRes.data ?? []).flatMap(p => {
      const profile = p as {
        id: string; full_name: string | null; email: string | null;
        role: string | null; is_super_admin: boolean; is_sed_team: boolean;
        is_active: boolean; created_at: string;
      };
      const memberships = memberMap[profile.id] ?? [];
      if (!memberships.length) {
        return [{
          user_id:        profile.id,
          full_name:      profile.full_name,
          email:          profile.email,
          is_super_admin: Boolean(profile.is_super_admin),
          is_sed_team:    Boolean(profile.is_sed_team),
          is_active:      profile.is_active !== false,
          role:           profile.is_super_admin ? 'super_admin' : (profile.role ?? '—'),
          status:         'active',
          school_id:      '',
          school_name:    '—',
          created_at:     profile.created_at,
        }];
      }
      return memberships.map(m => ({
        user_id:        profile.id,
        full_name:      profile.full_name,
        email:          profile.email,
        is_super_admin: Boolean(profile.is_super_admin),
        is_sed_team:    Boolean(profile.is_sed_team),
        is_active:      profile.is_active !== false,
        role:           m.role,
        status:         m.status,
        school_id:      m.school_id,
        school_name:    schoolMap[m.school_id] ?? '—',
        created_at:     profile.created_at,
      }));
    });

    setUsers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Edit user ──────────────────────────────────────────────
  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditForm({ full_name: u.full_name ?? '', email: u.email ?? '', role: u.role });
    setEditError(null);
    setMenuOpenId(null);
  }

  async function handleEditSave() {
    if (!editUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await invokeAdmin('update_user', {
        user_id:   editUser.user_id,
        full_name: editForm.full_name || null,
        email:     editForm.email     || undefined,
        role:      editForm.role      || undefined,
      });
      setEditUser(null);
      await load();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  }

  // ── Toggle active ──────────────────────────────────────────
  async function handleToggleActive(u: UserRow) {
    setMenuOpenId(null);
    try {
      await invokeAdmin('toggle_user_active', { user_id: u.user_id, set_active: !u.is_active });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Reset password ─────────────────────────────────────────
  function openResetPw(u: UserRow) {
    setResetUser(u);
    setNewPw('');
    setShowPw(false);
    setResetError(null);
    setMenuOpenId(null);
  }

  async function handleResetPw() {
    if (!resetUser) return;
    setResetSaving(true);
    setResetError(null);
    try {
      await invokeAdmin('reset_user_password', { user_id: resetUser.user_id, new_password: newPw });
      setResetUser(null);
    } catch (e: unknown) {
      setResetError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetSaving(false);
    }
  }

  // ── Delete user ────────────────────────────────────────────
  function openDelete(u: UserRow) {
    setDeleteUser(u);
    setDeleteError(null);
    setMenuOpenId(null);
  }

  async function handleDelete() {
    if (!deleteUser) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await invokeAdmin('delete_user', { user_id: deleteUser.user_id });
      setDeleteUser(null);
      await load();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  // ── SED team toggle ────────────────────────────────────────
  async function handleSedToggle(u: UserRow) {
    setSedTeamLoading(prev => new Set(prev).add(u.user_id));
    const { error: sedErr } = await supabase
      .from('profiles')
      .update({ is_sed_team: !u.is_sed_team })
      .eq('id', u.user_id);
    if (!sedErr) {
      setUsers(prev => prev.map(r => r.user_id === u.user_id ? { ...r, is_sed_team: !r.is_sed_team } : r));
    }
    setSedTeamLoading(prev => { const s = new Set(prev); s.delete(u.user_id); return s; });
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
                      {u.full_name ?? '—'}
                      {u.is_super_admin && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-semibold">SA</span>
                      )}
                      {!u.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-semibold">Inactive</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{u.email ?? '—'}</div>
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
                  <td className="px-5 py-3 text-right relative">
                    <button
                      onClick={() => setMenuOpenId(id => id === u.user_id + u.school_id ? null : u.user_id + u.school_id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuOpenId === u.user_id + u.school_id && (
                      <div className="absolute right-5 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-44">
                        <button onClick={() => openEdit(u)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          Edit User
                        </button>
                        <button onClick={() => void handleToggleActive(u)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => openResetPw(u)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          Reset Password
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                        <button onClick={() => openDelete(u)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                          Delete User
                        </button>
                      </div>
                    )}
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

      {/* Click-away to close menu */}
      {menuOpenId && (
        <div className="fixed inset-0 z-20" onClick={() => setMenuOpenId(null)} />
      )}

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={open => { if (!open && !editSaving) setEditUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editError && <ErrorBanner message={editError} />}
          <div className="space-y-4">
            <Field label="Full Name">
              <input type="text" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} placeholder="Ahmad Al-Rashidi" />
            </Field>
            <Field label="Email">
              <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="user@school.edu.om" />
            </Field>
            <Field label="Role">
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => void handleEditSave()} disabled={editSaving} className={primaryBtn}>
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => setEditUser(null)} disabled={editSaving} className={secondaryBtn}>Cancel</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetUser} onOpenChange={open => { if (!open && !resetSaving) setResetUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password — {resetUser?.full_name ?? resetUser?.email}</DialogTitle>
          </DialogHeader>
          {resetError && <ErrorBanner message={resetError} />}
          <Field label="New Password (min 8 chars)">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="••••••••"
                className={`${inputCls} pr-10`}
              />
              <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPw.length > 0 && newPw.length < 8 && <p className="text-xs text-red-500 mt-1">At least 8 characters required</p>}
          </Field>
          <div className="flex gap-3 mt-4">
            <button onClick={() => void handleResetPw()} disabled={resetSaving || newPw.length < 8} className={primaryBtn}>
              {resetSaving ? 'Saving…' : 'Set Password'}
            </button>
            <button onClick={() => setResetUser(null)} disabled={resetSaving} className={secondaryBtn}>Cancel</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={!!deleteUser} onOpenChange={open => { if (!open && !deleting) setDeleteUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          {deleteError && <ErrorBanner message={deleteError} />}
          <div className="py-2 text-sm text-gray-600">
            <p>This will permanently delete <strong>{deleteUser?.full_name ?? deleteUser?.email}</strong> and all their data.</p>
            <p className="mt-1 text-red-600 font-medium">This cannot be undone.</p>
          </div>
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete Permanently'}
            </button>
            <button onClick={() => setDeleteUser(null)} disabled={deleting} className={secondaryBtn}>Cancel</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────

function AnalyticsTab() {
  const navigate            = useNavigate();
  const { setImpersonating } = useSchoolStore();
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

  const pieData = (analytics.schools_by_tier ?? []).map(({ tier, count }) => ({
    name:  TIER_LABELS[tier] ?? tier,
    value: count,
    fill:  TIER_PIE_COLOURS[tier] ?? '#9ca3af',
  }));

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div className="space-y-6">
      {/* Row 1 — KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard label="Active Schools"        value={analytics.total_schools}    icon="🏫" />
        <KpiCard label="Total Users"           value={analytics.total_users}      icon="👥" />
        <KpiCard label="SEDs Generated"        value={analytics.total_seds}       icon="📄" />
        <KpiCard label="AI Requests (30d)"     value={analytics.ai_requests_30d}  icon="🤖" />
      </div>

      {/* Row 2 — Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* PieChart — schools by tier */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Schools by Subscription Tier</h3>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* BarChart — SEDs per month */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">SEDs Generated — Last 6 Months</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics.seds_by_month ?? []} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#01696f" radius={[4, 4, 0, 0]} name="SEDs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3 — Detailed schools table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">All Active Schools</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['School', 'Governorate', 'Tier', 'Users', 'Last Activity', 'Expires', ''].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(analytics.schools_detail ?? []).map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{s.name_en}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{s.governorate || '—'}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${TIER_COLOURS[s.subscription_tier] ?? TIER_COLOURS.trial}`}>
                    {TIER_LABELS[s.subscription_tier] ?? s.subscription_tier}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-600 text-xs">{s.user_count}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{fmtDate(s.last_activity)}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{fmtDate(s.subscription_expires_at)}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap text-xs">
                  <button
                    onClick={() => { setImpersonating(s as unknown as School); navigate('/dashboard'); }}
                    className="text-amber-600 hover:underline font-medium"
                  >
                    Impersonate
                  </button>
                </td>
              </tr>
            ))}
            {!(analytics.schools_detail ?? []).length && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Regression card still shown below */}
      <RegressionCard />

      {/* ── Maintenance section ── */}
      <MaintenanceSection />
    </div>
  );
}

// ─── Maintenance Section (academic year rollover) ─────────────

function MaintenanceSection() {
  const [rolling, setRolling]   = useState(false);
  const [result, setResult]     = useState<string | null>(null);
  const [err, setErr]           = useState<string | null>(null);

  async function handleRollover() {
    setRolling(true);
    setResult(null);
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error: fnErr } = await supabase.functions.invoke('academic-year-rollover', {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (fnErr) throw fnErr;
      const r = data as { expected_label: string; rolled_over_count: number };
      setResult(`Rolled over ${r.rolled_over_count} school${r.rolled_over_count !== 1 ? 's' : ''} to ${r.expected_label}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRolling(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Maintenance</h3>
      <p className="text-xs text-gray-500 mb-4">
        Run academic year rollover to create the current Oman school year for all active schools.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void handleRollover()}
          disabled={rolling}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          {rolling ? 'Running…' : 'Run Academic Year Rollover'}
        </button>
        {result && <span className="text-sm text-green-700 font-medium">{result}</span>}
        {err    && <span className="text-sm text-red-600">{err}</span>}
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
