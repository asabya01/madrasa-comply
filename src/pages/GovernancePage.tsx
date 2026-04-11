import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload, RefreshCw, FileText, ExternalLink } from 'lucide-react';
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

interface PolicyDoc {
  id: string;
  title: string;
  last_review_date: string | null;
  file_url: string | null;
  created_at: string;
}

interface SchoolMember {
  user_id: string;
  profiles: { full_name: string | null } | null;
}

// ─── Page ─────────────────────────────────────────────────────

export default function GovernancePage() {
  const [tab, setTab] = useState<'staff' | 'policies'>('staff');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Governance</h1>
        <p className="text-sm text-gray-500 mt-1">
          Maintain accountability registers and policy documentation for OAAAQA Standard 5.5.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {([
          { key: 'staff',    label: 'Staff Roles & Responsibilities' },
          { key: 'policies', label: 'Policy Register' },
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
      {tab === 'policies' && <PolicyRegisterTab />}
    </div>
  );
}

// ─── Staff Roles Tab ──────────────────────────────────────────

function StaffRolesTab() {
  const { school } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

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

  // Local editable state — mirror of DB rows
  const [rows, setRows] = useState<StaffRole[]>([]);
  const initialised = useRef(false);
  if (!rolesLoading && !initialised.current && roles.length >= 0) {
    setRows(roles);
    initialised.current = true;
  }
  // Sync when query data changes (e.g. after add/delete)
  const prevLen = useRef(roles.length);
  if (roles.length !== prevLen.current) {
    setRows(roles);
    prevLen.current = roles.length;
  }

  const upsertMutation = useMutation({
    mutationFn: async (row: StaffRole) => {
      if (!school) return;
      const { error } = await supabase.from('staff_roles').upsert({
        id:               row.id,
        school_id:        school.id,
        job_title:        row.job_title || '(untitled)',
        responsibilities: row.responsibilities || null,
        assigned_user_id: row.assigned_user_id || null,
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

  function handleBlur(row: StaffRole) {
    upsertMutation.mutate(row);
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#01696f] bg-white';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold font-sans">Staff Roles & Responsibilities</CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          This register supports evidence for indicator 5.5.1 — Accountability according to roles and responsibilities.
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
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[28%]">Job Title</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[42%]">Responsibilities</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[24%]">Assigned User</th>
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
                          onBlur={() => handleBlur(row)}
                          placeholder="e.g. Principal"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <textarea
                          value={row.responsibilities ?? ''}
                          onChange={(e) => updateRow(row.id, 'responsibilities', e.target.value)}
                          onBlur={() => handleBlur(row)}
                          placeholder="Key responsibilities…"
                          rows={2}
                          className={`${inputCls} resize-none`}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <select
                          value={row.assigned_user_id ?? ''}
                          onChange={(e) => {
                            updateRow(row.id, 'assigned_user_id', e.target.value || null);
                            // blur-save immediately on select change
                            upsertMutation.mutate({ ...row, assigned_user_id: e.target.value || null });
                          }}
                          className={inputCls}
                        >
                          <option value="">— Unassigned —</option>
                          {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.profiles?.full_name ?? m.user_id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
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
                No roles defined yet. Add a row to get started.
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                className="flex items-center gap-1.5 text-sm text-[#01696f] hover:text-[#0c4e54] font-medium transition-colors"
              >
                {addMutation.isPending
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Plus className="h-4 w-4" />}
                Add Row
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Policy Register Tab ──────────────────────────────────────

function PolicyRegisterTab() {
  const { school } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['policy-register', school?.id],
    queryFn: async () => {
      if (!school) return [] as PolicyDoc[];
      const { data, error } = await supabase
        .from('policy_register')
        .select('id, title, last_review_date, file_url, created_at')
        .eq('school_id', school.id)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as PolicyDoc[];
    },
    enabled: !!school,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!school) return;
      const { error } = await supabase
        .from('policy_register')
        .insert({ school_id: school.id, title: 'New Policy' });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['policy-register'] }),
    onError: (e) => showToast(e instanceof Error ? e.message : 'Add failed', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string | null }) => {
      const { error } = await supabase
        .from('policy_register')
        .update({ [field]: value })
        .eq('id', id);
      if (error) throw error;
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Update failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('policy_register').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['policy-register'] }),
    onError: (e) => showToast(e instanceof Error ? e.message : 'Delete failed', 'error'),
  });

  async function handleFileUpload(policyId: string, file: File) {
    if (!school) return;
    setUploadingId(policyId);
    try {
      const ext = file.name.split('.').pop() ?? 'pdf';
      const path = `${school.id}/${policyId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('policy-documents')
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: signed } = await supabase.storage
        .from('policy-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
      if (!signed?.signedUrl) throw new Error('Could not generate URL');

      await updateMutation.mutateAsync({ id: policyId, field: 'file_url', value: signed.signedUrl });
      void queryClient.invalidateQueries({ queryKey: ['policy-register'] });
      showToast('Document uploaded', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setUploadingId(null);
    }
  }

  const inputCls = 'border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#01696f] bg-white';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold font-sans">Policy Register</CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          This register supports evidence for indicator 5.5.2 — Implementation of policies and rules relating to schoolwork.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[40%]">Policy Title</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[20%]">Last Review Date</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-[28%]">Document</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {policies.map((policy) => (
                    <tr key={policy.id} className="group">
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          defaultValue={policy.title}
                          onBlur={(e) => updateMutation.mutate({ id: policy.id, field: 'title', value: e.target.value })}
                          placeholder="Policy name"
                          className={`${inputCls} w-full`}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="date"
                          defaultValue={policy.last_review_date ?? ''}
                          onBlur={(e) => updateMutation.mutate({ id: policy.id, field: 'last_review_date', value: e.target.value || null })}
                          className={`${inputCls} w-full`}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {policy.file_url ? (
                            <a
                              href={policy.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs text-[#01696f] hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              View
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">No document</span>
                          )}
                          {/* Hidden file input */}
                          <input
                            type="file"
                            ref={(el) => { fileInputRefs.current[policy.id] = el; }}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.xlsx,.pptx"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleFileUpload(policy.id, file);
                            }}
                          />
                          <button
                            onClick={() => fileInputRefs.current[policy.id]?.click()}
                            disabled={uploadingId === policy.id}
                            className="flex items-center gap-1 px-2 py-1 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            {uploadingId === policy.id
                              ? <RefreshCw className="h-3 w-3 animate-spin" />
                              : <Upload className="h-3 w-3" />}
                            {policy.file_url ? 'Replace' : 'Upload'}
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <button
                          onClick={() => deleteMutation.mutate(policy.id)}
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

            {policies.length === 0 && (
              <div className="text-center py-6 text-sm text-gray-400">
                No policies recorded yet.
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                className="flex items-center gap-1.5 text-sm text-[#01696f] hover:text-[#0c4e54] font-medium transition-colors"
              >
                {addMutation.isPending
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Plus className="h-4 w-4" />}
                Add Policy
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
