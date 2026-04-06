import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Building2, Activity, Key,
  Plus, Trash2, Pencil, RotateCcw, ShieldAlert, CheckCircle, XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';
import { formatDate } from '../lib/utils';
import type { Profile, School } from '../types';

// ── Admin API helper ──────────────────────────────────────────────────────────
async function callAdminAction(action: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ProfileWithSchool = Profile & { email?: string; schools?: { name: string } | null };
type SchoolWithCount  = School & { user_count?: number };

const ROLE_OPTIONS = ['admin', 'principal', 'vice_principal', 'quality_coordinator', 'teacher'] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', super_admin: 'Super Admin', principal: 'Principal',
  vice_principal: 'Vice Principal', quality_coordinator: 'Quality Coordinator',
  teacher: 'Teacher',
};

// ── Guard ─────────────────────────────────────────────────────────────────────
export function AdminPage() {
  const { profile } = useSchoolStore();
  const navigate = useNavigate();

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-[#6b7280]">Loading…</p>
      </div>
    );
  }

  if (!profile.is_super_admin) {
    navigate('/dashboard');
    return null;
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-[#01696f]" />
        <h1 className="text-xl font-semibold text-[#1a1a1a] font-sans">Admin Panel</h1>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-1.5 inline" />Users</TabsTrigger>
          <TabsTrigger value="schools"><Building2 className="h-4 w-4 mr-1.5 inline" />Schools</TabsTrigger>
          <TabsTrigger value="monitoring"><Activity className="h-4 w-4 mr-1.5 inline" />Monitoring</TabsTrigger>
          <TabsTrigger value="secrets"><Key className="h-4 w-4 mr-1.5 inline" />Secrets</TabsTrigger>
        </TabsList>

        <TabsContent value="users"  className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="schools" className="mt-4"><SchoolsTab /></TabsContent>
        <TabsContent value="monitoring" className="mt-4"><MonitoringTab /></TabsContent>
        <TabsContent value="secrets" className="mt-4"><SecretsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// USERS TAB
// ═════════════════════════════════════════════════════════════════════════════
function UsersTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [addOpen, setAddOpen]     = useState(false);
  const [editUser, setEditUser]   = useState<ProfileWithSchool | null>(null);
  const [deleteUser, setDeleteUser] = useState<ProfileWithSchool | null>(null);
  const [newUser, setNewUser]     = useState({ email: '', full_name: '', role: 'principal' as string, school_id: '' });
  const [editForm, setEditForm]   = useState({ full_name: '', role: '', school_id: '' });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, schools(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ProfileWithSchool[];
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ['admin-schools-list'],
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('id, name').order('name');
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: () => callAdminAction('create_user', newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setAddOpen(false);
      setNewUser({ email: '', full_name: '', role: 'principal', school_id: '' });
      showToast('User created — send them a password reset link', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editUser) return;
      const { error } = await supabase.from('profiles').update({
        full_name: editForm.full_name,
        role: editForm.role,
        school_id: editForm.school_id || null,
      }).eq('id', editUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditUser(null);
      showToast('User updated', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => callAdminAction('delete_user', { user_id: deleteUser?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDeleteUser(null);
      showToast('User deleted', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://madrasa-comply-asabya01s-projects.vercel.app/reset-password',
    });
    if (error) showToast(error.message, 'error');
    else showToast(`Reset link sent to ${email}`, 'success');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-sans">All Users ({users.length})</CardTitle>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#e2e0db] bg-gray-50">
                  <tr>
                    {['Name', 'Email', 'Role', 'School', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e0db]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-[#1a1a1a]">{u.full_name || '—'}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{u.email || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${u.is_super_admin ? 'bg-[#a12c7b]/10 text-[#a12c7b]' : 'bg-gray-100 text-[#6b7280]'}`}>
                          {u.is_super_admin ? 'Super Admin' : (ROLE_LABELS[u.role ?? ''] || u.role || '—')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6b7280]">{(u.schools as { name: string } | null)?.name || '—'}</td>
                      <td className="px-4 py-3 text-[#6b7280] text-xs">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setEditUser(u); setEditForm({ full_name: u.full_name || '', role: u.role ?? '', school_id: u.school_id || '' }); }}
                            className="p-1 text-[#6b7280] hover:text-[#01696f]" title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {u.email && (
                            <button onClick={() => resetPassword(u.email!)} className="p-1 text-[#6b7280] hover:text-amber-500" title="Send password reset">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => setDeleteUser(u)} className="p-1 text-[#6b7280] hover:text-red-500" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Email*" type="email" value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <Input placeholder="Full name" value={newUser.full_name}
              onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
            <div>
              <label className="text-xs text-[#6b7280]">Role</label>
              <select className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm mt-1"
                value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#6b7280]">School</label>
              <select className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm mt-1"
                value={newUser.school_id} onChange={(e) => setNewUser({ ...newUser, school_id: e.target.value })}>
                <option value="">No school (admin)</option>
                {schools.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-[#6b7280]">The user will need to set a password via "Reset Password" after creation.</p>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setAddOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={() => addMutation.mutate()} disabled={!newUser.email || addMutation.isPending} className="flex-1">
                {addMutation.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(v) => { if (!v) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User — {editUser?.email || editUser?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Full name" value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            <div>
              <label className="text-xs text-[#6b7280]">Role</label>
              <select className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm mt-1"
                value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#6b7280]">School</label>
              <select className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm mt-1"
                value={editForm.school_id} onChange={(e) => setEditForm({ ...editForm, school_id: e.target.value })}>
                <option value="">No school</option>
                {schools.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setEditUser(null)} className="flex-1">Cancel</Button>
              <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="flex-1">
                {editMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteUser} onOpenChange={(v) => { if (!v) setDeleteUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete User</DialogTitle></DialogHeader>
          <p className="text-sm text-[#6b7280]">
            Permanently delete <strong className="text-[#1a1a1a]">{deleteUser?.full_name || deleteUser?.email}</strong>?
            This cannot be undone.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteUser(null)} className="flex-1">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="flex-1">
              {deleteMutation.isPending ? 'Deleting…' : 'Delete User'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SCHOOLS TAB
// ═════════════════════════════════════════════════════════════════════════════
function SchoolsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [addOpen, setAddOpen]       = useState(false);
  const [editSchool, setEditSchool] = useState<SchoolWithCount | null>(null);
  const [deleteSchool, setDeleteSchool] = useState<SchoolWithCount | null>(null);
  const [newName, setNewName]       = useState('');
  const [editName, setEditName]     = useState('');

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ['admin-schools'],
    queryFn: async () => {
      const { data: schoolList, error } = await supabase.from('schools').select('*').order('name');
      if (error) throw error;
      // Count active members per school from school_members (not legacy profiles.school_id)
      const { data: members } = await supabase
        .from('school_members')
        .select('school_id')
        .eq('status', 'active');
      const counts: Record<string, number> = {};
      (members || []).forEach((m) => {
        counts[m.school_id] = (counts[m.school_id] || 0) + 1;
      });
      return (schoolList || []).map((s) => ({ ...s, user_count: counts[s.id] || 0 })) as SchoolWithCount[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('schools').insert({ name: newName.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-schools'] });
      setAddOpen(false);
      setNewName('');
      showToast('School added', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editSchool) return;
      const { error } = await supabase.from('schools').update({ name: editName.trim() }).eq('id', editSchool.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-schools'] });
      setEditSchool(null);
      showToast('School updated', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteSchool) return;
      const { error } = await supabase.from('schools').delete().eq('id', deleteSchool.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-schools'] });
      setDeleteSchool(null);
      showToast('School deleted', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-sans">All Schools ({schools.length})</CardTitle>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add School
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-[#e2e0db] bg-gray-50">
                <tr>
                  {['School Name', 'Type', 'Governorate', 'Users', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e0db]">
                {schools.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#1a1a1a]">{s.name}</td>
                    <td className="px-4 py-3 text-[#6b7280] capitalize">{s.school_type}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{s.governorate || '—'}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{s.user_count}</td>
                    <td className="px-4 py-3 text-xs text-[#6b7280]">{formatDate(s.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setEditSchool(s); setEditName(s.name ?? ''); }}
                          className="p-1 text-[#6b7280] hover:text-[#01696f]" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteSchool(s)}
                          className="p-1 text-[#6b7280] hover:text-red-500" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {schools.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">No schools found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add School */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New School</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="School name (English)*" value={newName}
              onChange={(e) => setNewName(e.target.value)} autoFocus />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setAddOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={() => addMutation.mutate()} disabled={!newName.trim() || addMutation.isPending} className="flex-1">
                {addMutation.isPending ? 'Adding…' : 'Add School'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit School */}
      <Dialog open={!!editSchool} onOpenChange={(v) => { if (!v) setEditSchool(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit School</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setEditSchool(null)} className="flex-1">Cancel</Button>
              <Button onClick={() => editMutation.mutate()} disabled={!editName.trim() || editMutation.isPending} className="flex-1">
                {editMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete School */}
      <Dialog open={!!deleteSchool} onOpenChange={(v) => { if (!v) setDeleteSchool(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete School</DialogTitle></DialogHeader>
          <p className="text-sm text-[#6b7280]">
            Permanently delete <strong className="text-[#1a1a1a]">{deleteSchool?.name}</strong> and all its data?
            This cannot be undone.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteSchool(null)} className="flex-1">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="flex-1">
              {deleteMutation.isPending ? 'Deleting…' : 'Delete School'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MONITORING TAB
// ═════════════════════════════════════════════════════════════════════════════
function MonitoringTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => callAdminAction('get_stats'),
    staleTime: 1000 * 60 * 2,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-lg border animate-pulse" />)}
      </div>
    );
  }

  const statCards = [
    { label: 'Total Schools',  value: stats?.schools ?? '—',  color: 'text-[#01696f]' },
    { label: 'Total Users',    value: stats?.users   ?? '—',  color: 'text-[#006494]' },
    { label: 'Evidence Files', value: stats?.evidence ?? '—', color: 'text-[#437a22]' },
    { label: 'Action Items',   value: stats?.actions  ?? '—', color: 'text-[#d19900]' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-xs text-[#6b7280] mb-1">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold font-sans">Recent Evidence Uploads</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {(stats?.recentEvidence || []).length === 0 ? (
              <p className="text-sm text-[#6b7280]">No uploads yet</p>
            ) : (
              <div className="space-y-2">
                {(stats?.recentEvidence || []).map((f: Record<string, unknown>, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-[#e2e0db] last:border-0">
                    <div>
                      <p className="text-xs font-medium text-[#1a1a1a]">{f.file_name as string}</p>
                      <p className="text-xs text-[#6b7280]">{(f.schools as { name: string } | null)?.name || '—'}</p>
                    </div>
                    <p className="text-xs text-[#6b7280]">{formatDate(f.uploaded_at as string)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold font-sans">Recent Action Items</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {(stats?.recentActions || []).length === 0 ? (
              <p className="text-sm text-[#6b7280]">No actions yet</p>
            ) : (
              <div className="space-y-2">
                {(stats?.recentActions || []).map((a: Record<string, unknown>, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-[#e2e0db] last:border-0">
                    <div>
                      <p className="text-xs font-medium text-[#1a1a1a]">{a.title as string}</p>
                      <p className="text-xs text-[#6b7280]">{(a.schools as { name: string } | null)?.name || '—'}</p>
                    </div>
                    <span className="text-xs bg-gray-100 text-[#6b7280] px-1.5 py-0.5 rounded capitalize">
                      {(a.status as string)?.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECRETS TAB
// ═════════════════════════════════════════════════════════════════════════════
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const SECRETS = [
  {
    name: 'VITE_SUPABASE_URL',
    description: 'Supabase project URL (Vercel env var)',
    configured: !!supabaseUrl && supabaseUrl !== 'your-supabase-url-here',
    where: 'Vercel → Project → Settings → Environment Variables',
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    description: 'Supabase anon/public key (Vercel env var)',
    configured: !!supabaseAnon && supabaseAnon !== 'your-anon-key-here',
    where: 'Vercel → Project → Settings → Environment Variables',
  },
  {
    name: 'ANTHROPIC_API_KEY',
    description: 'Anthropic Claude API key — used by ai-feedback Edge Function',
    configured: null, // server-side only, cannot verify from client
    where: 'supabase secrets set ANTHROPIC_API_KEY=sk-ant-...',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    description: 'Supabase service role key — used by admin-actions Edge Function (auto-set by Supabase)',
    configured: null,
    where: 'Automatically available in Edge Functions — no action needed',
  },
  {
    name: 'SUPABASE_ANON_KEY',
    description: 'Supabase anon key — available in Edge Functions (auto-set by Supabase)',
    configured: null,
    where: 'Automatically available in Edge Functions — no action needed',
  },
];

function SecretsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans">Environment Variables & Secrets</CardTitle>
        <p className="text-sm text-[#6b7280]">
          Server-side secrets cannot be verified from the browser. Client-side Vercel env vars are checked below.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {SECRETS.map((s) => (
          <div key={s.name} className="flex items-start gap-3 p-3 rounded-lg border border-[#e2e0db]">
            <div className="mt-0.5 shrink-0">
              {s.configured === true  && <CheckCircle className="h-4 w-4 text-[#437a22]" />}
              {s.configured === false && <XCircle className="h-4 w-4 text-red-500" />}
              {s.configured === null  && <div className="h-4 w-4 rounded-full border-2 border-[#d19900]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-mono font-semibold text-[#1a1a1a] bg-gray-100 px-1.5 py-0.5 rounded">
                  {s.name}
                </code>
                {s.configured === true  && <span className="text-xs text-[#437a22] font-medium">Configured</span>}
                {s.configured === false && <span className="text-xs text-red-500 font-medium">Missing — set this!</span>}
                {s.configured === null  && <span className="text-xs text-[#d19900] font-medium">Cannot verify (server-side)</span>}
              </div>
              <p className="text-xs text-[#6b7280] mt-0.5">{s.description}</p>
              <p className="text-xs text-[#01696f] mt-0.5 font-mono">{s.where}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
