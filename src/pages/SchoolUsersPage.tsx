import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { FileSpreadsheet, Upload, Users as UsersIcon } from 'lucide-react';
import { useToast } from '../components/ui/toast';

// ─── Types ────────────────────────────────────────────────────

interface UserRow {
  id: string;       // school_members.id
  user_id: string;
  role: string;
  status: string;
  full_name: string | null;
  email: string;
  department: string | null;
  joined_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  school_admin:       'School Admin',
  principal:          'Principal',
  vice_principal:     'Vice Principal',
  senior_management:  'Senior Mgmt',
  head_of_department: 'HOD',
  quality_coordinator:'QC',
  teacher:            'Teacher',
  auditor:            'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
  school_admin:       'bg-purple-100 text-purple-700',
  principal:          'bg-indigo-100 text-indigo-700',
  vice_principal:     'bg-indigo-100 text-indigo-700',
  senior_management:  'bg-blue-100 text-blue-700',
  head_of_department: 'bg-teal-100 text-teal-700',
  quality_coordinator:'bg-cyan-100 text-cyan-700',
  teacher:            'bg-green-100 text-green-700',
  auditor:            'bg-gray-100 text-gray-600',
};

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  suspended: 'bg-red-100 text-red-700',
};

const EDITABLE_ROLES = [
  { value: 'school_admin',       label: 'School Admin' },
  { value: 'principal',          label: 'Principal' },
  { value: 'vice_principal',     label: 'Vice Principal' },
  { value: 'senior_management',  label: 'Senior Management' },
  { value: 'head_of_department', label: 'Head of Department' },
  { value: 'quality_coordinator',label: 'Quality Coordinator' },
  { value: 'teacher',            label: 'Teacher' },
  { value: 'auditor',            label: 'Viewer' },
];

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f] bg-white';

// ─── Staff CSV Import ─────────────────────────────────────────

const STAFF_ROLES = ['teacher', 'head_of_department', 'quality_coordinator', 'vice_principal', 'principal', 'auditor'] as const;
type StaffRole = typeof STAFF_ROLES[number];

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  teacher:             'Teacher',
  head_of_department:  'Head of Department',
  quality_coordinator: 'Quality Coordinator',
  vice_principal:      'Vice Principal',
  principal:           'Principal',
  auditor:             'Viewer / Auditor',
};

interface StaffCsvRow {
  full_name: string;
  email: string;
  role: string;
  department: string;
  _errors: string[];
  _valid: boolean;
  _exists?: boolean; // true = already a member
}

function validateStaffRow(
  r: Pick<StaffCsvRow, 'full_name' | 'email' | 'role'>,
  existingEmails: Set<string>,
): string[] {
  const errors: string[] = [];
  if (!r.full_name.trim()) errors.push('full_name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) errors.push('Invalid email');
  if (!(STAFF_ROLES as readonly string[]).includes(r.role.trim())) {
    errors.push(`role must be one of: ${STAFF_ROLES.join(', ')}`);
  }
  if (existingEmails.has(r.email.trim().toLowerCase())) {
    errors.push('Already a member of this school');
  }
  return errors;
}

function downloadStaffTemplate() {
  const header = 'full_name,email,role,department';
  const example = 'Ahmed Al-Rashidi,ahmed@school.edu.om,teacher,Mathematics';
  const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'staff-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function StaffCsvImportDialog({
  open,
  onClose,
  school,
  existingEmails,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  school: { id: string; name_en: string };
  existingEmails: Set<string>;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const { data: session } = { data: null } as { data: { access_token: string } | null };
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<StaffCsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<{ imported: number; errors: string[] } | null>(null);

  function handleClose() {
    if (!importing) {
      setStep(1); setRows([]); setImportError(null); setImportResults(null); onClose();
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      const dataLines = lines.slice(1);
      const parsed: StaffCsvRow[] = dataLines.map(line => {
        const parts = line.split(',');
        const [full_name = '', email = '', role = '', department = ''] = parts;
        const raw = {
          full_name: full_name.trim(),
          email:     email.trim(),
          role:      role.trim(),
          department: department.trim(),
        };
        const _errors = validateStaffRow(raw, existingEmails);
        return { ...raw, _errors, _valid: _errors.length === 0 };
      });
      setRows(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleImport() {
    const valid = rows.filter(r => r._valid);
    if (!valid.length) return;
    setImporting(true);
    setImportError(null);

    // Get current session token
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const token = currentSession?.access_token;
    if (!token) { setImportError('Not authenticated'); setImporting(false); return; }

    const results = { imported: 0, errors: [] as string[] };

    for (const row of valid) {
      try {
        // Check if email already exists in auth/profiles
        const checkRes = await supabase.functions.invoke('admin-actions', {
          body: { action: 'check_email_exists', email: row.email },
          headers: { Authorization: `Bearer ${token}` },
        });
        const checkData = checkRes.data as { exists: boolean; user_id?: string } | null;

        if (checkData?.exists && checkData.user_id) {
          // Already exists — just add to school_members
          const { error: smErr } = await supabase
            .from('school_members')
            .upsert({
              school_id: school.id,
              user_id:   checkData.user_id,
              role:      row.role,
              status:    'active',
            }, { onConflict: 'school_id,user_id' });
          if (smErr) throw new Error(smErr.message);
        } else {
          // New user — invite via admin-actions
          const inviteRes = await supabase.functions.invoke('admin-actions', {
            body: {
              action:      'invite_staff_member',
              email:       row.email,
              full_name:   row.full_name,
              role:        row.role,
              department:  row.department || null,
              school_id:   school.id,
              school_name: school.name_en,
            },
            headers: { Authorization: `Bearer ${token}` },
          });
          if (inviteRes.error) throw new Error(String(inviteRes.error));
          const inviteData = inviteRes.data as { error?: string } | null;
          if (inviteData?.error) throw new Error(inviteData.error);
        }
        results.imported++;
      } catch (err) {
        results.errors.push(`${row.email}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setImportResults(results);
    setImporting(false);

    if (results.imported > 0) {
      showToast(`Imported ${results.imported} staff member${results.imported !== 1 ? 's' : ''}`, 'success');
      onSuccess();
    }
    if (results.errors.length === 0) handleClose();
  }

  const validCount  = rows.filter(r => r._valid).length;
  const errorCount  = rows.filter(r => !r._valid).length;
  const allValid    = rows.length > 0 && errorCount === 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Staff — Step {step} of 3</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4 text-xs">
          {(['Template', 'Upload & Validate', 'Confirm & Import'] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center font-semibold shrink-0 ${
                step > i + 1 ? 'bg-[#01696f] text-white' :
                step === i + 1 ? 'bg-[#01696f] text-white ring-4 ring-[#01696f]/20' :
                'bg-gray-100 text-gray-400'
              }`}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={step === i + 1 ? 'text-gray-900 font-medium' : 'text-gray-400'}>{label}</span>
              {i < 2 && <div className="h-px w-6 bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        {importError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{importError}</div>
        )}

        {/* Step 1 — Template */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Download the CSV template, fill in your staff data, then upload it in the next step.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-600">Template headers:</p>
              <code className="text-xs text-[#01696f] bg-white border border-gray-200 px-3 py-2 rounded block font-mono">
                full_name, email, role, department
              </code>
              <p className="text-xs text-gray-400">
                Role must be one of:{' '}
                <span className="font-mono">{STAFF_ROLES.join(', ')}</span>
              </p>
              <p className="text-xs text-gray-400">Department is optional (free text).</p>
            </div>
            <button
              onClick={downloadStaffTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" /> Download Staff CSV Template
            </button>
          </div>
        )}

        {/* Step 2 — Upload & Validate */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-[#01696f] hover:text-[#01696f] cursor-pointer bg-white transition-colors">
                <Upload className="h-4 w-4" />
                Choose CSV File
                <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
              </label>
              {rows.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${allValid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {validCount} valid
                  </span>
                  {errorCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                      {errorCount} errors
                    </span>
                  )}
                </div>
              )}
            </div>

            {rows.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {['Full Name', 'Email', 'Role', 'Department', 'Status'].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r, i) => (
                        <tr key={i} className={r._valid ? '' : 'bg-red-50'}>
                          <td className="px-3 py-2 text-gray-700">{r.full_name}</td>
                          <td className="px-3 py-2 text-gray-700">{r.email}</td>
                          <td className="px-3 py-2 text-gray-700">{STAFF_ROLE_LABELS[r.role as StaffRole] ?? r.role}</td>
                          <td className="px-3 py-2 text-gray-500">{r.department || '—'}</td>
                          <td className="px-3 py-2">
                            {r._valid
                              ? <span className="text-green-600 font-medium">✓</span>
                              : <span className="text-red-600">{r._errors.join('; ')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            {importResults ? (
              <div className="space-y-3">
                {importResults.imported > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    Successfully imported {importResults.imported} staff member{importResults.imported !== 1 ? 's' : ''}.
                  </div>
                )}
                {importResults.errors.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm space-y-1">
                    <p className="font-semibold">{importResults.errors.length} row(s) failed:</p>
                    {importResults.errors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-800 mb-2">Ready to import</p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-[#01696f]">{validCount} staff member{validCount !== 1 ? 's' : ''}</span>{' '}
                  will be added to <strong>{school.name_en}</strong>.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  New users will receive a temporary password via notification.
                  Existing users will be linked to this school directly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-4">
          {step > 1 && !importResults && (
            <button
              onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
              disabled={importing}
              className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              ← Back
            </button>
          )}
          {!importResults && (
            step < 3 ? (
              <button
                onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
                disabled={step === 2 && !allValid}
                className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
              >
                {step === 2 ? `Continue with ${validCount} valid row${validCount !== 1 ? 's' : ''} →` : 'Next →'}
              </button>
            ) : (
              <button
                onClick={() => void handleImport()}
                disabled={importing}
                className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
              >
                {importing ? 'Importing…' : `Import ${validCount} staff member${validCount !== 1 ? 's' : ''}`}
              </button>
            )
          )}
          {importResults && (
            <button
              onClick={handleClose}
              className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function SchoolUsersPage() {
  const { school } = useSchoolStore();
  const { isSchoolAdmin } = usePermissions();

  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState('');
  const [importOpen, setImportOpen] = useState(false);

  // Edit state (school admin only)
  const [editing, setEditing]       = useState<UserRow | null>(null);
  const [editRole, setEditRole]     = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState<string | null>(null);

  async function load() {
    if (!school?.id) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchErr } = await supabase
      .from('school_members')
      .select(`
        id, user_id, role, status, joined_at,
        profiles:profiles!school_members_user_id_fkey (
          full_name, email, department
        )
      `)
      .eq('school_id', school.id)
      .order('role')
      .order('joined_at');

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const rows: UserRow[] = (data ?? []).map((m: Record<string, unknown>) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
        | { full_name?: string; email?: string; department?: string }
        | null;
      return {
        id:         m.id         as string,
        user_id:    m.user_id    as string,
        role:       m.role       as string,
        status:     m.status     as string,
        joined_at:  m.joined_at  as string | null,
        full_name:  p?.full_name  ?? null,
        email:      p?.email      ?? '',
        department: p?.department ?? null,
      };
    });

    setUsers(rows);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [school?.id]);

  function openEdit(u: UserRow) {
    setEditing(u);
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditError(null);
  }

  async function handleSave() {
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);

    const { error: smErr } = await supabase
      .from('school_members')
      .update({ role: editRole, status: editStatus })
      .eq('id', editing.id);

    if (smErr) {
      setEditError(smErr.message);
      setEditSaving(false);
      return;
    }

    // Mirror role to profiles
    await supabase.from('profiles').update({ role: editRole }).eq('id', editing.user_id);

    setEditing(null);
    await load();
    setEditSaving(false);
  }

  const filtered = filter
    ? users.filter(u =>
        (u.full_name ?? '').toLowerCase().includes(filter.toLowerCase()) ||
        u.email.toLowerCase().includes(filter.toLowerCase()) ||
        (u.department ?? '').toLowerCase().includes(filter.toLowerCase())
      )
    : users;

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">School Users</h1>
            <p className="text-sm text-gray-500 mt-1">
              {school?.name_en} · {users.length} member{users.length !== 1 ? 's' : ''}
              {!isSchoolAdmin && <span className="ml-2 text-xs text-gray-400">(view-only)</span>}
            </p>
          </div>
          {isSchoolAdmin && (
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
            >
              <UsersIcon className="h-4 w-4" />
              Import Staff
            </button>
          )}
        </div>
      </div>

      <div className="px-8 py-6">
        {/* Search */}
        <div className="mb-5 flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name, email or subject…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#01696f]"
          />
          <span className="text-sm text-gray-400 ml-1">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 px-6 py-4 border-b border-gray-100 last:border-0">
                {[1, 2, 3, 4, 5].map(j => <div key={j} className="h-4 bg-gray-100 rounded flex-1" />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Full Name', 'Email', 'Role', 'Subject Area', 'Status', 'Joined', ...(isSchoolAdmin ? [''] : [])].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{u.full_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{u.email || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{u.department || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[u.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {u.joined_at
                        ? new Date(u.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    {isSchoolAdmin && (
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-xs text-[#01696f] hover:underline font-medium"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={isSchoolAdmin ? 7 : 6} className="px-5 py-10 text-center text-gray-400 text-sm">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff CSV Import dialog */}
      {school && (
        <StaffCsvImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          school={{ id: school.id, name_en: school.name_en }}
          existingEmails={new Set(users.map(u => u.email.toLowerCase()))}
          onSuccess={() => void load()}
        />
      )}

      {/* Edit panel — school admin only */}
      {editing && isSchoolAdmin && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setEditing(null)} />
          <div className="fixed right-0 top-0 h-full w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 shrink-0">
              <h3 className="text-base font-semibold text-gray-900 truncate">
                Edit — {editing.full_name ?? editing.email}
              </h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-3">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{editError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)} className={inputCls}>
                  {EDITABLE_ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={editSaving}
                  className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
                >
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
