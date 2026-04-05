import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const GOVERNORATES = [
  'Muscat','Dhofar','Musandam','Al Buraimi','Al Dakhiliyah',
  'Al Batinah North','Al Batinah South','Al Sharqiyah North',
  'Al Sharqiyah South','Al Dhahirah','Al Wusta',
];

const DEFAULT_CHECKLIST = [
  { category: 'documentation', item_text: 'Self-evaluation document fully completed' },
  { category: 'documentation', item_text: 'All domain narratives written' },
  { category: 'documentation', item_text: 'School profile section complete' },
  { category: 'evidence', item_text: 'Evidence uploaded for at least 80% of indicators' },
  { category: 'evidence', item_text: 'Student performance data (last 3 years) uploaded' },
  { category: 'documentation', item_text: 'Lesson plans for review week prepared' },
  { category: 'staff', item_text: 'Staff interview schedule drafted' },
  { category: 'documentation', item_text: 'Parent and student surveys distributed' },
  { category: 'environment', item_text: 'School facilities inspection walkthrough completed' },
  { category: 'environment', item_text: 'Safety certificates and licenses up to date' },
  { category: 'documentation', item_text: 'Improvement plan updated and active' },
  { category: 'documentation', item_text: 'Previous audit recommendations addressed (if applicable)' },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [accountForm, setAccountForm] = useState({
    email: '',
    password: '',
    full_name: '',
  });

  const [schoolForm, setSchoolForm] = useState({
    name_en: '',
    school_type: 'public' as 'public' | 'private',
    governorate: '',
    wilayat: '',
    principal_name: '',
  });

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: accountForm.email,
        password: accountForm.password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      // Create school
      const { data: school, error: schoolError } = await supabase
        .from('schools')
        .insert({ ...schoolForm })
        .select()
        .single();
      if (schoolError) throw schoolError;

      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          school_id: school.id,
          full_name: accountForm.full_name,
          role: 'principal',
        });
      if (profileError) throw profileError;

      // Seed audit checklist
      const checklistItems = DEFAULT_CHECKLIST.map((item) => ({
        school_id: school.id,
        category: item.category,
        item_text: item.item_text,
        is_custom: false,
      }));
      await supabase.from('audit_checklist_items').insert(checklistItems);

      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-xl border border-[#e2e0db] p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 bg-[#01696f] rounded-lg flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="font-semibold text-[#1a1a1a]">Madrasa Comply</div>
              <div className="text-xs text-[#6b7280]">School Registration</div>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  step >= s ? 'bg-[#01696f] text-white' : 'bg-gray-200 text-gray-500'
                }`}>{s}</div>
                {s < 2 && <ChevronRight className="h-4 w-4 text-gray-300" />}
              </div>
            ))}
            <span className="text-sm text-[#6b7280] ml-2">
              {step === 1 ? 'Account Details' : 'School Information'}
            </span>
          </div>

          {step === 1 && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input
                  value={accountForm.full_name}
                  onChange={(e) => setAccountForm({ ...accountForm, full_name: e.target.value })}
                  placeholder="Dr. Ahmed Al-Rashdi"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={accountForm.email}
                  onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                  placeholder="principal@school.edu.om"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Continue <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </form>
          )}

          {step === 2 && (
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

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Creating...' : 'Create School'}
                </Button>
              </div>
            </form>
          )}

          <p className="text-xs text-center text-[#6b7280] mt-4">
            Already registered?{' '}
            <a href="/login" className="text-[#01696f] hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
