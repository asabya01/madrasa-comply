import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';


const ROLE_LABELS: Record<string, string> = {
  school_admin:        'School Admin',
  principal:           'Principal',
  vice_principal:      'Vice Principal',
  senior_management:   'Senior Management',
  head_of_department:  'Head of Department',
  quality_coordinator: 'Quality Coordinator',
  teacher:             'Teacher',
  auditor:             'Auditor',
};

export function SettingsPage() {
  const { school, setSchool, profile, setProfile, academicYear, setAcademicYear, userRole } = useSchoolStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name || '');

  const updateSchool = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!school) return;
      const { data, error } = await supabase.from('schools').update(updates).eq('id', school.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data) setSchool(data);
      queryClient.invalidateQueries({ queryKey: ['school'] });
      showToast('Settings saved', 'success');
    },
    onError: () => showToast('Failed to save settings', 'error'),
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: { full_name: string }) => {
      if (!profile) return;
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data) setProfile(data);
      showToast('Profile saved', 'success');
    },
    onError: (error: Error) => showToast(`Failed to save profile: ${error.message}`, 'error'),
  });

  if (!school) {
    return (
      <div className="max-w-2xl space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-lg border border-[#e2e0db] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">My Profile</TabsTrigger>
          <TabsTrigger value="school">School Profile</TabsTrigger>
          <TabsTrigger value="year">Academic Year</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        {/* ── My Profile ── */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-sans">My Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">Full Name</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">Role</label>
                <div className="flex h-9 items-center rounded-md border border-[#e2e0db] bg-gray-50 px-3 text-sm text-[#6b7280]">
                  {ROLE_LABELS[userRole || ''] || userRole || '—'}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">School</label>
                <div className="flex h-9 items-center rounded-md border border-[#e2e0db] bg-gray-50 px-3 text-sm text-[#6b7280]">
                  {school.name}
                  <button
                    className="ml-auto text-xs text-[#01696f] hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      (document.querySelector('[data-value="school"]') as HTMLButtonElement)?.click();
                    }}
                  >
                    Edit school →
                  </button>
                </div>
              </div>
              <Button
                onClick={() => updateProfile.mutate({ full_name: fullName })}
                disabled={updateProfile.isPending || !fullName.trim()}
              >
                {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── School Profile ── */}
        <TabsContent value="school" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-sans">School Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">School Name*</label>
                <Input
                  defaultValue={school.name}
                  id="name"
                  onBlur={(e) => updateSchool.mutate({ name: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Academic Year ── */}
        <TabsContent value="year" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-sans">Academic Year</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[#6b7280]">Switch the active academic year to view or enter historical data.</p>
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">Active Academic Year</label>
                <select
                  className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm max-w-xs"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                >
                  <option value="2024-2025">2024–2025</option>
                  <option value="2025-2026">2025–2026</option>
                  <option value="2023-2024">2023–2024</option>
                  <option value="2022-2023">2022–2023</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Account ── */}
        <TabsContent value="account" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-sans">Account</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[#6b7280]">Manage your account settings and password.</p>
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">New Password</label>
                <div className="flex gap-2">
                  <Input type="password" id="new-pass" placeholder="Enter new password" className="max-w-xs" />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const input = document.getElementById('new-pass') as HTMLInputElement;
                      if (input.value.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
                      const { error } = await supabase.auth.updateUser({ password: input.value });
                      if (error) showToast(error.message, 'error');
                      else { showToast('Password updated', 'success'); input.value = ''; }
                    }}
                  >
                    Update
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
