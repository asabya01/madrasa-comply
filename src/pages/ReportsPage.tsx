import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, BarChart2, PieChart, AlertCircle, ClipboardList, TrendingUp, ShieldCheck, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useJudgements } from '../hooks/useJudgements';
import { useSchoolStore } from '../stores/schoolStore';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, ratingToPercent, type JudgementLevel } from '../lib/judgement';
import { exportMinistryMasteryExcel } from '../lib/exportMinistryExcel';

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching and Assessment',
  '4': 'School Climate and Learning Environment',
  '5': 'Leadership, Management and Governance',
};

const reports = [
  { id: 'executive', title: 'Executive Compliance Summary', description: '1-page overview of overall school judgement for the principal', icon: BarChart2 },
  { id: 'evidence-coverage', title: 'Evidence Coverage Report', description: 'Which indicators have evidence and which are missing', icon: AlertCircle },
  { id: 'improvement-status', title: 'Improvement Plan Status', description: 'Action items by status, domain and priority', icon: ClipboardList },
  { id: 'full-sed', title: 'Full Self-Evaluation Report', description: 'OAAAQA formatted document with all domains, standards and indicators', icon: FileText },
  { id: 'domain-deep', title: 'Domain Deep-Dive', description: 'Full detail for a selected domain including all indicators', icon: PieChart },
  { id: 'kpi-trend', title: 'KPI Trend Report', description: 'Historical compliance scores over time', icon: TrendingUp },
  { id: 'audit-readiness', title: 'Audit Readiness Report', description: 'Overall readiness percentage with gap analysis', icon: ShieldCheck },
];

const IMPLEMENTED = ['executive', 'evidence-coverage', 'improvement-status'];

function addPageHeader(doc: jsPDF, schoolName: string, reportTitle: string) {
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

export function ReportsPage() {
  const { school, academicYear } = useSchoolStore();
  const { judgements } = useJudgements();
  const [generating, setGenerating] = useState<string | null>(null);
  const [ministrySemester, setMinistrySemester] = useState<'semester_1' | 'semester_2' | 'annual'>('semester_1');

  const { data: indicators } = useQuery({
    queryKey: ['indicators-report'],
    queryFn: async () => {
      const { data } = await supabase.from('indicators').select('id, description_en, domain_id, standard_id').order('order_num');
      return data || [];
    },
  });

  const { data: evidenceLinks } = useQuery({
    queryKey: ['evidence-links-report', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase.from('evidence_indicator_links').select('indicator_id').eq('school_id', school.id);
      return (data || []).map((l) => l.indicator_id as string);
    },
    enabled: !!school,
  });

  const { data: actions } = useQuery({
    queryKey: ['actions-report', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase.from('action_items').select('*').eq('school_id', school.id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!school,
  });

  const generateExecutive = () => {
    const doc = new jsPDF();
    const schoolName = school?.name_en || 'School';
    let y = addPageHeader(doc, schoolName, 'Executive Summary');

    doc.setFontSize(18);
    doc.text('Executive Compliance Summary', 105, y, { align: 'center' });
    y += 12;

    // Overall judgement box
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

    // School info
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`School: ${schoolName}  |  Type: ${school?.school_type || '-'}  |  Governorate: ${school?.governorate || '-'}`, 15, y);
    doc.text(`Principal: ${school?.principal_name || '-'}  |  Students: ${(school?.total_students_male || 0) + (school?.total_students_female || 0)}  |  Teachers: ${school?.total_teachers || 0}`, 15, y + 6);
    doc.setTextColor(26, 26, 26);
    y += 16;

    // Progress bar
    doc.setFontSize(11);
    doc.text(`Indicators Rated: ${judgements?.ratedCount || 0} / ${judgements?.totalCount || 0}`, 15, y);
    const pct = judgements?.totalCount ? ((judgements.ratedCount || 0) / judgements.totalCount) : 0;
    doc.setFillColor(230, 230, 230);
    doc.rect(15, y + 3, 120, 5, 'F');
    doc.setFillColor(1, 105, 111);
    doc.rect(15, y + 3, 120 * pct, 5, 'F');
    y += 16;

    // Domain table
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

    // Summary
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

    // Missing list grouped by domain
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

    // Summary row
    doc.setFontSize(10);
    const cols = [
      { label: 'Total', value: total, bg: [247, 246, 242] as [number, number, number] },
      { label: 'Completed', value: completed, bg: [240, 247, 235] as [number, number, number] },
      { label: 'In Progress', value: inProgress, bg: [230, 242, 248] as [number,number,number] },
      { label: 'Overdue', value: overdue, bg: [255, 235, 235] as [number, number, number] },
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

    // Completion bar
    if (total > 0) {
      doc.setFontSize(10);
      doc.text(`${Math.round(completed / total * 100)}% complete`, 15, y);
      doc.setFillColor(230, 230, 230);
      doc.rect(15, y + 3, 120, 4, 'F');
      doc.setFillColor(67, 122, 34);
      doc.rect(15, y + 3, 120 * (completed / total), 4, 'F');
      y += 14;
    }

    // Items table
    doc.setFontSize(11);
    doc.text('Action Items', 15, y); y += 6;

    const statusOrder = ['overdue', 'in_progress', 'not_started', 'completed'];
    const statusLabels: Record<string, string> = { overdue: 'OVERDUE', in_progress: 'IN PROGRESS', not_started: 'NOT STARTED', completed: 'COMPLETED' };

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

  const handleDownload = async (reportId: string) => {
    setGenerating(reportId);
    try {
      if (reportId === 'executive') generateExecutive();
      else if (reportId === 'evidence-coverage') generateEvidenceCoverage();
      else if (reportId === 'improvement-status') generateImprovementPlan();
      else if (reportId === 'ministry-mastery') await generateMinistryExcel();
    } finally {
      setGenerating(null);
    }
  };

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* Ministry Mastery Rate Report */}
      <Card className="hover:border-[#01696f] transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-[#01696f]/10">
              <FileSpreadsheet className="h-5 w-5 text-[#01696f]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1a1a1a] font-sans">
                Ministry Mastery Rate Report
              </h3>
              <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">
                نسب الإتقان — Ministry-format Excel workbook with 3-year data and cohort tracking
              </p>
            </div>
          </div>
          {/* Semester selector */}
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
            {generating === 'ministry-mastery' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
            ) : (
              <><Download className="h-3.5 w-3.5" /> Download Excel</>
            )}
          </Button>
        </CardContent>
      </Card>

      {reports.map((report) => {
        const Icon = report.icon;
        const isImplemented = IMPLEMENTED.includes(report.id);
        const isGenerating = generating === report.id;
        return (
          <Card key={report.id} className={`transition-colors ${isImplemented ? 'hover:border-[#01696f]' : 'opacity-75'}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isImplemented ? 'bg-[#01696f]/10' : 'bg-gray-100'}`}>
                  <Icon className={`h-5 w-5 ${isImplemented ? 'text-[#01696f]' : 'text-[#6b7280]'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1a1a1a] font-sans">{report.title}</h3>
                  <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">{report.description}</p>
                </div>
              </div>
              <Button
                variant={isImplemented ? 'default' : 'outline'}
                size="sm"
                className="w-full gap-2"
                disabled={!isImplemented || isGenerating}
                onClick={() => handleDownload(report.id)}
              >
                {isGenerating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                ) : (
                  <><Download className="h-3.5 w-3.5" /> {isImplemented ? 'Download PDF' : 'Coming Soon'}</>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}
