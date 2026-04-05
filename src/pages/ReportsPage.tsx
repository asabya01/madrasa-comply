import { FileText, BarChart2, PieChart, AlertCircle, ClipboardList, TrendingUp, ShieldCheck, Download } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useJudgements } from '../hooks/useJudgements';
import { useSchoolStore } from '../stores/schoolStore';
import { JUDGEMENT_LABELS, type JudgementLevel } from '../lib/judgement';
import jsPDF from 'jspdf';

const reports = [
  { id: 'full-sed', title: 'Full Self-Evaluation Report', description: 'OAAAQA formatted document with all domains, standards and indicators', icon: FileText },
  { id: 'executive', title: 'Executive Compliance Summary', description: '1-page overview of overall school judgement for the principal', icon: BarChart2 },
  { id: 'domain-deep', title: 'Domain Deep-Dive', description: 'Full detail for a selected domain including all indicators', icon: PieChart },
  { id: 'evidence-coverage', title: 'Evidence Coverage Report', description: 'Which indicators have evidence and which are missing', icon: AlertCircle },
  { id: 'improvement-status', title: 'Improvement Plan Status', description: 'Action items by status, domain and priority', icon: ClipboardList },
  { id: 'kpi-trend', title: 'KPI Trend Report', description: 'Historical compliance scores over time', icon: TrendingUp },
  { id: 'audit-readiness', title: 'Audit Readiness Report', description: 'Overall readiness percentage with gap analysis', icon: ShieldCheck },
];

export function ReportsPage() {
  const { school } = useSchoolStore();
  const { judgements } = useJudgements();

  const generateExecutivePDF = () => {
    const doc = new jsPDF();
    let y = 20;

    doc.setFontSize(20);
    doc.text('Executive Compliance Summary', 20, y); y += 12;
    doc.setFontSize(12);
    doc.text(school?.name_en || 'School', 20, y); y += 7;
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, y); y += 15;

    doc.setFontSize(14);
    const overall = (judgements?.overall || 3) as JudgementLevel;
    doc.text(`Overall Judgement: ${JUDGEMENT_LABELS[overall]}`, 20, y); y += 10;
    doc.text(`Indicators Rated: ${judgements?.ratedCount || 0} / ${judgements?.totalCount || 0}`, 20, y); y += 15;

    doc.setFontSize(12);
    doc.text('Domain Judgements:', 20, y); y += 8;
    const domainNames: Record<string, string> = {
      '1': 'Academic Achievement', '2': 'Personal Development',
      '3': 'Teaching and Assessment', '4': 'School Climate',
      '5': 'Leadership and Governance',
    };
    Object.entries(domainNames).forEach(([id, name]) => {
      const level = ((judgements?.domains as Record<string, JudgementLevel> || {})[id] || 3) as JudgementLevel;
      doc.text(`  Domain ${id}: ${name} — ${JUDGEMENT_LABELS[level]}`, 20, y); y += 6;
    });

    doc.save(`Executive-Summary-${school?.name_en?.replace(/\s+/g, '-') || 'school'}.pdf`);
  };

  const handleDownload = (reportId: string) => {
    if (reportId === 'executive') generateExecutivePDF();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {reports.map((report) => {
        const Icon = report.icon;
        return (
          <Card key={report.id} className="hover:border-[#01696f] transition-colors">
            <CardContent className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-[#01696f]/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-[#01696f]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1a1a1a] font-sans">{report.title}</h3>
                  <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">{report.description}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => handleDownload(report.id)}
              >
                <Download className="h-3.5 w-3.5" />
                {report.id === 'executive' ? 'Download PDF' : 'Coming Soon'}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
