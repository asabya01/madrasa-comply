import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileDown, CheckCircle, XCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useSchoolStore } from '../stores/schoolStore';
import { useJudgements } from '../hooks/useJudgements';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel } from '../lib/judgement';

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching and Assessment',
  '4': 'School Climate and Learning Environment',
  '5': 'Leadership, Management and Governance',
};

export function SelfEvaluationPage() {
  const { school, setSchool } = useSchoolStore();
  const queryClient = useQueryClient();
  const { judgements } = useJudgements();
  const [activeTab, setActiveTab] = useState('profile');
  const [domainNarratives, setDomainNarratives] = useState<Record<string, { strengths: string; improvements: string }>>({});

  const { data: indicators } = useQuery({
    queryKey: ['indicators-all'],
    queryFn: async () => {
      const { data } = await supabase.from('indicators').select('id, domain_id, standard_id').order('order_num');
      return data || [];
    },
  });

  const { data: ratings } = useQuery({
    queryKey: ['all-ratings-eval', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase.from('indicator_ratings').select('*').eq('school_id', school.id);
      return data || [];
    },
    enabled: !!school,
  });

  const { data: evidenceLinks } = useQuery({
    queryKey: ['evidence-links-eval', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase.from('evidence_indicator_links').select('indicator_id').eq('school_id', school.id);
      return (data || []).map((l) => l.indicator_id);
    },
    enabled: !!school,
  });

  const updateSchool = useMutation({
    mutationFn: async (updates: Partial<typeof school>) => {
      if (!school) return;
      const { data, error } = await supabase.from('schools').update(updates).eq('id', school.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data && setSchool) setSchool(data);
      queryClient.invalidateQueries({ queryKey: ['school'] });
    },
  });

  const ratedSet = new Set((ratings || []).map((r) => r.indicator_id));
  const evidenceSet = new Set(evidenceLinks || []);
  const totalIndicators = (indicators || []).length;
  const ratedCount = (indicators || []).filter((i) => ratedSet.has(i.id)).length;
  const evidencedCount = (indicators || []).filter((i) => evidenceSet.has(i.id)).length;

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let y = 20;

    doc.setFontSize(18);
    doc.text('Self-Evaluation Document', 20, y);
    y += 10;
    doc.setFontSize(12);
    doc.text(`${school?.name_en || 'School'} — ${new Date().getFullYear()}`, 20, y);
    y += 10;
    doc.text(`OAAAQA School Evaluation Framework`, 20, y);
    y += 15;

    doc.setFontSize(14);
    doc.text('School Profile', 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`School Name: ${school?.name_en || '-'}`, 20, y); y += 6;
    doc.text(`Type: ${school?.school_type || '-'}`, 20, y); y += 6;
    doc.text(`Governorate: ${school?.governorate || '-'}`, 20, y); y += 6;
    doc.text(`Principal: ${school?.principal_name || '-'}`, 20, y); y += 6;
    doc.text(`Total Students: ${(school?.total_students_male || 0) + (school?.total_students_female || 0)}`, 20, y); y += 10;

    doc.setFontSize(14);
    doc.text('Overall Compliance Summary', 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Indicators Rated: ${ratedCount}/${totalIndicators}`, 20, y); y += 6;
    doc.text(`Overall Judgement: ${JUDGEMENT_LABELS[(judgements?.overall || 3) as JudgementLevel]}`, 20, y); y += 10;

    Object.entries(DOMAIN_NAMES).forEach(([id, name]) => {
      if (y > 250) { doc.addPage(); y = 20; }
      const level = ((judgements?.domains as Record<string, JudgementLevel> || {})[id] || 3) as JudgementLevel;
      doc.setFontSize(12);
      doc.text(`Domain ${id}: ${name}`, 20, y); y += 6;
      doc.setFontSize(10);
      doc.text(`  Judgement: ${JUDGEMENT_LABELS[level]}`, 20, y); y += 6;
      if (domainNarratives[id]?.strengths) {
        const lines = doc.splitTextToSize(`  Strengths: ${domainNarratives[id].strengths}`, 170);
        doc.text(lines, 20, y);
        y += lines.length * 5 + 4;
      }
      if (domainNarratives[id]?.improvements) {
        const lines = doc.splitTextToSize(`  Improvement Areas: ${domainNarratives[id].improvements}`, 170);
        doc.text(lines, 20, y);
        y += lines.length * 5 + 4;
      }
      y += 4;
    });

    doc.save(`SED-${school?.name_en?.replace(/\s+/g, '-') || 'school'}-${new Date().getFullYear()}.pdf`);
  };

  if (!school) return null;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Completeness banner */}
      <div className="flex items-center gap-6 p-4 bg-white rounded-lg border border-[#e2e0db]">
        <div className="flex items-center gap-2">
          {ratedCount === totalIndicators ? <CheckCircle className="h-5 w-5 text-[#437a22]" /> : <XCircle className="h-5 w-5 text-amber-500" />}
          <span className="text-sm"><strong>{ratedCount}/{totalIndicators}</strong> indicators rated</span>
        </div>
        <div className="flex items-center gap-2">
          {evidencedCount / totalIndicators >= 0.8 ? <CheckCircle className="h-5 w-5 text-[#437a22]" /> : <XCircle className="h-5 w-5 text-amber-500" />}
          <span className="text-sm"><strong>{evidencedCount}/{totalIndicators}</strong> have evidence</span>
        </div>
        <Button onClick={handleExportPDF} className="ml-auto gap-2">
          <FileDown className="h-4 w-4" /> Export PDF
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile">School Profile</TabsTrigger>
          {Object.entries(DOMAIN_NAMES).map(([id]) => (
            <TabsTrigger key={id} value={`domain-${id}`}>D{id}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader><CardTitle className="font-sans">School Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">School Name (English)</label>
                  <Input defaultValue={school.name_en} onBlur={(e) => updateSchool.mutate({ name_en: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Principal Name</label>
                  <Input defaultValue={school.principal_name || ''} onBlur={(e) => updateSchool.mutate({ principal_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Total Male Students</label>
                  <Input type="number" defaultValue={school.total_students_male} onBlur={(e) => updateSchool.mutate({ total_students_male: parseInt(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Total Female Students</label>
                  <Input type="number" defaultValue={school.total_students_female} onBlur={(e) => updateSchool.mutate({ total_students_female: parseInt(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-[#6b7280] block mb-1">Total Teachers</label>
                  <Input type="number" defaultValue={school.total_teachers} onBlur={(e) => updateSchool.mutate({ total_teachers: parseInt(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">Vision Statement</label>
                <Textarea defaultValue={school.vision_statement || ''} onBlur={(e) => updateSchool.mutate({ vision_statement: e.target.value })} placeholder="Our vision..." />
              </div>
              <div>
                <label className="text-xs text-[#6b7280] block mb-1">Mission Statement</label>
                <Textarea defaultValue={school.mission_statement || ''} onBlur={(e) => updateSchool.mutate({ mission_statement: e.target.value })} placeholder="Our mission..." />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {Object.entries(DOMAIN_NAMES).map(([id, name]) => {
          const level = ((judgements?.domains as Record<string, JudgementLevel> || {})[id] || 3) as JudgementLevel;
          const domainInds = (indicators || []).filter((i) => i.domain_id === id);
          const domainRated = domainInds.filter((i) => ratedSet.has(i.id)).length;
          const domainEvidenced = domainInds.filter((i) => evidenceSet.has(i.id)).length;

          return (
            <TabsContent key={id} value={`domain-${id}`}>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="font-sans">{name}</CardTitle>
                      <p className="text-xs text-[#6b7280] mt-1">
                        {domainRated}/{domainInds.length} rated · {domainEvidenced}/{domainInds.length} with evidence
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-white" style={{ backgroundColor: JUDGEMENT_COLORS[level] }}>
                      {JUDGEMENT_LABELS[level]}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-[#6b7280] block mb-1">Overall Strengths in this Domain</label>
                    <Textarea
                      value={domainNarratives[id]?.strengths || ''}
                      onChange={(e) => setDomainNarratives((prev) => ({ ...prev, [id]: { ...prev[id], strengths: e.target.value } }))}
                      placeholder="Describe the main strengths demonstrated in this domain..."
                      className="min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#6b7280] block mb-1">Overall Areas for Improvement</label>
                    <Textarea
                      value={domainNarratives[id]?.improvements || ''}
                      onChange={(e) => setDomainNarratives((prev) => ({ ...prev, [id]: { ...prev[id], improvements: e.target.value } }))}
                      placeholder="Identify the key areas that require improvement..."
                      className="min-h-[80px]"
                    />
                  </div>

                  {/* Summary table */}
                  <div>
                    <p className="text-xs font-medium text-[#6b7280] mb-2">Indicator Summary</p>
                    <div className="border border-[#e2e0db] rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-[#6b7280]">Indicator</th>
                            <th className="text-center px-3 py-2 font-medium text-[#6b7280]">Rated</th>
                            <th className="text-center px-3 py-2 font-medium text-[#6b7280]">Evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {domainInds.map((ind) => {
                            const rating = (ratings || []).find((r) => r.indicator_id === ind.id);
                            return (
                              <tr key={ind.id} className="border-t border-[#e2e0db]">
                                <td className="px-3 py-2">
                                  <span className="font-mono text-[#6b7280]">{ind.id}</span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {rating ? (
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-white text-xs" style={{ backgroundColor: JUDGEMENT_COLORS[rating.rating as JudgementLevel] }}>
                                      {JUDGEMENT_LABELS[rating.rating as JudgementLevel]}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {evidenceSet.has(ind.id) ? <CheckCircle className="h-4 w-4 text-[#437a22] mx-auto" /> : <XCircle className="h-4 w-4 text-gray-300 mx-auto" />}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
