import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { School, Profile } from '../types';

type Tab = 'overview' | 'schools' | 'users';

interface PlatformStats {
  total_schools: number;
  total_users: number;
  total_evidence: number;
  total_actions: number;
  recent_evidence: Array<{ id: string; file_name: string; school_name: string; uploaded_at: string }>;
  recent_actions: Array<{ id: string; title: string; school_name: string; created_at: string }>;
}

export default function SuperAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) || 'overview';

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state for creating school / user
  const [showCreateSchool, setShowCreateSchool] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolType, setNewSchoolType] = useState<'public' | 'private'>('public');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  function setTab(tab: Tab) {
    setSearchParams({ tab });
  }

  // ── Load data whenever tab changes ──────────────────────────
  useEffect(() => {
    if (activeTab === 'overview') loadStats();
    else if (activeTab === 'schools') loadSchools();
    else if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'get_stats' },
      });
      if (error) throw error;
      setStats(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }

  async function loadSchools() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSchools(data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load schools');
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, schools(name_en)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function createSchool() {
    if (!newSchoolName.trim()) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('schools').insert({
        name_en: newSchoolName.trim(),
        school_type: newSchoolType,
        subscription_tier: 'trial',
      });
      if (error) throw error;
      setShowCreateSchool(false);
      setNewSchoolName('');
      loadSchools();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleSchoolActive(school: School) {
    try {
      const { error } = await supabase
        .from('schools')
        .update({ is_active: !school.is_active })
        .eq('id', school.id);
      if (error) throw error;
      loadSchools();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createUser() {
    if (!newUserEmail.trim() || !newUserName.trim()) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'create_user', email: newUserEmail.trim(), full_name: newUserName.trim() },
      });
      if (error) throw error;
      setShowCreateUser(false);
      setNewUserEmail('');
      setNewUserName('');
      loadUsers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteUser(userId: string) {
    if (!window.confirm('Delete this user permanently?')) return;
    try {
      const { error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'delete_user', user_id: userId },
      });
      if (error) throw error;
      loadUsers();
    } catch (e: any) {
      setError(e.message);
    }
  }

  // ── Tab button component ─────────────────────────────────────
  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        activeTab === id
          ? 'bg-[#01696f] text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Super Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">Platform-wide management for Madrasa Comply</p>
      </div>

      {/* Tab bar */}
      <div className="px-8 pt-6">
        <div className="flex gap-2 bg-white border border-gray-200 rounded-xl p-1.5 w-fit shadow-sm">
          <TabBtn id="overview" label="Overview" />
          <TabBtn id="schools" label="Schools" />
          <TabBtn id="users" label="Users" />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-8 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="px-8 py-6">

        {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div>
            {loading ? (
              <SkeletonGrid />
            ) : stats ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                  <StatCard label="Total Schools" value={stats.total_schools} icon="🏫" />
                  <StatCard label="Total Users" value={stats.total_users} icon="👥" />
                  <StatCard label="Evidence Files" value={stats.total_evidence} icon="📁" />
                  <StatCard label="Action Items" value={stats.total_actions} icon="✅" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-800 mb-4">Recent Evidence Uploads</h3>
                    {stats.recent_evidence?.length ? (
                      <ul className="space-y-3">
                        {stats.recent_evidence.map(f => (
                          <li key={f.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 font-medium truncate max-w-[200px]">{f.file_name}</span>
                            <span className="text-gray-400 text-xs">{f.school_name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-400 text-sm">No evidence uploaded yet.</p>
                    )}
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-800 mb-4">Recent Action Items</h3>
                    {stats.recent_actions?.length ? (
                      <ul className="space-y-3">
                        {stats.recent_actions.map(a => (
                          <li key={a.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 font-medium truncate max-w-[200px]">{a.title}</span>
                            <span className="text-gray-400 text-xs">{a.school_name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-400 text-sm">No action items yet.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-400">No data available.</p>
            )}
          </div>
        )}

        {/* ── SCHOOLS TAB ──────────────────────────────────────── */}
        {activeTab === 'schools' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">
                All Schools ({schools.length})
              </h2>
              <button
                onClick={() => setShowCreateSchool(true)}
                className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
              >
                + Create School
              </button>
            </div>

            {loading ? (
              <SkeletonTable />
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">School</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Type</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Governorate</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Tier</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {schools.map(school => (
                      <tr key={school.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{school.name_en}</td>
                        <td className="px-5 py-3 text-gray-600 capitalize">{school.school_type}</td>
                        <td className="px-5 py-3 text-gray-600">{school.governorate || '—'}</td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium capitalize">
                            {school.subscription_tier}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            school.is_active
                              ? 'bg-green-50 text-green-700'
                              : 'bg-red-50 text-red-700'
                          }`}>
                            {school.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => toggleSchoolActive(school)}
                            className="text-xs text-[#01696f] hover:underline"
                          >
                            {school.is_active ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!schools.length && (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                          No schools yet. Create one above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Create School Modal */}
            {showCreateSchool && (
              <Modal title="Create New School" onClose={() => setShowCreateSchool(false)}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">School Name (English)</label>
                    <input
                      type="text"
                      value={newSchoolName}
                      onChange={e => setNewSchoolName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                      placeholder="e.g. Al Noor International School"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">School Type</label>
                    <select
                      value={newSchoolType}
                      onChange={e => setNewSchoolType(e.target.value as 'public' | 'private')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={createSchool}
                      disabled={actionLoading}
                      className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
                    >
                      {actionLoading ? 'Creating...' : 'Create School'}
                    </button>
                    <button
                      onClick={() => setShowCreateSchool(false)}
                      className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ── USERS TAB ────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">
                All Users ({users.length})
              </h2>
              <button
                onClick={() => setShowCreateUser(true)}
                className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
              >
                + Create User
              </button>
            </div>

            {loading ? (
              <SkeletonTable />
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Name</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Role</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">School</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Joined</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user: any) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{user.full_name || '—'}</td>
                        <td className="px-5 py-3 text-gray-600 capitalize">{user.role?.replace('_', ' ')}</td>
                        <td className="px-5 py-3 text-gray-600">{user.schools?.name_en || '—'}</td>
                        <td className="px-5 py-3 text-gray-400 text-xs">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => deleteUser(user.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!users.length && (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                          No users yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Create User Modal */}
            {showCreateUser && (
              <Modal title="Create New User" onClose={() => setShowCreateUser(false)}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={newUserName}
                      onChange={e => setNewUserName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                      placeholder="e.g. Sarah Al-Rashidi"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={e => setNewUserEmail(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                      placeholder="user@school.edu.om"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={createUser}
                      disabled={actionLoading}
                      className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50"
                    >
                      {actionLoading ? 'Creating...' : 'Create User'}
                    </button>
                    <button
                      onClick={() => setShowCreateUser(false)}
                      className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Small helper components ──────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value?.toLocaleString() ?? '—'}</p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
          <div className="h-8 bg-gray-200 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-4 border-b border-gray-100">
          <div className="h-4 bg-gray-200 rounded flex-1" />
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-4 bg-gray-200 rounded w-20" />
        </div>
      ))}
    </div>
  );
}
