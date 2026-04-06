import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Users, FileText, CheckSquare,
  Search, Plus, Eye, Trash2, RefreshCw,
  ShieldCheck, ShieldOff, TrendingUp, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';
import { formatDate } from '../lib/utils';
import type { School } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SchoolRow extends School {
  member_count: number;
}

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  is_super_admin: boolean;
  created_at: string;
  school_count: number;
}

interface PlatformStats {
  schoolCount: number;
  activeCount: number;
  trialCount: number;
  userCount: number;
  evidenceCount: number;
  taskCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  trial:   'bg-amber-100 text-amber-800',
  basic:   'bg-blue-100 text-blue-800',
  premium: 'bg-purple-100 text-purple-800',
  starter: 'bg-gray-100 text-gray-700',
  school:  'bg-green-100 text-green-800',
};

const STATUS_COLORS: Record<string, string> = {
  trial:     'bg-amber-100 text-amber-800',
  active:    'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

// ── Platform Stats ─────────────────────────────────────────────────────────────

function useStats() {
  return useQuery<PlatformStats>({
    queryKey: ['super-admin-stats'],
    queryFn: async () => {
      const [
        { count: schoolCount },
        { count: userCount },
        { count: evidenceCount },
        { count: taskCount },
        { data: schoolMeta },
      ] = await Promise.all([
        supabase.from('schools').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('evidence_files').select('*', { count: 'exact', head: true }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).neq('status', 'completed'),
        supabase.from('schools').select('subscription_status, is_active'),
      ]);
      const activeCount = (schoolMeta ?? []).filter((s) => s.is_active && s.subscription_status === 'active').length;
      const trialCount  = (schoolMeta ?? []).filter((s) => s.subscription_status === 'trial').length;
      return {
        schoolCount:   schoolCount ?? 0,
        activeCount,
        trialCount,
        userCount:     userCount   ?? 0,
        evidenceCount: evidenceCount ?? 0,
        taskCount:     taskCount   ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

// ── Schools query ─────────────────────────────────────────────────────────────

function useSchools(search: string, tierFilter: string, statusFilter: string) {
  return useQuery<SchoolRow[]>({
    queryKey: ['super-admin-schools', search, tierFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('schools')
        .select('*')
        .order('created_at', { ascending: false });
      if (search)       q = q.ilike('name_en', `%${search}%`);
      if (tierFilter)   q = q.eq('subscription_tier', tierFilter);
      if (statusFilter) q = q.eq('subscription_status', statusFilter);

      const { data: schools, error } = await q;
      if (error) throw error;

      const { data: members } = await supabase
        .from('school_members')
        .select('school_id')
        .eq('status', 'active');

      const counts: Record<string, number> = {};
      (members ?? []).forEach((m) => { counts[m.school_id] = (counts[m.school_id] ?? 0) + 1; });

      return (schools ?? []).map((s) => ({ ...s, member_count: counts[s.id] ?? 0 })) as SchoolRow[];
    },
    staleTime: 10_000,
  });
}

// ── Users query ───────────────────────────────────────────────────────────────

function useUsers(search: string) {
  return useQuery<UserRow[]>({
    queryKey: ['super-admin-users', search],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, full_name, email, is_super_admin, created_at')
        .order('created_at', { ascending: false });
      if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

      const { data: users, error } = await q;
      if (error) throw error;

      const { data: memberships } = await supabase
        .from('school_members')
        .select('user_id')
        .eq('status', 'active');

      const counts: Record<string, number> = {};
      (memberships ?? []).forEach((m) => { counts[m.user_id] = (counts[m.user_id] ?? 0) + 1; });

      return (users ?? []).map((u) => ({
        ...u,
        full_name:    u.full_name ?? '',
        email:        u.email ?? '',
        is_super_admin: u.is_super_admin ?? false,
        school_count: counts[u.id] ?? 0,
      })) as UserRow[];
    },
    staleTime: 10_000,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SuperAdminPage() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { showToast } = useToast();
  const { setImpersonating } = useSchoolStore();

  // ── Schools tab state ──────────────────────────────────────────────────────
  const [schoolSearch, setSchoolSearch]   = useState('');
  const [tierFilter, setTierFilter]       = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [addSchoolOpen, setAddSchoolOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolType, setNewSchoolType] = useState<'public' | 'private'>('public');
  const [deleteConfirm, setDeleteConfirm] = useState<SchoolRow | null>(null);

  // ── Users tab state ────────────────────────────────────────────────────────
  const [userSearch, setUserSearch] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: stats } = useStats();
  const { data: schools = [], isLoading: schoolsLoading } = useSchools(schoolSearch, tierFilter, statusFilter);
  const { data: users  = [], isLoading: usersLoading }  = useUsers(userSearch);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addSchoolMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('schools').insert({
        name_en:           newSchoolName.trim(),
        school_type:       newSchoolType,
        subscription_tier: 'trial',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-schools'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] });
      setAddSchoolOpen(false);
      setNewSchoolName('');
      showToast('School created', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const changeTierMutation = useMutation({
    mutationFn: async ({ id, tier }: { id: string; tier: string }) => {
      const { error } = await supabase.from('schools').update({ subscription_tier: tier }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-schools'] });
      showToast('Tier updated', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const toggleSuspendMutation = useMutation({
    mutationFn: async ({ id, suspend }: { id: string; suspend: boolean }) => {
      const { error } = await supabase.from('schools').update({
        is_active:            !suspend,
        subscription_status:  suspend ? 'suspended' : 'active',
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { suspend }) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-schools'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] });
      showToast(suspend ? 'School suspended' : 'School reactivated', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteSchoolMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('schools').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-schools'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] });
      setDeleteConfirm(null);
      showToast('School deleted', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const toggleSuperAdminMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from('profiles').update({ is_super_admin: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { value }) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
      showToast(value ? 'Super admin granted' : 'Super admin revoked', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://madrasa-comply-asabya01s-projects.vercel.app/reset-password',
      });
      if (error) throw error;
    },
    onSuccess: () => showToast('Reset email sent', 'success'),
    onError:   (e: Error) => showToast(e.message, 'error'),
  });

  // ── Impersonation ──────────────────────────────────────────────────────────

  function handleImpersonate(school: SchoolRow) {
    setImpersonating(school as School);
    navigate('/dashboard');
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-purple-600 rounded-lg flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a] font-sans">Super Admin</h1>
          <p className="text-xs text-[#6b7280]">Platform management — full access</p>
        </div>
      </div>

      {/* ── Platform Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Building2 className="h-5 w-5 text-blue-600" />}
          label="Total Schools"
          value={stats?.schoolCount ?? '—'}
          sub={stats ? `${stats.activeCount} active · ${stats.trialCount} trial` : undefined}
          bg="bg-blue-50"
        />
        <StatCard
          icon={<Users className="h-5 w-5 text-green-600" />}
          label="Total Users"
          value={stats?.userCount ?? '—'}
          bg="bg-green-50"
        />
        <StatCard
          icon={<FileText className="h-5 w-5 text-orange-600" />}
          label="Evidence Files"
          value={stats?.evidenceCount ?? '—'}
          bg="bg-orange-50"
        />
        <StatCard
          icon={<CheckSquare className="h-5 w-5 text-purple-600" />}
          label="Active Tasks"
          value={stats?.taskCount ?? '—'}
          bg="bg-purple-50"
        />
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="schools">
        <TabsList>
          <TabsTrigger value="schools">Schools</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        {/* ── Schools tab ── */}
        <TabsContent value="schools" className="mt-4 space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
              <Input
                className="pl-9"
                placeholder="Search schools…"
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-md border border-[#e2e0db] bg-white px-3 text-sm"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <option value="">All tiers</option>
              <option value="trial">Trial</option>
              <option value="basic">Basic</option>
              <option value="premium">Premium</option>
              <option value="starter">Starter</option>
              <option value="school">School</option>
            </select>
            <select
              className="h-9 rounded-md border border-[#e2e0db] bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <Button size="sm" onClick={() => setAddSchoolOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add School
            </Button>
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e0db] bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-[#6b7280]">School Name</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Tier</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Status</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Members</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Created</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0efeb]">
                  {schoolsLoading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">Loading…</td></tr>
                  ) : schools.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">No schools found</td></tr>
                  ) : schools.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-[#1a1a1a]">
                        {s.name_en}
                        {!s.is_active && (
                          <span className="ml-2 text-xs text-red-500 font-normal">(suspended)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className={`text-xs px-2 py-0.5 rounded font-medium border-0 cursor-pointer ${TIER_COLORS[s.subscription_tier] ?? 'bg-gray-100'}`}
                          value={s.subscription_tier}
                          onChange={(e) => changeTierMutation.mutate({ id: s.id, tier: e.target.value })}
                        >
                          {['trial','basic','premium','starter','school'].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[s.subscription_status ?? 'trial'] ?? ''}`}>
                          {s.subscription_status ?? 'trial'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6b7280]">{s.member_count}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{formatDate(s.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleImpersonate(s)}
                            title="View as this school"
                            className="p-1.5 text-[#6b7280] hover:text-[#01696f] hover:bg-[#e6f4f5] rounded transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => toggleSuspendMutation.mutate({ id: s.id, suspend: s.is_active })}
                            title={s.is_active ? 'Suspend' : 'Reactivate'}
                            className={`p-1.5 rounded transition-colors ${
                              s.is_active
                                ? 'text-[#6b7280] hover:text-orange-600 hover:bg-orange-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                          >
                            {s.is_active ? <AlertCircle className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(s)}
                            title="Delete school"
                            className="p-1.5 text-[#6b7280] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Users tab ── */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
            <Input
              className="pl-9"
              placeholder="Search by name or email…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e0db] bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Name</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Email</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Schools</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Super Admin</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Created</th>
                    <th className="px-4 py-3 font-medium text-[#6b7280]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0efeb]">
                  {usersLoading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">Loading…</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">No users found</td></tr>
                  ) : users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-[#1a1a1a]">{u.full_name || '—'}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{u.email || '—'}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{u.school_count}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSuperAdminMutation.mutate({ id: u.id, value: !u.is_super_admin })}
                          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded font-medium transition-colors ${
                            u.is_super_admin
                              ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {u.is_super_admin
                            ? <><ShieldCheck className="h-3 w-3" /> Super Admin</>
                            : <><ShieldOff  className="h-3 w-3" /> Regular</>
                          }
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[#6b7280]">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        {u.email && (
                          <button
                            onClick={() => resetPasswordMutation.mutate(u.email!)}
                            title="Send password reset email"
                            className="flex items-center gap-1 text-xs text-[#6b7280] hover:text-[#01696f] transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reset
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add School dialog ── */}
      <Dialog open={addSchoolOpen} onOpenChange={setAddSchoolOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add School</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>School Name (English)</Label>
              <Input
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                placeholder="Al Salam Primary School"
              />
            </div>
            <div className="space-y-1.5">
              <Label>School Type</Label>
              <select
                className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 text-sm"
                value={newSchoolType}
                onChange={(e) => setNewSchoolType(e.target.value as 'public' | 'private')}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAddSchoolOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!newSchoolName.trim() || addSchoolMutation.isPending}
                onClick={() => addSchoolMutation.mutate()}
              >
                {addSchoolMutation.isPending ? 'Creating…' : 'Create School'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete School</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#6b7280] py-2">
            Permanently delete <strong>{deleteConfirm?.name_en}</strong> and all its data?
            This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteSchoolMutation.isPending}
              onClick={() => deleteConfirm && deleteSchoolMutation.mutate(deleteConfirm.id)}
            >
              {deleteSchoolMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#6b7280] mb-1">{label}</p>
            <p className="text-2xl font-bold text-[#1a1a1a]">{value}</p>
            {sub && <p className="text-xs text-[#6b7280] mt-0.5">{sub}</p>}
          </div>
          <div className={`h-9 w-9 ${bg} rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
