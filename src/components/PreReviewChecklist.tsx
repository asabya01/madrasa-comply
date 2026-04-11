import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

// ─── Data hooks ───────────────────────────────────────────────

function useChecklistData() {
  const { school, academicYear } = useSchoolStore();

  const { data: ratedCount = 0 } = useQuery({
    queryKey: ['checklist-ratings', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return 0;
      const { count } = await supabase
        .from('indicator_ratings')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      return count ?? 0;
    },
    enabled: !!school,
  });

  const { data: evidenceCount = 0 } = useQuery({
    queryKey: ['checklist-evidence', school?.id],
    queryFn: async () => {
      if (!school) return 0;
      const { count } = await supabase
        .from('evidence_files')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', school.id);
      return count ?? 0;
    },
    enabled: !!school,
  });

  const { data: perfCount = 0 } = useQuery({
    queryKey: ['checklist-perf', school?.id],
    queryFn: async () => {
      if (!school) return 0;
      const { count } = await supabase
        .from('student_performance')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', school.id);
      return count ?? 0;
    },
    enabled: !!school,
  });

  const { data: attendanceCount = 0 } = useQuery({
    queryKey: ['checklist-attendance', school?.id],
    queryFn: async () => {
      if (!school) return 0;
      const { count } = await supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', school.id);
      return count ?? 0;
    },
    enabled: !!school,
  });

  const { data: academicYearRow } = useQuery({
    queryKey: ['academic-year-row', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return null;
      const { data } = await supabase
        .from('academic_years')
        .select('id, external_review_mode, review_training_date')
        .eq('school_id', school.id)
        .eq('label', academicYear)
        .maybeSingle();
      return data;
    },
    enabled: !!school,
  });

  const { data: latestVisit } = useQuery({
    queryKey: ['latest-review-visit', school?.id],
    queryFn: async () => {
      if (!school) return null;
      const { data } = await supabase
        .from('review_visits')
        .select('overall_judgement, followup_deadline, visit_date')
        .eq('school_id', school.id)
        .order('visit_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!school,
  });

  const { data: sedCount = 0 } = useQuery({
    queryKey: ['checklist-sed', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return 0;
      const { count } = await supabase
        .from('sed_documents')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      return count ?? 0;
    },
    enabled: !!school,
  });

  const { data: socialMediaSet = false } = useQuery({
    queryKey: ['checklist-social', school?.id],
    queryFn: async () => {
      if (!school) return false;
      const { data } = await supabase
        .from('schools')
        .select('social_media_urls')
        .eq('id', school.id)
        .single();
      const urls = data?.social_media_urls as string[] | null;
      return Array.isArray(urls) && urls.length > 0;
    },
    enabled: !!school,
  });

  const { data: indicatorTotal = 0 } = useQuery({
    queryKey: ['indicator-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('indicators')
        .select('id', { count: 'exact', head: true });
      return count ?? 0;
    },
    staleTime: 1000 * 60 * 60,
  });

  // Count active survey templates that have at least 1 response
  const { data: surveyCount = 0 } = useQuery({
    queryKey: ['checklist-surveys', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return 0;
      const { data: templates } = await supabase
        .from('survey_templates')
        .select('id')
        .eq('school_id', school.id)
        .eq('is_active', true)
        .eq('academic_year', academicYear);
      if (!templates?.length) return 0;
      let count = 0;
      await Promise.all(
        templates.map(async ({ id }: { id: string }) => {
          const { count: c } = await supabase
            .from('survey_responses')
            .select('id', { count: 'exact', head: true })
            .eq('template_id', id);
          if ((c ?? 0) > 0) count++;
        })
      );
      return count;
    },
    enabled: !!school,
  });

  return {
    ratedCount,
    evidenceCount,
    perfCount,
    attendanceCount,
    academicYearRow,
    latestVisit,
    sedCount,
    socialMediaSet,
    indicatorTotal,
    surveyCount,
  };
}

// ─── External Review Mode toggle ─────────────────────────────

function useToggleReviewMode(yearId: string | undefined) {
  const qc = useQueryClient();
  const { school, academicYear } = useSchoolStore();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!yearId) throw new Error('No academic year id');
      const { error } = await supabase
        .from('academic_years')
        .update({ external_review_mode: enabled })
        .eq('id', yearId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['academic-year-row', school?.id, academicYear] });
    },
  });
}

// ─── Component ────────────────────────────────────────────────

export function PreReviewChecklist() {
  const { isSchoolAdmin, isSuperAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  const {
    ratedCount, evidenceCount, perfCount, attendanceCount,
    academicYearRow, latestVisit, sedCount, socialMediaSet, indicatorTotal,
    surveyCount,
  } = useChecklistData();

  const toggleMode = useToggleReviewMode(academicYearRow?.id);
  const isReviewMode = academicYearRow?.external_review_mode ?? false;

  // Countdown to SED submission deadline = training_date + 35 days (FR-GOV-02)
  const trainingDate = academicYearRow?.review_training_date
    ? new Date(academicYearRow.review_training_date)
    : null;
  const submissionDeadline = trainingDate
    ? new Date(trainingDate.getTime() + 35 * 24 * 60 * 60 * 1000)
    : null;
  const daysToDeadline = submissionDeadline
    ? Math.ceil((submissionDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Follow-up visit banner: latest judgement >= 4 (Unsatisfactory or NUI) (FR-FUP-02)
  const needsFollowUp = (latestVisit?.overall_judgement ?? 0) >= 4;
  const followUpDeadline = latestVisit?.followup_deadline
    ? new Date(latestVisit.followup_deadline)
    : null;
  const daysToFollowUp = followUpDeadline
    ? Math.ceil((followUpDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const items: Array<{ label: string; done: boolean; note?: string }> = [
    {
      label: `All ${indicatorTotal} indicators rated`,
      done: ratedCount >= indicatorTotal && indicatorTotal > 0,
      note: ratedCount < indicatorTotal ? `${indicatorTotal - ratedCount} remaining` : undefined,
    },
    {
      label: 'Evidence files uploaded',
      done: evidenceCount > 0,
      note: evidenceCount === 0 ? 'No evidence uploaded yet' : `${evidenceCount} files`,
    },
    {
      label: '3-year student performance data entered',
      done: perfCount > 0,
      note: perfCount === 0 ? 'No performance data yet' : `${perfCount} records`,
    },
    {
      label: 'Attendance records entered',
      done: attendanceCount > 0,
      note: attendanceCount === 0 ? 'No attendance records yet' : `${attendanceCount} records`,
    },
    {
      label: 'Social media accounts documented',
      done: socialMediaSet,
      note: !socialMediaSet ? 'Add URLs in School Settings' : undefined,
    },
    {
      label: 'SED generated and submitted',
      done: sedCount > 0,
      note: sedCount === 0 ? 'Generate from Self-Evaluation Document page' : `${sedCount} SED(s) generated`,
    },
    {
      label: 'Survey questionnaires distributed (3 required)',
      done: surveyCount >= 3,
      note: surveyCount < 3 ? `${surveyCount}/3 surveys active with responses` : `${surveyCount} surveys completed`,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const allDone = completedCount === items.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <button
            className="flex-1 flex items-center justify-between"
            onClick={() => setOpen(!open)}
          >
            <CardTitle className="text-base font-semibold font-sans flex items-center gap-2">
              Pre-Review Readiness Checklist
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                allDone ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {completedCount}/{items.length}
              </span>
            </CardTitle>
            {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {/* Follow-up visit banner */}
          {needsFollowUp && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Follow-up visit required</p>
                <p className="text-xs text-red-600 mt-0.5">
                  Last external review recorded an Unsatisfactory or NUI judgement.
                  {daysToFollowUp !== null && (
                    <> Follow-up deadline: <strong>{daysToFollowUp > 0 ? `${daysToFollowUp} days` : 'overdue'}</strong>.</>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Countdown banner */}
          {daysToDeadline !== null && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
              daysToDeadline <= 7 ? 'bg-red-50 border-red-200 text-red-800' :
              daysToDeadline <= 21 ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <Clock className="h-4 w-4 shrink-0" />
              {daysToDeadline > 0
                ? `${daysToDeadline} days until SED submission deadline (training date + 35 days)`
                : 'SED submission deadline has passed'}
            </div>
          )}

          {/* Checklist items */}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                {item.done
                  ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                <span className={`text-sm flex-1 ${item.done ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>
                  {item.label}
                </span>
                {item.note && (
                  <span className="text-xs text-gray-400">{item.note}</span>
                )}
              </div>
            ))}
          </div>

          {/* External Review Mode toggle — school admin only */}
          {(isSchoolAdmin || isSuperAdmin) && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-900">External Review Mode</p>
                <p className="text-xs text-gray-500">Activates review-preparation features for this academic year</p>
              </div>
              <button
                onClick={() => toggleMode.mutate(!isReviewMode)}
                disabled={toggleMode.isPending || !academicYearRow}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  isReviewMode ? 'bg-[#01696f]' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  isReviewMode ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
