import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';

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

// ─── Page ─────────────────────────────────────────────────────

export default function SchoolUsersPage() {
  const { school } = useSchoolStore();
  const { isSchoolAdmin } = usePermissions();

  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState('');

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
        <h1 className="text-2xl font-semibold text-gray-900">School Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          {school?.name_en} · {users.length} member{users.length !== 1 ? 's' : ''}
          {!isSchoolAdmin && <span className="ml-2 text-xs text-gray-400">(view-only)</span>}
        </p>
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
