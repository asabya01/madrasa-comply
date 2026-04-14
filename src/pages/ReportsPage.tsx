import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, BarChart2, PieChart, AlertCircle, ClipboardList,
  TrendingUp, ShieldCheck, Download, Loader2, FileSpreadsheet, X, GitCompare,
} from 'lucide-react';
import { SedDiffReport } from '../components/reports/SedDiffReport';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useJudgements } from '../hooks/useJudgements';
import { useSchoolStore } from '../stores/schoolStore';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, ratingToPercent, type JudgementLevel } from '../lib/judgement';
import { exportMinistryMasteryExcel } from '../lib/exportMinistryExcel';
import { TrendTab } from '../components/TrendTab';

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching and Assessment',
  '4': 'School Climate and Learning Environment',
  '5': 'Leadership, Management and Governance',
};

const reports = [
  { id: 'executive',          title: 'Executive Compliance Summary',    description: '1-page overview of overall school judgement for the principal',                    icon: BarChart2   },
  { id: 'evidence-coverage',  title: 'Evidence Coverage Report',        description: 'Which indicators have evidence and which are missing',                             icon: AlertCircle },
  { id: 'improvement-status', title: 'Improvement Plan Status',         description: 'Action items by status, domain and priority',                                     icon: ClipboardList},
  { id: 'full-sed',           title: 'Full Self-Evaluation Report',     description: 'OAAAQA-formatted document with all domains, standards and indicators',            icon: FileText    },
  { id: 'domain-deep',        title: 'Domain Deep-Dive',                description: 'Full indicator detail for a selected domain — ratings, evidence, action areas',  icon: PieChart    },
  { id: 'kpi-trend',          title: 'KPI Trend Report',                description: 'Historical proficiency rates across core subjects, with year-on-year progress',  icon: TrendingUp  },
  { id: 'audit-readiness',    title: 'Audit Readiness Report',          description: 'Overall readiness percentage with checklist and evidence gap analysis',          icon: ShieldCheck },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface IndicatorRatingRow {
  indicator_id: string;
  rating: number | null;
  strengths: string | null;
  improvement_areas: string | null;
}

interface ChecklistItem {
  id: string;
  title: string;
  category: string | null;
  is_completed: boolean;
}

// ─── PDF helpers ──────────────────────────────────────────────────────────────

function addPageHeader(doc: jsPDF, schoolName: string, reportTitle: string): number {
  doc.setFillColor(1, 105, 111);
  doc.rect(0, 0, 210, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text('Madrasa Comply — OAAAQA SEF 2024', 10, 8);
  doc.setFontSize(7);
  doc.text(`${schoolName} · Generated ${new Date().toLocaleDateString('en-GB')}`, 10, 14);
  doc.text(reportTitle, 170, 14, { align: 'right' });
  doc.setTextColor(26, 26, 26);
  return 28;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { t } = useTranslation();
  const { school, academicYear } = useSchoolStore();
  const { judgements } = useJudgements();
  const [generating, setGenerating] = useState<string | null>(null);
  const [ministrySemester, setMinistrySemester] = useState<'semester_1' | 'semester_2' | 'annual'>('semester_1');
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState('1');

  // ── Existing queries ──────────────────────────────────────────────────────

  const { data: indicators } = useQuery({
    queryKey: ['indicators-report'],
    queryFn: async () => {
      const { data } = await supabase
        .from('indicators')
        .select('id, description_en, domain_id, standard_id')
        .order('order_num');
      return data || [];
    },
  });

  const { data: evidenceLinks } = useQuery({
    queryKey: ['evidence-links-report', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase
        .from('evidence_indicator_links')
        .select('indicator_id')
        .eq('school_id', school.id);
      return (data || []).map((l) => l.indicator_id as string);
    },
    enabled: !!school,
  });

  const { data: actions } = useQuery({
    queryKey: ['actions-report', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase
        .from('action_items')
        .select('*')
        .eq('school_id', school.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!school,
  });

  // ── New queries ───────────────────────────────────────────────────────────

  const { data: ratings } = useQuery({
    queryKey: ['indicator-ratings-report', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [] as IndicatorRatingRow[];
      const { data } = await supabase
        .from('indicator_ratings')
        .select('indicator_id, rating, strengths, improvement_areas')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      return (data || []) as IndicatorRatingRow[];
    },
    enabled: !!school,
  });

  const { data: checklist } = useQuery({
    queryKey: ['audit-checklist-report', school?.id],
    queryFn: async () => {
      if (!school) return [] as ChecklistItem[];
      const { data } = await supabase
        .from('audit_checklist_items')
        .select('id, title, category, is_completed')
        .eq('school_id', school.id)
        .order('is_custom');
      return (data || []) as ChecklistItem[];
    },
    enabled: !!school,
  });

  // ── PDF: Executive Summary (existing) ────────────────────────────────────

  const generateExecutive = () => {
    const doc = new jsPDF();
    const schoolName = school?.name_en || 'School';
    let y = addPageHeader(doc, schoolName, 'Executive Summary');

    doc.setFontSize(18);
    doc.text('Executive Compliance Summary', 105, y, { align: 'center' });
    y += 12;

    const overall = (judgements?.overall || 3) as JudgementLevel;
    const color = JUDGEMENT_COLORS[overall];
    const rgb = hexToRgb(color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.roundedRect(15, y, 180, 22, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(`Overall Judgement: ${JUDGEMENT_LABELS[overall]}`, 105, y + 9, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Compliance Score: ${ratingToPercent(overall)}%`, 105, y + 17, { align: 'center' });
    doc.setTextColor(26, 26, 26);
    y += 30;

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`School: ${schoolName}  |  Type: ${school?.school_type || '-'}  |  Governorate: ${school?.governorate || '-'}`, 15, y);
    doc.text(`Principal: ${school?.principal_name || '-'}  |  Students: ${(school?.total_students_male || 0) + (school?.total_students_female || 0)}  |  Teachers: ${school?.total_teachers || 0}`, 15, y + 6);
    doc.setTextColor(26, 26, 26);
    y += 16;

    doc.setFontSize(11);
    doc.text(`Indicators Rated: ${judgements?.ratedCount || 0} / ${judgements?.totalCount || 0}`, 15, y);
    const pct = judgements?.totalCount ? ((judgements.ratedCount || 0) / judgements.totalCount) : 0;
    doc.setFillColor(230, 230, 230);
    doc.rect(15, y + 3, 120, 5, 'F');
    doc.setFillColor(1, 105, 111);
    doc.rect(15, y + 3, 120 * pct, 5, 'F');
    y += 16;

    doc.setFontSize(12);
    doc.text('Domain Judgements', 15, y); y += 6;
    doc.setFontSize(9);
    doc.setFillColor(247, 246, 242);
    doc.rect(15, y, 180, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Domain', 17, y + 5);
    doc.text('Judgement', 130, y + 5);
    doc.text('Score', 170, y + 5);
    doc.setFont('helvetica', 'normal');
    y += 10;

    Object.entries(DOMAIN_NAMES).forEach(([id, name]) => {
      const level = ((judgements?.domains as Record<string, JudgementLevel> || {})[id] || 3) as JudgementLevel;
      const rgb2 = hexToRgb(JUDGEMENT_COLORS[level]);
      doc.setFillColor(rgb2.r, rgb2.g, rgb2.b);
      doc.circle(17, y + 1.5, 2, 'F');
      doc.text(`${id}. ${name}`, 22, y + 4);
      doc.setTextColor(rgb2.r, rgb2.g, rgb2.b);
      doc.text(JUDGEMENT_LABELS[level], 130, y + 4);
      doc.setTextColor(26, 26, 26);
      doc.text(`${ratingToPercent(level)}%`, 170, y + 4);
      doc.setDrawColor(226, 224, 219);
      doc.line(15, y + 7, 195, y + 7);
      y += 9;
    });

    doc.save(`Executive-Summary-${schoolName.replace(/\s+/g, '-')}.pdf`);
  };

  // ── PDF: Evidence Coverage (existing) ────────────────────────────────────

  const generateEvidenceCoverage = () => {
    const doc = new jsPDF();
    const schoolName = school?.name_en || 'School';
    let y = addPageHeader(doc, schoolName, 'Evidence Coverage');

    doc.setFontSize(16);
    doc.text('Evidence Coverage Report', 15, y); y += 12;

    const coveredSet = new Set(evidenceLinks || []);
    const total = (indicators || []).length;
    const covered = (indicators || []).filter((i) => coveredSet.has(i.id)).length;
    const missing = total - covered;

    doc.setFontSize(10);
    doc.setFillColor(240, 247, 235);
    doc.rect(15, y, 55, 18, 'F');
    doc.setFontSize(18);
    doc.setTextColor(67, 122, 34);
    doc.text(`${covered}`, 42, y + 13, { align: 'center' });
    doc.setFontSize(8);
    doc.text('With evidence', 42, y + 17, { align: 'center' });

    doc.setFillColor(255, 235, 235);
    doc.rect(80, y, 55, 18, 'F');
    doc.setFontSize(18);
    doc.setTextColor(220, 38, 38);
    doc.text(`${missing}`, 107, y + 13, { align: 'center' });
    doc.setFontSize(8);
    doc.text('Missing evidence', 107, y + 17, { align: 'center' });

    doc.setFillColor(247, 246, 242);
    doc.rect(145, y, 50, 18, 'F');
    doc.setFontSize(18);
    doc.setTextColor(1, 105, 111);
    doc.text(`${total ? Math.round(covered / total * 100) : 0}%`, 170, y + 13, { align: 'center' });
    doc.setFontSize(8);
    doc.text('Coverage', 170, y + 17, { align: 'center' });
    doc.setTextColor(26, 26, 26);
    y += 28;

    doc.setFontSize(11);
    doc.text('Indicators Missing Evidence', 15, y); y += 7;

    const missingInds = (indicators || []).filter((i) => !coveredSet.has(i.id));

    Object.entries(DOMAIN_NAMES).forEach(([domainId, domainName]) => {
      const domainMissing = missingInds.filter((i) => i.domain_id === domainId);
      if (!domainMissing.length) return;

      if (y > 260) { doc.addPage(); y = addPageHeader(doc, schoolName, 'Evidence Coverage'); }

      doc.setFillColor(247, 246, 242);
      doc.rect(15, y, 180, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Domain ${domainId}: ${domainName} (${domainMissing.length} missing)`, 17, y + 5);
      doc.setFont('helvetica', 'normal');
      y += 10;

      domainMissing.forEach((ind) => {
        if (y > 270) { doc.addPage(); y = addPageHeader(doc, schoolName, 'Evidence Coverage'); }
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(ind.id, 17, y);
        doc.setTextColor(26, 26, 26);
        const lines = doc.splitTextToSize(ind.description_en, 160);
        doc.text(lines[0], 32, y);
        doc.setDrawColor(240, 240, 240);
        doc.line(15, y + 3, 195, y + 3);
        y += 6;
      });
      y += 4;
    });

    doc.save(`Evidence-Coverage-${schoolName.replace(/\s+/g, '-')}.pdf`);
  };

  // ── PDF: Improvement Plan (existing) ─────────────────────────────────────

  const generateImprovementPlan = () => {
    const doc = new jsPDF();
    const schoolName = school?.name_en || 'School';
    let y = addPageHeader(doc, schoolName, 'Improvement Plan');

    doc.setFontSize(16);
    doc.text('Improvement Plan Status Report', 15, y); y += 12;

    const items = actions || [];
    const total = items.length;
    const completed = items.filter((a) => a.status === 'completed').length;
    const inProgress = items.filter((a) => a.status === 'in_progress').length;
    const overdue = items.filter((a) => a.status === 'overdue').length;

    doc.setFontSize(10);
    const cols = [
      { label: 'Total',       value: total,      bg: [247, 246, 242] as [number, number, number] },
      { label: 'Completed',   value: completed,   bg: [240, 247, 235] as [number, number, number] },
      { label: 'In Progress', value: inProgress,  bg: [230, 242, 248] as [number, number, number] },
      { label: 'Overdue',     value: overdue,     bg: [255, 235, 235] as [number, number, number] },
    ];
    cols.forEach(({ label, value, bg }, i) => {
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(15 + i * 45, y, 43, 16, 'F');
      doc.setFontSize(16);
      doc.text(String(value), 36 + i * 45, y + 11, { align: 'center' });
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(label, 36 + i * 45, y + 15, { align: 'center' });
      doc.setTextColor(26, 26, 26);
    });
    y += 24;

    if (total > 0) {
      doc.setFontSize(10);
      doc.text(`${Math.round(completed / total * 100)}% complete`, 15, y);
      doc.setFillColor(230, 230, 230);
      doc.rect(15, y + 3, 120, 4, 'F');
      doc.setFillColor(67, 122, 34);
      doc.rect(15, y + 3, 120 * (completed / total), 4, 'F');
      y += 14;
    }

    doc.setFontSize(11);
    doc.text('Action Items', 15, y); y += 6;

    const statusOrder = ['overdue', 'in_progress', 'not_started', 'completed'];
    const statusLabels: Record<string, string> = {
      overdue: 'OVERDUE', in_progress: 'IN PROGRESS', not_started: 'NOT STARTED', completed: 'COMPLETED',
    };

    statusOrder.forEach((status) => {
      const group = items.filter((a) => a.status === status);
      if (!group.length) return;

      if (y > 255) { doc.addPage(); y = addPageHeader(doc, schoolName, 'Improvement Plan'); }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(247, 246, 242);
      doc.rect(15, y, 180, 7, 'F');
      doc.text(statusLabels[status], 17, y + 5);
      doc.setFont('helvetica', 'normal');
      y += 10;

      group.forEach((action) => {
        if (y > 270) { doc.addPage(); y = addPageHeader(doc, schoolName, 'Improvement Plan'); }
        doc.setFontSize(8);
        const lines = doc.splitTextToSize(action.title, 130);
        doc.text(lines[0], 17, y);
        doc.setTextColor(107, 114, 128);
        doc.text(action.priority.toUpperCase(), 150, y);
        if (action.due_date) doc.text(new Date(action.due_date).toLocaleDateString('en-GB'), 175, y);
        doc.setTextColor(26, 26, 26);
        doc.setDrawColor(240, 240, 240);
        doc.line(15, y + 3, 195, y + 3);
        y += 6;
      });
      y += 4;
    });

    doc.save(`Improvement-Plan-${schoolName.replace(/\s+/g, '-')}.pdf`);
  };

  // ── PDF: Domain Deep-Dive (new) ───────────────────────────────────────────

  const generateDomainDeep = () => {
    const doc = new jsPDF();
    const schoolName = school?.name_en || 'School';
    const domainName = DOMAIN_NAMES[selectedDomain] || `Domain ${selectedDomain}`;
    let y = addPageHeader(doc, schoolName, `Domain ${selectedDomain} Deep-Dive`);

    // Domain header bar
    const domainLevel = ((judgements?.domains as Record<string, JudgementLevel> || {})[selectedDomain] || 3) as JudgementLevel;
    const dRgb = hexToRgb(JUDGEMENT_COLORS[domainLevel]);
    doc.setFillColor(dRgb.r, dRgb.g, dRgb.b);
    doc.roundedRect(15, y, 180, 16, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(`Domain ${selectedDomain}: ${domainName}`, 20, y + 7);
    doc.setFontSize(9);
    doc.text(`Judgement: ${JUDGEMENT_LABELS[domainLevel]}  ·  Score: ${ratingToPercent(domainLevel)}%`, 20, y + 13);
    doc.setTextColor(26, 26, 26);
    y += 22;

    // Build lookup maps
    const ratingsMap = new Map((ratings || []).map((r) => [r.indicator_id, r]));
    const evidenceSet = new Set(evidenceLinks || []);
    const domainIndicators = (indicators || []).filter((i) => i.domain_id === selectedDomain);
    const rated = domainIndicators.filter((i) => ratingsMap.get(i.id)?.rating != null).length;
    const withEvidence = domainIndicators.filter((i) => evidenceSet.has(i.id)).length;

    // Summary stat boxes
    const statBoxes = [
      { label: 'Indicators', value: domainIndicators.length, bg: [247, 246, 242] as [number, number, number], tc: [1, 105, 111] as [number, number, number] },
      { label: 'Rated',      value: rated,                   bg: [240, 247, 235] as [number, number, number], tc: [67, 122, 34]  as [number, number, number] },
      { label: 'Evidence',   value: withEvidence,            bg: [230, 242, 248] as [number, number, number], tc: [30, 100, 170] as [number, number, number] },
    ];
    statBoxes.forEach(({ label, value, bg, tc }, i) => {
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(15 + i * 62, y, 58, 14, 'F');
      doc.setFontSize(16);
      doc.setTextColor(tc[0], tc[1], tc[2]);
      doc.text(String(value), 44 + i * 62, y + 10, { align: 'center' });
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(label, 44 + i * 62, y + 13, { align: 'center' });
    });
    doc.setTextColor(26, 26, 26);
    y += 22;

    // Table header
    doc.setFontSize(9);
    doc.setFillColor(230, 230, 230);
    doc.rect(15, y, 180, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Indicator', 17, y + 5);
    doc.text('Judgement', 128, y + 5);
    doc.text('Evidence', 168, y + 5);
    doc.setFont('helvetica', 'normal');
    y += 10;

    domainIndicators.forEach((ind) => {
      const r = ratingsMap.get(ind.id);
      const level = r?.rating as JudgementLevel | undefined;
      const hasEvidence = evidenceSet.has(ind.id);

      // Estimate row height to decide page break
      let rowH = 10;
      if (r?.strengths)          rowH += 5;
      if (r?.improvement_areas)  rowH += 5;
      if (y + rowH > 268) {
        doc.addPage();
        y = addPageHeader(doc, schoolName, `Domain ${selectedDomain} Deep-Dive`);
      }

      // Indicator description
      doc.setFontSize(8);
      doc.setTextColor(26, 26, 26);
      const descLines = doc.splitTextToSize(ind.description_en, 105);
      doc.text(descLines[0], 17, y);
      if (descLines[1]) {
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(7.5);
        doc.text(descLines[1], 17, y + 4);
      }

      // Judgement label
      if (level) {
        const jRgb = hexToRgb(JUDGEMENT_COLORS[level]);
        doc.setTextColor(jRgb.r, jRgb.g, jRgb.b);
        doc.setFontSize(7.5);
        doc.text(JUDGEMENT_LABELS[level], 128, y);
      } else {
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(7.5);
        doc.text('Not rated', 128, y);
      }

      // Evidence tick/cross
      const evRgb = hasEvidence ? { r: 67, g: 122, b: 34 } : { r: 200, g: 200, b: 200 };
      doc.setTextColor(evRgb.r, evRgb.g, evRgb.b);
      doc.text(hasEvidence ? '✓ Yes' : '✗ None', 168, y);
      doc.setTextColor(26, 26, 26);

      let localY = descLines[1] ? y + 8 : y + 4;

      if (r?.strengths) {
        doc.setFontSize(7);
        doc.setTextColor(67, 122, 34);
        const sLine = doc.splitTextToSize(`▲ ${r.strengths}`, 168)[0];
        doc.text(sLine, 17, localY);
        localY += 5;
      }
      if (r?.improvement_areas) {
        doc.setFontSize(7);
        doc.setTextColor(192, 57, 43);
        const iLine = doc.splitTextToSize(`▼ ${r.improvement_areas}`, 168)[0];
        doc.text(iLine, 17, localY);
        localY += 5;
      }

      doc.setDrawColor(240, 240, 240);
      doc.line(15, localY + 2, 195, localY + 2);
      y = localY + 5;
    });

    // Domain action items (filtered by indicator_id membership)
    const domainIndIds = new Set(domainIndicators.map((i) => i.id));
    const domainActions = (actions || []).filter(
      (a) => a.indicator_id && domainIndIds.has(a.indicator_id),
    );

    if (domainActions.length > 0) {
      if (y > 240) { doc.addPage(); y = addPageHeader(doc, schoolName, `Domain ${selectedDomain} Deep-Dive`); }
      y += 4;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Action Items for this Domain', 15, y); y += 7;
      doc.setFont('helvetica', 'normal');

      domainActions.forEach((action) => {
        if (y > 270) { doc.addPage(); y = addPageHeader(doc, schoolName, `Domain ${selectedDomain} Deep-Dive`); }
        doc.setFontSize(8);
        doc.setTextColor(26, 26, 26);
        const titleLine = doc.splitTextToSize(action.title, 125)[0];
        doc.text(titleLine, 17, y);
        doc.setTextColor(107, 114, 128);
        doc.text((action.status as string).replace(/_/g, ' ').toUpperCase(), 148, y);
        doc.text((action.priority as string).toUpperCase(), 185, y, { align: 'right' });
        doc.setTextColor(26, 26, 26);
        doc.setDrawColor(240, 240, 240);
        doc.line(15, y + 3, 195, y + 3);
        y += 6;
      });
    }

    doc.save(`Domain-${selectedDomain}-Deep-Dive-${schoolName.replace(/\s+/g, '-')}.pdf`);
  };

  // ── PDF: Full SED (new) ───────────────────────────────────────────────────

  const generateFullSED = () => {
    const doc = new jsPDF();
    const schoolName = school?.name_en || 'School';
    const overall = (judgements?.overall || 3) as JudgementLevel;

    // ── Cover page ──
    doc.setFillColor(1, 105, 111);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text('OAAAQA Self-Evaluation Document', 105, 80, { align: 'center' });
    doc.setFontSize(22);
    doc.text(schoolName, 105, 98, { align: 'center' });
    if (school?.name_ar) {
      doc.setFontSize(16);
      doc.text(school.name_ar, 105, 112, { align: 'center' });
    }
    doc.setFontSize(11);
    doc.text(`Academic Year: ${academicYear || '—'}`, 105, 130, { align: 'center' });
    doc.text(`OAAAQA Code: ${school?.oaaaqa_code || '—'}`, 105, 138, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 105, 146, { align: 'center' });

    // Overall judgement callout on cover
    const oRgb = hexToRgb(JUDGEMENT_COLORS[overall]);
    doc.setFillColor(oRgb.r, oRgb.g, oRgb.b);
    doc.roundedRect(55, 162, 100, 22, 4, 4, 'F');
    doc.setFontSize(13);
    doc.text(`Overall: ${JUDGEMENT_LABELS[overall]}`, 105, 173, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Compliance Score: ${ratingToPercent(overall)}%`, 105, 180, { align: 'center' });

    // School info block on cover
    doc.setFontSize(9);
    doc.setTextColor(200, 235, 235);
    const infoLines = [
      `Type: ${school?.school_type || '—'}   |   Governorate: ${school?.governorate || '—'}`,
      `Principal: ${school?.principal_name || '—'}`,
      `Students: ${(school?.total_students_male || 0) + (school?.total_students_female || 0)}   |   Teachers: ${school?.total_teachers || 0}`,
    ];
    infoLines.forEach((line, i) => doc.text(line, 105, 218 + i * 8, { align: 'center' }));
    doc.setTextColor(26, 26, 26);

    // ── Domain sections ──
    const ratingsMap = new Map((ratings || []).map((r) => [r.indicator_id, r]));
    const evidenceSet = new Set(evidenceLinks || []);

    Object.entries(DOMAIN_NAMES).forEach(([domainId, domainName]) => {
      doc.addPage();
      let y = addPageHeader(doc, schoolName, 'Self-Evaluation Document');

      const domainLevel = ((judgements?.domains as Record<string, JudgementLevel> || {})[domainId] || 3) as JudgementLevel;
      const dRgb = hexToRgb(JUDGEMENT_COLORS[domainLevel]);

      // Domain header
      doc.setFillColor(dRgb.r, dRgb.g, dRgb.b);
      doc.rect(15, y, 180, 13, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text(`Domain ${domainId}: ${domainName}`, 20, y + 6);
      doc.setFontSize(8.5);
      doc.text(`Judgement: ${JUDGEMENT_LABELS[domainLevel]}  ·  ${ratingToPercent(domainLevel)}%`, 20, y + 11);
      doc.setTextColor(26, 26, 26);
      y += 18;

      const domainIndicators = (indicators || []).filter((i) => i.domain_id === domainId);

      domainIndicators.forEach((ind) => {
        const r = ratingsMap.get(ind.id);
        const level = r?.rating as JudgementLevel | undefined;
        const hasEvidence = evidenceSet.has(ind.id);

        // Pre-calculate row height
        let rowH = 12;
        if (r?.strengths)         rowH += 5;
        if (r?.improvement_areas) rowH += 5;

        if (y + rowH > 270) {
          doc.addPage();
          y = addPageHeader(doc, schoolName, 'Self-Evaluation Document');
        }

        // Judgement badge
        if (level) {
          const jRgb = hexToRgb(JUDGEMENT_COLORS[level]);
          doc.setFillColor(jRgb.r, jRgb.g, jRgb.b);
          doc.roundedRect(152, y - 3, 43, 6, 1.5, 1.5, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(6.5);
          doc.text(JUDGEMENT_LABELS[level], 173.5, y + 0.5, { align: 'center' });
        } else {
          doc.setFillColor(220, 220, 220);
          doc.roundedRect(152, y - 3, 43, 6, 1.5, 1.5, 'F');
          doc.setTextColor(150, 150, 150);
          doc.setFontSize(6.5);
          doc.text('Not rated', 173.5, y + 0.5, { align: 'center' });
        }

        // Evidence indicator
        const evRgb = hasEvidence ? { r: 67, g: 122, b: 34 } : { r: 200, g: 200, b: 200 };
        doc.setTextColor(evRgb.r, evRgb.g, evRgb.b);
        doc.setFontSize(7);
        doc.text(hasEvidence ? '● Evidence' : '○ No evidence', 110, y);

        // Indicator description
        doc.setTextColor(26, 26, 26);
        doc.setFontSize(8);
        const descLines = doc.splitTextToSize(ind.description_en, 88);
        doc.text(descLines[0], 17, y);
        let localY = descLines[1] ? y + 9 : y + 5;

        if (r?.strengths) {
          doc.setFontSize(7);
          doc.setTextColor(67, 122, 34);
          doc.text(`▲ ${doc.splitTextToSize(r.strengths, 170)[0]}`, 17, localY);
          localY += 5;
        }
        if (r?.improvement_areas) {
          doc.setFontSize(7);
          doc.setTextColor(192, 57, 43);
          doc.text(`▼ ${doc.splitTextToSize(r.improvement_areas, 170)[0]}`, 17, localY);
          localY += 5;
        }

        doc.setDrawColor(240, 240, 240);
        doc.line(15, localY + 1, 195, localY + 1);
        y = localY + 4;
      });
    });

    doc.save(`Full-SED-${schoolName.replace(/\s+/g, '-')}-${academicYear || 'current'}.pdf`);
  };

  // ── PDF: Audit Readiness (new) ────────────────────────────────────────────

  const generateAuditReadiness = () => {
    const doc = new jsPDF();
    const schoolName = school?.name_en || 'School';
    let y = addPageHeader(doc, schoolName, 'Audit Readiness');

    doc.setFontSize(16);
    doc.text('Audit Readiness Report', 15, y); y += 14;

    // Compute metrics
    const totalInds        = (indicators || []).length;
    const ratedCount       = (ratings || []).filter((r) => r.rating != null).length;
    const evidenceCovered  = new Set(evidenceLinks || []).size;
    const checklistTotal   = (checklist || []).length;
    const checklistDone    = (checklist || []).filter((c) => c.is_completed).length;

    const indicatorPct  = totalInds      > 0 ? Math.round(ratedCount      / totalInds      * 100) : 0;
    const evidencePct   = totalInds      > 0 ? Math.round(evidenceCovered  / totalInds      * 100) : 0;
    const checklistPct  = checklistTotal > 0 ? Math.round(checklistDone    / checklistTotal * 100) : 0;
    const overallPct    = Math.round((indicatorPct + evidencePct + checklistPct) / 3);

    // Overall readiness circle
    const circleColor   = overallPct >= 80 ? '#437a22' : overallPct >= 60 ? '#d19900' : '#c0392b';
    const cRgb          = hexToRgb(circleColor);
    doc.setFillColor(cRgb.r, cRgb.g, cRgb.b);
    doc.circle(105, y + 18, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(`${overallPct}%`, 105, y + 21, { align: 'center' });
    doc.setFontSize(8);
    doc.text('Overall Readiness', 105, y + 29, { align: 'center' });
    doc.setTextColor(26, 26, 26);
    y += 48;

    // Three metric bars
    const metricLabel = overallPct >= 80 ? 'Ready for audit' : overallPct >= 60 ? 'Some gaps remain' : 'Significant gaps — action needed';
    doc.setFontSize(9);
    doc.setTextColor(cRgb.r, cRgb.g, cRgb.b);
    doc.text(metricLabel, 105, y, { align: 'center' });
    doc.setTextColor(26, 26, 26);
    y += 10;

    const metrics = [
      { label: 'Indicators Rated',   pct: indicatorPct,  detail: `${ratedCount} of ${totalInds}`       },
      { label: 'Evidence Coverage',  pct: evidencePct,   detail: `${evidenceCovered} of ${totalInds} indicators` },
      { label: 'Audit Checklist',    pct: checklistPct,  detail: `${checklistDone} of ${checklistTotal} items`   },
    ];

    metrics.forEach(({ label, pct, detail }) => {
      const barColor = pct >= 80 ? '#437a22' : pct >= 60 ? '#d19900' : '#c0392b';
      const bRgb = hexToRgb(barColor);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 26, 26);
      doc.text(label, 15, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text(detail, 195, y, { align: 'right' });
      doc.setTextColor(26, 26, 26);
      y += 3;
      doc.setFillColor(230, 230, 230);
      doc.rect(15, y, 155, 5, 'F');
      doc.setFillColor(bRgb.r, bRgb.g, bRgb.b);
      doc.rect(15, y, 155 * (pct / 100), 5, 'F');
      doc.setTextColor(bRgb.r, bRgb.g, bRgb.b);
      doc.setFontSize(8);
      doc.text(`${pct}%`, 175, y + 4);
      doc.setTextColor(26, 26, 26);
      y += 13;
    });

    y += 4;

    // Checklist breakdown by category
    if (checklistTotal > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Audit Checklist', 15, y); y += 7;
      doc.setFont('helvetica', 'normal');

      // Group by category
      const byCategory = new Map<string, ChecklistItem[]>();
      for (const item of (checklist || [])) {
        const cat = item.category || 'General';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(item);
      }

      for (const [cat, items] of byCategory) {
        if (y > 255) { doc.addPage(); y = addPageHeader(doc, schoolName, 'Audit Readiness'); }

        const catDone = items.filter((i) => i.is_completed).length;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(247, 246, 242);
        doc.rect(15, y, 180, 7, 'F');
        doc.text(`${cat.charAt(0).toUpperCase()}${cat.slice(1)}`, 17, y + 5);
        doc.setTextColor(107, 114, 128);
        doc.text(`${catDone}/${items.length}`, 191, y + 5, { align: 'right' });
        doc.setTextColor(26, 26, 26);
        doc.setFont('helvetica', 'normal');
        y += 10;

        items.forEach((item) => {
          if (y > 270) { doc.addPage(); y = addPageHeader(doc, schoolName, 'Audit Readiness'); }
          const tick = item.is_completed;
          const tRgb = tick ? hexToRgb('#437a22') : hexToRgb('#c0392b');
          doc.setTextColor(tRgb.r, tRgb.g, tRgb.b);
          doc.setFontSize(8);
          doc.text(tick ? '✓' : '✗', 17, y);
          doc.setTextColor(tick ? 107 : 26, tick ? 114 : 26, tick ? 128 : 26);
          const titleLine = doc.splitTextToSize(item.title, 168)[0];
          doc.text(titleLine, 23, y);
          doc.setTextColor(26, 26, 26);
          doc.setDrawColor(240, 240, 240);
          doc.line(15, y + 3, 195, y + 3);
          y += 6;
        });
        y += 3;
      }
    }

    doc.save(`Audit-Readiness-${schoolName.replace(/\s+/g, '-')}.pdf`);
  };

  // ── Ministry Excel (existing) ─────────────────────────────────────────────

  const generateMinistryExcel = async () => {
    if (!school) return;
    const { data: years, error } = await supabase
      .from('academic_years')
      .select('id, label')
      .eq('school_id', school.id)
      .order('start_date', { ascending: false })
      .limit(3);
    if (error) throw error;
    if (!years?.length) throw new Error('No academic years found');

    const blob = await exportMinistryMasteryExcel(
      school.id,
      school.name_ar ?? school.name_en,
      years as { id: string; label: string }[],
      ministrySemester,
      supabase,
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `نسب-الإتقان-${school.name_en.replace(/\s+/g, '-')}-${academicYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Dispatch ──────────────────────────────────────────────────────────────

  const handleDownload = async (reportId: string) => {
    if (reportId === 'kpi-trend') {
      setKpiModalOpen(true);
      return;
    }
    setGenerating(reportId);
    try {
      if      (reportId === 'executive')          generateExecutive();
      else if (reportId === 'evidence-coverage')  generateEvidenceCoverage();
      else if (reportId === 'improvement-status') generateImprovementPlan();
      else if (reportId === 'ministry-mastery')   await generateMinistryExcel();
      else if (reportId === 'domain-deep')        generateDomainDeep();
      else if (reportId === 'full-sed')           generateFullSED();
      else if (reportId === 'audit-readiness')    generateAuditReadiness();
    } finally {
      setGenerating(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Ministry Mastery Rate Report */}
        <Card className="hover:border-[#01696f] transition-colors">
          <CardContent className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-[#01696f]/10">
                <FileSpreadsheet className="h-5 w-5 text-[#01696f]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1a1a1a] font-sans">Ministry Mastery Rate Report</h3>
                <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">
                  نسب الإتقان — Ministry-format Excel workbook with 3-year data and cohort tracking
                </p>
              </div>
            </div>
            <div className="flex gap-1 mb-3">
              {(['semester_1', 'semester_2', 'annual'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setMinistrySemester(s)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    ministrySemester === s
                      ? 'bg-[#01696f] text-white border-[#01696f]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#01696f]'
                  }`}
                >
                  {s === 'semester_1' ? 'Semester 1' : s === 'semester_2' ? 'Semester 2' : 'Annual'}
                </button>
              ))}
            </div>
            <Button
              variant="default"
              size="sm"
              className="w-full gap-2"
              disabled={generating === 'ministry-mastery'}
              onClick={() => handleDownload('ministry-mastery')}
            >
              {generating === 'ministry-mastery'
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                : <><Download className="h-3.5 w-3.5" /> Download Excel</>}
            </Button>
          </CardContent>
        </Card>

        {/* All other report cards */}
        {reports.map((report) => {
          const Icon = report.icon;
          const isGenerating = generating === report.id;
          return (
            <Card key={report.id} className="hover:border-[#01696f] transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-[#01696f]/10">
                    <Icon className="h-5 w-5 text-[#01696f]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1a1a1a] font-sans">{report.title}</h3>
                    <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">{report.description}</p>
                  </div>
                </div>

                {/* Domain selector — only for domain-deep */}
                {report.id === 'domain-deep' && (
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="w-full mb-3 px-2 py-1.5 text-xs border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#01696f]"
                  >
                    {Object.entries(DOMAIN_NAMES).map(([id, name]) => (
                      <option key={id} value={id}>Domain {id}: {name}</option>
                    ))}
                  </select>
                )}

                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                  disabled={isGenerating}
                  onClick={() => handleDownload(report.id)}
                >
                  {isGenerating ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                  ) : report.id === 'kpi-trend' ? (
                    <><BarChart2 className="h-3.5 w-3.5" /> View Report</>
                  ) : (
                    <><Download className="h-3.5 w-3.5" /> Download PDF</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* SED Comparison section */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <GitCompare className="h-5 w-5 text-[#01696f]" />
          <h2 className="text-base font-semibold text-gray-900">SED Comparison</h2>
          <span className="text-xs text-gray-400">Compare indicator ratings between two generated SEDs</span>
        </div>
        <SedDiffReport />
      </div>

      {/* KPI Trend modal */}
      {kpiModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setKpiModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-5xl my-8 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">KPI Trend Report</h2>
                <p className="text-xs text-gray-500 mt-0.5">Historical proficiency rates across core subjects</p>
              </div>
              <button
                onClick={() => setKpiModalOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <TrendTab />
          </div>
        </div>
      )}
    </>
  );
}
