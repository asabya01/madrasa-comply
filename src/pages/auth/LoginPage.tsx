import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../../components/ui/toast';

type View = 'login' | 'forgot';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [view, setView] = useState<View>('login');

  // Show toast if redirected from /reset-password
  useEffect(() => {
    const state = location.state as { toast?: string } | null;
    if (state?.toast) {
      showToast(state.toast, 'success');
      // Clear the state so the toast doesn't replay on refresh
      window.history.replaceState({}, '');
    }
  }, [location.state, showToast]);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: 'https://madrasa-comply-asabya01s-projects.vercel.app/reset-password',
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setResetLoading(false);
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
              <div className="text-xs text-[#6b7280]">OAAAQA School Compliance Platform</div>
            </div>
          </div>

          {/* ── Login view ── */}
          {view === 'login' && (
            <>
              <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-1 font-sans">Welcome back</h2>
              <p className="text-sm text-[#6b7280] mb-6">Sign in to your school account</p>

              <form onSubmit={handleLogin} className="space-y-4">
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
                    placeholder="••••••••"
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </Button>
              </form>

              <button
                onClick={() => { setView('forgot'); setResetEmail(email); setResetError(''); setResetSent(false); }}
                className="block text-xs text-[#01696f] hover:underline mt-4 mx-auto"
              >
                Forgot password?
              </button>

              <p className="text-xs text-center text-[#6b7280] mt-4">
                New school?{' '}
                <a href="/onboarding" className="text-[#01696f] hover:underline">
                  Register here
                </a>
              </p>
            </>
          )}

          {/* ── Forgot password view ── */}
          {view === 'forgot' && (
            <>
              <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-1 font-sans">Reset password</h2>
              <p className="text-sm text-[#6b7280] mb-6">
                Enter your email and we'll send you a reset link.
              </p>

              {resetSent ? (
                <div className="text-sm text-[#437a22] bg-green-50 border border-green-200 rounded-md px-4 py-3 text-center">
                  Check your email for a reset link.
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email">Email address</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="principal@school.edu.om"
                      required
                    />
                  </div>

                  {resetError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                      {resetError}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={resetLoading}>
                    {resetLoading ? 'Sending…' : 'Send Reset Link'}
                  </Button>
                </form>
              )}

              <button
                onClick={() => setView('login')}
                className="block text-xs text-[#6b7280] hover:text-[#1a1a1a] hover:underline mt-4 mx-auto"
              >
                ← Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
