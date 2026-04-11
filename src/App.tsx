import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { AppShell } from './components/layout/AppShell';
import { SuperAdminShell } from './components/layout/SuperAdminShell';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { OnboardingPage } from './pages/auth/OnboardingPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import SuperAdminPage from './pages/SuperAdminPage';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { DomainsPage } from './pages/DomainsPage';
import { DomainDetailPage } from './pages/DomainDetailPage';
import { StandardPage } from './pages/StandardPage';
import { EvidencePage } from './pages/EvidencePage';
import SelfEvaluationPage from './pages/SelfEvaluationPage';
import SEDPage from './pages/SEDPage';
import ImprovementPlanPage from './pages/ImprovementPlanPage';
import { AuditPrepPage } from './pages/AuditPrepPage';
import { ReportsPage } from './pages/ReportsPage';
import SchoolSettingsPage from './pages/SchoolSettingsPage';
import SchoolUsersPage from './pages/SchoolUsersPage';
import IndicatorsPage from './pages/IndicatorsPage';
import TeacherSelfAssessmentPage from './pages/TeacherSelfAssessmentPage';
import TeacherHomePage from './pages/TeacherHomePage';
import ClassroomObservationsPage from './pages/ClassroomObservationsPage';
import JudgementsPage from './pages/JudgementsPage';
import PerformanceDataPage from './pages/PerformanceDataPage';
import SurveysPage from './pages/SurveysPage';
import PublicSurveyPage from './pages/PublicSurveyPage';
import ReviewVisitsPage from './pages/ReviewVisitsPage';
import { useSchool } from './hooks/useSchool';
import { useSchoolStore } from './stores/schoolStore';
import type { Session } from '@supabase/supabase-js';

const Spinner = () => (
  <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center">
    <div className="text-[#6b7280] text-sm">Loading...</div>
  </div>
);

// Blocks unauthenticated users, waits for profile+memberships to load,
// then redirects to /onboarding if the user has no active school membership.
function ProtectedRoute({ session }: { session: Session | null }) {
  const { isLoading, needsOnboarding } = useSchool();
  if (!session) return <Navigate to="/login" replace />;
  if (isLoading) return <Spinner />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <AppShell />;
}

// Blocks unauthenticated users and non-super-admins.
// Redirects to /dashboard if profiles.is_super_admin is not true.
function SuperAdminRoute({ session }: { session: Session | null }) {
  const { isLoading, profile } = useSchool();
  if (!session) return <Navigate to="/login" replace />;
  if (isLoading) return <Spinner />;
  if (!profile?.is_super_admin) return <Navigate to="/dashboard" replace />;
  return <SuperAdminShell />;
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

  if (loading) return <Spinner />;

  // After login, super admins go to /super-admin; everyone else to /dashboard.
  // profile is from the Zustand store — populated once useSchool runs inside
  // a shell. On fresh page load it may be null, so the shells handle the
  // final redirect internally.
  const postLoginPath = profile?.is_super_admin ? '/super-admin' : '/dashboard';

  return (
    <Routes>
      {/* ── Public survey route (no auth) ── */}
      <Route path="/survey/:shareToken" element={<PublicSurveyPage />} />

      {/* ── Public auth routes ── */}
      <Route path="/login"  element={session ? <Navigate to={postLoginPath} /> : <LoginPage />} />
      <Route path="/signup" element={session ? <Navigate to="/onboarding" />  : <SignupPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* ── Onboarding ── */}
      <Route
        path="/onboarding"
        element={profile?.is_super_admin ? <Navigate to="/super-admin" /> : <OnboardingPage />}
      />

      {/* ── Super admin shell ── */}
      <Route element={<SuperAdminRoute session={session} />}>
        <Route path="/super-admin" element={<SuperAdminPage />} />
      </Route>

      {/* ── Regular school shell ── */}
      <Route element={<ProtectedRoute session={session} />}>
        <Route path="/dashboard"        element={<DashboardPage />} />
        <Route path="/domains"          element={<DomainsPage />} />
        <Route path="/domains/:domainId" element={<DomainDetailPage />} />
        <Route path="/domains/:domainId/:standardId" element={<StandardPage />} />
        <Route path="/evidence"         element={<EvidencePage />} />
        <Route path="/self-evaluation"          element={<SelfEvaluationPage />} />
        <Route path="/self-evaluation-document" element={<SEDPage />} />
        <Route path="/indicators"       element={<IndicatorsPage />} />
        <Route path="/teacher-home"          element={<TeacherHomePage />} />
        <Route path="/teacher-assessment"   element={<TeacherSelfAssessmentPage />} />
        <Route path="/observations"         element={<ClassroomObservationsPage />} />
        <Route path="/judgements"        element={<JudgementsPage />} />
        <Route path="/surveys"           element={<SurveysPage />} />
        <Route path="/performance-data"  element={<PerformanceDataPage />} />
        <Route path="/improvement-plan" element={<ImprovementPlanPage />} />
        <Route path="/audit-prep"       element={<AuditPrepPage />} />
        <Route path="/review-visits"    element={<ReviewVisitsPage />} />
        <Route path="/reports"          element={<ReportsPage />} />
        <Route path="/settings"         element={<SchoolSettingsPage />} />
        <Route path="/school-users"     element={<SchoolUsersPage />} />
        <Route path="/admin"            element={<AdminPage />} />
      </Route>

      <Route path="*" element={<Navigate to={session ? postLoginPath : '/login'} />} />
    </Routes>
  );
}

export default App;
