import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload, RefreshCw, FileText, Link2, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

// ─── Types ────────────────────────────────────────────────────

interface StaffRole {
  id: string;
  job_title: string;
  responsibilities: string | null;
  assigned_user_id: string | null;
}

interface SchoolPolicy {
  id: string;
  title: string;
  last_review_date: string | null;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
}

interface SchoolMember {
  user_id: string;
  profiles: { full_name: string | null } | null;
}

// ─── Evidence linker helper ───────────────────────────────────

async function linkAsEvidence(
  schoolId: string,
  indicatorId: string,
  standardId: string,
  domainId: string,
  entityName: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  // Create a virtual evidence_files record representing this register entry
  const { data: evFile, error: efErr } = await supabase
    .from('evidence_files')
    .insert({
      school_id: schoolId,
      file_name: entityName,
      file_path: `governance/${entityType}/${entityId}`,
      file_type: 'register',
      description: `Governance register entry — ${entityType}`,
    })
    .select('id')
    .single();
  if (efErr) throw efErr;

  // Link to the indicator
  const { error: linkErr } = await supabase
    .from('evidence_indicator_links')
    .upsert({
      evidence_file_id: evFile.id,
      indicator_id: indicatorId,
      standard_id: standardId,
      domain_id: domainId,
      school_id: schoolId,
    }, { onConflict: 'evidence_file_id,indicator_id' });
  if (linkErr) throw linkErr;
}

// ─── Page ─────────────────────────────────────────────────────

export default function GovernancePage() {
  const [tab, setTab] = useState<'staff' | 'policies'>('staff');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Governance</h1>
        <p className="text-sm text-gray-500 mt-1">
          Accountability registers and policy documentation for OAAAQA Standard 5.5.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {([
          { key: 'staff',    label: 'Staff Roles & Responsibilities' },
          { key: 'policies', label: 'Policies & Regulations' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'staff'    && <StaffRolesTab />}
      {tab === 'policies' && <PoliciesTab />}
    </div>
  );
}

// ─── Staff Roles Tab (Indicator 5.5.1) ───────────────────────

function StaffRolesTab() {
  const { school } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['staff-roles', school?.id],
    queryFn: async () => {
      if (!school) return [] as StaffRole[];
      const { data, error } = await supabase
        .from('staff_roles')
        .select('id, job_title, responsibilities, assigned_user_id')
        .eq('school_id', school.id)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as StaffRole[];
    },
    enabled: !!school,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['school-members-profiles', school?.id],
    queryFn: async () => {
      if (!school) return [] as SchoolMember[];
      const { data, error } = await supabase
        .from('school_members')
        .select('user_id, profiles:profiles!school_members_user_id_fkey(full_name)')
        .eq('school_id', school.id)
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []).map((m) => ({
        user_id: m.user_id as string,
        profiles: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name: string | null } | null,
      })) as SchoolMember[];
    },
    enabled: !!school,
    staleTime: 1000 * 60 * 5,
  });

  const [rows, setRows] = useState<StaffRole[]>([]);
  const initialised = useRef(false);
  if (!rolesLoading && !initialised.current) { setRows(roles); initialised.current = true; }
  const prevLen = useRef(roles.length);
  if (roles.length !== prevLen.current) { setRows(roles); prevLen.current = roles.length; }

  const upsertMutation = useMutation({
    mutationFn: async (row: StaffRole) => {
      if (!school) return;
      const { error } = await supabase.from('staff_roles').upsert({
        id:               row.id,
        school_id:        school.id,
        job_title:        row.job_title || '(untitled)',
        responsibilities: row.responsibilities || null,
        assigned_user_id: row.assigned_user_id || null,
        updated_at:       new Date().toISOString(),
      });
      if (error) throw error;
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Save failed', 'error'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['staff-roles', school?.id] }),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!school) return;
      const { data, error } = await supabase
        .from('staff_roles')
        .insert({ school_id: school.id, job_title: '' })
        .select('id, job_title, responsibilities, assigned_user_id')
        .single();
      if (error) throw error;
      return data as StaffRole;
    },
    onSuccess: (row) => {
      if (row) setRows((r) => [...r, row]);
      initialised.current = false;
      void queryClient.invalidateQueries({ queryKey: ['staff-roles', school?.id] });
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Add failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('staff_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      initialised.current = false;
      void queryClient.invalidateQueries({ queryKey: ['staff-roles', school?.id] });
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Delete failed', 'error'),
  });

  function updateRow(id: string, field: keyof StaffRole, value: string | null) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function handleLinkEvidence(row: StaffRole) {
    if (!school) return;
    setLinkingId(row.id);
    try {
      await linkAsEvidence(
        school.id, '5.5.1', '5.5', '5', row.job_title || 'Staff Role', 'staff_role', row.id
      );
      showToast('Linked to indicator 5.5.1', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLinkingId(null);
    }
  }

  const cls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#01696f] bg-white';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold font-sans flex items-center gap-2">
          Staff Roles & Responsibilities
          <span className="text-xs font-normal text-gray-400">Indicator 5.5.1</span>
        </CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          Define job titles, responsibilities, and assigned personnel for the school accountability register.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {rolesLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[24%]">Job Title</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[38%]">Responsibilities</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[20%]">Assigned User</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[12%]">Evidence</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row) => (
                    <tr key={row.id} className="group">
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={row.job_title}
                          onChange={(e) => updateRow(row.id, 'job_title', e.target.value)}
                          onBlur={() => upsertMutation.mutate(row)}
                          placeholder="e.g. Principal"
                          className={cls}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <textarea
                          value={row.responsibilities ?? ''}
                          onChange={(e) => updateRow(row.id, 'responsibilities', e.target.value)}
                          onBlur={() => upsertMutation.mutate(row)}
                          placeholder="Key responsibilities…"
                          rows={2}
                          className={`${cls} resize-none`}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <select
                          value={row.assigned_user_id ?? ''}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            updateRow(row.id, 'assigned_user_id', val);
                            upsertMutation.mutate({ ...row, assigned_user_id: val });
                          }}
                          className={cls}
                        >
                          <option value="">— Unassigned —</option>
                          {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.profiles?.full_name ?? m.user_id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2">
                        <button
                          onClick={() => void handleLinkEvidence(row)}
                          disabled={linkingId === row.id}
                          className="flex items-center gap-1 text-xs text-[#01696f] hover:underline disabled:opacity-50"
                        >
                          {linkingId === row.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Link2 className="h-3 w-3" />}
                          Link
                        </button>
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <button
                          onClick={() => deleteMutation.mutate(row.id)}
                          disabled={deleteMutation.isPending}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length === 0 && (
              <div className="text-center py-6 text-sm text-gray-400">
                No roles defined yet. Click "Add Row" to start.
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                className="flex items-center gap-1.5 text-sm text-[#01696f] hover:text-[#0c4e54] font-medium transition-colors"
              >
                {addMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Role
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Policies Tab (Indicator 5.5.2) ──────────────────────────

function PoliciesTab() {
  const { school } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [addingNewTitle, setAddingNewTitle] = useState('');
  const [addingNewDate, setAddingNewDate]   = useState('');
  const [addingNewFile, setAddingNewFile]   = useState<File | null>(null);
  const [addingNew, setAddingNew]           = useState(false);
  const [savingNew, setSavingNew]           = useState(false);
  const [linkingId, setLinkingId]           = useState<string | null>(null);
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['school-policies', school?.id],
    queryFn: async () => {
      if (!school) return [] as SchoolPolicy[];
      const { data, error } = await supabase
        .from('school_policies')
        .select('id, title, last_review_date, file_path, file_name, created_at')
        .eq('school_id', school.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SchoolPolicy[];
    },
    enabled: !!school,
  });

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  function isOverdue(dateStr: string | null): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < oneYearAgo;
  }

  async function handleSaveNew() {
    if (!school || !addingNewTitle.trim()) return;
    setSavingNew(true);
    try {
      let filePath: string | null = null;
      let fileName: string | null = null;

      if (addingNewFile) {
        const ext = addingNewFile.name.split('.').pop() ?? '';
        const storagePath = `${school.id}/${Date.now()}-${addingNewFile.name}`;
        const { error: upErr } = await supabase.storage
          .from('policies')
          .upload(storagePath, addingNewFile, { upsert: true });
        if (upErr) throw upErr;
        filePath = storagePath;
        fileName = addingNewFile.name;
      }

      const { error } = await supabase.from('school_policies').insert({
        school_id:        school.id,
        title:            addingNewTitle.trim(),
        last_review_date: addingNewDate || null,
        file_path:        filePath,
        file_name:        fileName,
      });
      if (error) throw error;

      setAddingNew(false);
      setAddingNewTitle('');
      setAddingNewDate('');
      setAddingNewFile(null);
      void queryClient.invalidateQueries({ queryKey: ['school-policies', school.id] });
      showToast('Policy saved', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSavingNew(false);
    }
  }

  async function handleDelete(policy: SchoolPolicy) {
    if (!school) return;
    setDeletingId(policy.id);
    try {
      if (policy.file_path) {
        await supabase.storage.from('policies').remove([policy.file_path]);
      }
      const { error } = await supabase.from('school_policies').delete().eq('id', policy.id);
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['school-policies', school.id] });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleGetFile(policy: SchoolPolicy) {
    if (!policy.file_path) return;
    const { data } = await supabase.storage
      .from('policies')
      .createSignedUrl(policy.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function handleLinkEvidence(policy: SchoolPolicy) {
    if (!school) return;
    setLinkingId(policy.id);
    try {
      await linkAsEvidence(
        school.id, '5.5.2', '5.5', '5', policy.title, 'school_policy', policy.id
      );
      showToast('Linked to indicator 5.5.2', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold font-sans flex items-center gap-2">
          Policies & Regulations Register
          <span className="text-xs font-normal text-gray-400">Indicator 5.5.2</span>
        </CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          Track all school policies with review dates and upload supporting documents.
          Policies not reviewed within 12 months are flagged as overdue.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[36%]">Policy Title</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[18%]">Last Review</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[18%]">File</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[14%]">Evidence</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {policies.map((policy) => {
                    const overdue = isOverdue(policy.last_review_date);
                    return (
                      <tr key={policy.id} className="group">
                        <td className="py-2 px-2">
                          <span className="text-sm text-gray-900 font-medium">{policy.title}</span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                              {policy.last_review_date
                                ? new Date(policy.last_review_date).toLocaleDateString('en-GB')
                                : '—'}
                            </span>
                            {overdue && (
                              <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                                <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          {policy.file_name ? (
                            <button
                              onClick={() => void handleGetFile(policy)}
                              className="flex items-center gap-1 text-xs text-[#01696f] hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {policy.file_name.length > 20 ? `${policy.file_name.slice(0, 20)}…` : policy.file_name}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">No file</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <button
                            onClick={() => void handleLinkEvidence(policy)}
                            disabled={linkingId === policy.id}
                            className="flex items-center gap-1 text-xs text-[#01696f] hover:underline disabled:opacity-50"
                          >
                            {linkingId === policy.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Link2 className="h-3 w-3" />}
                            Link
                          </button>
                        </td>
                        <td className="py-2 px-1 text-center">
                          <button
                            onClick={() => void handleDelete(policy)}
                            disabled={deletingId === policy.id}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all disabled:opacity-50"
                          >
                            {deletingId === policy.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {policies.length === 0 && !addingNew && (
              <div className="text-center py-6 text-sm text-gray-400">
                No policies recorded yet. Add one to start building your register.
              </div>
            )}

            {/* Add new policy form */}
            {addingNew ? (
              <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-medium text-gray-900">Add Policy</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Policy Title *</label>
                    <input
                      type="text"
                      value={addingNewTitle}
                      onChange={(e) => setAddingNewTitle(e.target.value)}
                      placeholder="e.g. Safeguarding Policy"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Last Review Date</label>
                    <input
                      type="date"
                      value={addingNewDate}
                      onChange={(e) => setAddingNewDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Policy Document (PDF / DOCX)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      ref={fileInputRef}
                      onChange={(e) => setAddingNewFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {addingNewFile ? addingNewFile.name : 'Choose file…'}
                    </button>
                    {addingNewFile && (
                      <button type="button" onClick={() => setAddingNewFile(null)} className="text-xs text-gray-400 hover:text-red-500">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => void handleSaveNew()}
                    disabled={savingNew || !addingNewTitle.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-[#01696f] text-white text-sm rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
                  >
                    {savingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save Policy
                  </button>
                  <button
                    onClick={() => { setAddingNew(false); setAddingNewTitle(''); setAddingNewDate(''); setAddingNewFile(null); }}
                    className="px-4 py-1.5 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingNew(true)}
                className="flex items-center gap-1.5 text-sm text-[#01696f] hover:text-[#0c4e54] font-medium transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Policy
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
