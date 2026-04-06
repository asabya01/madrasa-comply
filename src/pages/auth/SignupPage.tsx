import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

export function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Create auth user — passes full_name in metadata so the
      //    handle_new_user trigger can pick it up immediately.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('Signup succeeded but no user was returned.');

      // 2. Upsert the profile row so full_name + email are guaranteed to be
      //    set regardless of whether the trigger has already fired.
      //    ON CONFLICT (id) DO UPDATE ensures this is idempotent.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          { id: authData.user.id, full_name: fullName, email },
          { onConflict: 'id' }
        );
      if (profileError) {
        // Non-fatal: trigger may have created the row; log and continue.
        console.warn('[Signup] Profile upsert warning:', profileError.message);
      }

      // 3. Go to onboarding — create or join a school.
      navigate('/onboarding', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl border border-[#e2e0db] p-8 shadow-sm">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 bg-[#01696f] rounded-lg flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="font-semibold text-[#1a1a1a]">Madrasa Comply</div>
              <div className="text-xs text-[#6b7280]">Create your account</div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-1">Get started</h2>
          <p className="text-sm text-[#6b7280] mb-6">
            Create an account, then set up or join your school.
          </p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full-name">Full Name</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Ahmed Al-Rashdi"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="principal@school.edu.om"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </Button>
          </form>

          <p className="text-xs text-center text-[#6b7280] mt-4">
            Already have an account?{' '}
            <a href="/login" className="text-[#01696f] hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
