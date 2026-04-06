import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/auth/LoginPage';
import { OnboardingPage } from './pages/auth/OnboardingPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { DomainsPage } from './pages/DomainsPage';
import { DomainDetailPage } from './pages/DomainDetailPage';
import { StandardPage } from './pages/StandardPage';
import { EvidencePage } from './pages/EvidencePage';
import { SelfEvaluationPage } from './pages/SelfEvaluationPage';
import { ImprovementPlanPage } from './pages/ImprovementPlanPage';
import { AuditPrepPage } from './pages/AuditPrepPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { useSchoolStore } from './stores/schoolStore';
import type { Session } from '@supabase/supabase-js';

function ProtectedRoute({ session }: { session: Session | null }) {
  if (!session) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { setProfile, setSchool, profile } = useSchoolStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setProfile(null);
        setSchool(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [setProfile, setSchool]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center">
        <div className="text-[#6b7280] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" /> : <LoginPage />} />
      {/* Accessible even when logged in — Supabase redirects here with a recovery token in the URL */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Only redirect away from onboarding once profile exists — prevents mid-signup redirect */}
      <Route path="/onboarding" element={session && !!profile ? <Navigate to="/dashboard" /> : <OnboardingPage />} />

      <Route element={<ProtectedRoute session={session} />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/domains" element={<DomainsPage />} />
        <Route path="/domains/:domainId" element={<DomainDetailPage />} />
        <Route path="/domains/:domainId/:standardId" element={<StandardPage />} />
        <Route path="/evidence" element={<EvidencePage />} />
        <Route path="/self-evaluation" element={<SelfEvaluationPage />} />
        <Route path="/improvement-plan" element={<ImprovementPlanPage />} />
        <Route path="/audit-prep" element={<AuditPrepPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} />} />
    </Routes>
  );
}

export default App;
