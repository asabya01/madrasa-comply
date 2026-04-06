import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Search, Plus, Users, Clock, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../../components/ui/toast';
import type { School } from '../../types';

const GOVERNORATES = [
  'Muscat','Dhofar','Musandam','Al Buraimi','Al Dakhiliyah',
  'Al Batinah North','Al Batinah South','Al Sharqiyah North',
  'Al Sharqiyah South','Al Dhahirah','Al Wusta',
];

const DEFAULT_CHECKLIST = [
  { category: 'documentation', item_text: 'Self-evaluation document fully completed' },
  { category: 'documentation', item_text: 'All domain narratives written' },
  { category: 'documentation', item_text: 'School profile section complete' },
  { category: 'evidence',      item_text: 'Evidence uploaded for at least 80% of indicators' },
  { category: 'evidence',      item_text: 'Student performance data (last 3 years) uploaded' },
  { category: 'documentation', item_text: 'Lesson plans for review week prepared' },
  { category: 'staff',         item_text: 'Staff interview schedule drafted' },
  { category: 'documentation', item_text: 'Parent and student surveys distributed' },
  { category: 'environment',   item_text: 'School facilities inspection walkthrough completed' },
  { category: 'environment',   item_text: 'Safety certificates and licenses up to date' },
  { category: 'documentation', item_text: 'Improvement plan updated and active' },
  { category: 'documentation', item_text: 'Previous audit recommendations addressed (if applicable)' },
];

type View = 'choose' | 'create' | 'join' | 'pending';

export function OnboardingPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [view, setView] = useState<View>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if user already has a pending membership (e.g. they refreshed)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('school_members')
        .select('status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (data) setView('pending');
    })();
  }, []);

  // ── Create school state ───────────────────────────────────────────────────
  const [schoolForm, setSchoolForm] = useState({
    name_en:       '',
    school_type:   'public' as 'public' | 'private',
    governorate:   '',
    wilayat:       '',
    principal_name: '',
  });

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Insert school
      const { data: school, error: schoolErr } = await supabase
        .from('schools')
        .insert({ ...schoolForm })
        .select()
        .single();
      if (schoolErr) throw new Error(`School creation failed: ${schoolErr.message}`);

      // 2. Insert school_member as school_admin
      const { error: memberErr } = await supabase
        .from('school_members')
        .insert({ school_id: school.id, user_id: user.id, role: 'school_admin', status: 'active' });
      if (memberErr) throw new Error(`Membership creation failed: ${memberErr.message}`);

      // 3. Update profile with school_id (legacy field) and role
      await supabase
        .from('profiles')
        .update({ school_id: school.id, role: 'principal' })
        .eq('id', user.id);

      // 4. Seed default audit checklist
      await supabase.from('audit_checklist_items').insert(
        DEFAULT_CHECKLIST.map((item) => ({
          school_id: school.id,
          category:  item.category,
          item_text: item.item_text,
          is_custom: false,
        }))
      );

      showToast('School registered successfully!', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Setup failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Join school state ─────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('schools')
      .select('id, name_en, governorate, school_type')
      .ilike('name_en', `%${q}%`)
      .limit(10);
    setSearchResults((data ?? []) as School[]);
  };

  const handleRequestJoin = async () => {
    if (!selectedSchool) return;
    setError('');
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: memberErr } = await supabase
        .from('school_members')
        .insert({ school_id: selectedSchool.id, user_id: user.id, role: 'teacher', status: 'pending' });
      if (memberErr) throw new Error(memberErr.message);

      showToast('Join request sent — waiting for approval', 'success');
      setView('pending');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-xl border border-[#e2e0db] p-8 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 bg-[#01696f] rounded-lg flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="font-semibold text-[#1a1a1a]">Madrasa Comply</div>
              <div className="text-xs text-[#6b7280]">School Setup</div>
            </div>
          </div>

          {/* ── Choose view ── */}
          {view === 'choose' && (
            <>
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-1">Set up your school</h2>
              <p className="text-sm text-[#6b7280] mb-6">
                Register a new school or join an existing one.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setView('create')}
                  className="flex flex-col items-center gap-3 p-5 border-2 border-[#e2e0db] rounded-xl hover:border-[#01696f] hover:bg-[#f0fafa] transition-colors text-left"
                >
                  <div className="h-10 w-10 bg-[#e6f4f5] rounded-lg flex items-center justify-center">
                    <Plus className="h-5 w-5 text-[#01696f]" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-[#1a1a1a]">Create School</div>
                    <div className="text-xs text-[#6b7280] mt-0.5">Register a new school on the platform</div>
                  </div>
                </button>

                <button
                  onClick={() => setView('join')}
                  className="flex flex-col items-center gap-3 p-5 border-2 border-[#e2e0db] rounded-xl hover:border-[#01696f] hover:bg-[#f0fafa] transition-colors text-left"
                >
                  <div className="h-10 w-10 bg-[#e6f4f5] rounded-lg flex items-center justify-center">
                    <Users className="h-5 w-5 text-[#01696f]" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-[#1a1a1a]">Join School</div>
                    <div className="text-xs text-[#6b7280] mt-0.5">Request access to an existing school</div>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* ── Create school view ── */}
          {view === 'create' && (
            <>
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-1">Register your school</h2>
              <p className="text-sm text-[#6b7280] mb-6">You'll be set as the school admin.</p>

              <form onSubmit={handleCreateSchool} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>School Name (English)</Label>
                  <Input
                    value={schoolForm.name_en}
                    onChange={(e) => setSchoolForm({ ...schoolForm, name_en: e.target.value })}
                    placeholder="Al Salam Primary School"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>School Type</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm"
                    value={schoolForm.school_type}
                    onChange={(e) => setSchoolForm({ ...schoolForm, school_type: e.target.value as 'public' | 'private' })}
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Governorate</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm"
                    value={schoolForm.governorate}
                    onChange={(e) => setSchoolForm({ ...schoolForm, governorate: e.target.value })}
                  >
                    <option value="">Select governorate</option>
                    {GOVERNORATES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Wilayat</Label>
                    <Input
                      value={schoolForm.wilayat}
                      onChange={(e) => setSchoolForm({ ...schoolForm, wilayat: e.target.value })}
                      placeholder="e.g. Seeb"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Principal Name</Label>
                    <Input
                      value={schoolForm.principal_name}
                      onChange={(e) => setSchoolForm({ ...schoolForm, principal_name: e.target.value })}
                      placeholder="Dr. Ahmed Al-Rashdi"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setView('choose')} className="flex-1" disabled={loading}>
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={loading || !schoolForm.name_en}>
                    {loading ? 'Creating…' : 'Create School'}
                  </Button>
                </div>
              </form>
            </>
          )}

          {/* ── Join school view ── */}
          {view === 'join' && (
            <>
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-1">Join a school</h2>
              <p className="text-sm text-[#6b7280] mb-6">Search for your school and request access.</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Search by school name</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
                    <Input
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Type school name…"
                    />
                  </div>
                </div>

                {searchResults.length > 0 && (
                  <div className="border border-[#e2e0db] rounded-lg overflow-hidden divide-y divide-[#e2e0db]">
                    {searchResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSchool(s)}
                        className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                          selectedSchool?.id === s.id
                            ? 'bg-[#e6f4f5] text-[#01696f]'
                            : 'hover:bg-[#f7f6f2]'
                        }`}
                      >
                        <div className="font-medium">{s.name_en}</div>
                        {s.governorate && (
                          <div className="text-xs text-[#6b7280] mt-0.5">{s.governorate} · {s.school_type}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 2 && searchResults.length === 0 && (
                  <p className="text-sm text-[#6b7280] text-center py-3">No schools found matching "{searchQuery}"</p>
                )}

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setView('choose')} className="flex-1" disabled={loading}>
                    Back
                  </Button>
                  <Button
                    onClick={handleRequestJoin}
                    className="flex-1"
                    disabled={loading || !selectedSchool}
                  >
                    {loading ? 'Sending…' : 'Request Access'}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── Pending view ── */}
          {view === 'pending' && (
            <div className="text-center py-4">
              <div className="flex items-center justify-center mb-4">
                <div className="h-14 w-14 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
                  <Clock className="h-7 w-7 text-amber-500" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-2">Request pending</h2>
              <p className="text-sm text-[#6b7280] mb-6 max-w-xs mx-auto">
                Your request to join has been sent. A school admin needs to approve it before you can access the platform.
              </p>
              <div className="flex items-center gap-2 justify-center text-xs text-[#6b7280]">
                <CheckCircle className="h-4 w-4 text-[#01696f]" />
                We'll notify you by email once approved.
              </div>

              <button
                onClick={async () => {
                  // Re-check membership status in case it was approved
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  const { data } = await supabase
                    .from('school_members')
                    .select('status')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .maybeSingle();
                  if (data) {
                    navigate('/dashboard', { replace: true });
                  } else {
                    showToast('Still pending approval', 'error');
                  }
                }}
                className="mt-6 text-xs text-[#01696f] hover:underline"
              >
                Check again
              </button>
            </div>
          )}

          <p className="text-xs text-center text-[#6b7280] mt-6">
            Already registered?{' '}
            <a href="/login" className="text-[#01696f] hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
