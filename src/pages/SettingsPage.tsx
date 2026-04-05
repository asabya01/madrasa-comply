import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';

const GOVERNORATES = [
  'Muscat','Dhofar','Musandam','Al Buraimi','Al Dakhiliyah',
  'Al Batinah North','Al Batinah South','Al Sharqiyah North',
  'Al Sharqiyah South','Al Dhahirah','Al Wusta',
];

export function SettingsPage() {
  const { school, setSchool, academicYear, setAcademicYear } = useSchoolStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

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
          <TabsTrigger value="profile">School Profile</TabsTrigger>
          <TabsTrigger value="year">Academic Year</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-sans">School Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">School Name (English)*</label>
                <Input
                  defaultValue={school.name_en}
                  id="name_en"
                  onBlur={(e) => updateSchool.mutate({ name_en: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">School Name (Arabic)</label>
                <Input
                  defaultValue={school.name_ar || ''}
                  onBlur={(e) => updateSchool.mutate({ name_ar: e.target.value })}
                  dir="rtl"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">School Type</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm"
                    defaultValue={school.school_type}
                    onChange={(e) => updateSchool.mutate({ school_type: e.target.value })}
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Governorate</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm"
                    defaultValue={school.governorate || ''}
                    onChange={(e) => updateSchool.mutate({ governorate: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Wilayat</label>
                  <Input defaultValue={school.wilayat || ''} onBlur={(e) => updateSchool.mutate({ wilayat: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Principal Name</label>
                  <Input defaultValue={school.principal_name || ''} onBlur={(e) => updateSchool.mutate({ principal_name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Male Students</label>
                  <Input type="number" defaultValue={school.total_students_male} onBlur={(e) => updateSchool.mutate({ total_students_male: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Female Students</label>
                  <Input type="number" defaultValue={school.total_students_female} onBlur={(e) => updateSchool.mutate({ total_students_female: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Teachers</label>
                  <Input type="number" defaultValue={school.total_teachers} onBlur={(e) => updateSchool.mutate({ total_teachers: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
