import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, Packer,
  ShadingType, PageBreak,
} from 'npm:docx@8.5.0';

// ─── CORS ─────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Judgement helpers ────────────────────────────────────────
const J_LABELS: Record<number, string> = {
  1: 'Outstanding', 2: 'Good', 3: 'Satisfactory',
  4: 'Unsatisfactory', 5: 'Needs Urgent Intervention',
};
const J_COLORS: Record<number, string> = {
  1: '2E7D32', 2: '1565C0', 3: 'E65100', 4: 'B71C1C', 5: '4A148C',
};

const DOMAIN_NAMES: Record<string, { en: string; ar: string }> = {
  '1': { en: 'Academic Achievement',  ar: 'التحصيل الأكاديمي' },
  '2': { en: 'Personal Development',  ar: 'التنمية الشخصية' },
  '3': { en: 'Teaching and Assessment', ar: 'التدريس والتقييم' },
  '4': { en: 'School Climate',        ar: 'المناخ المدرسي' },
  '5': { en: 'Leadership and Governance', ar: 'القيادة والحوكمة' },
};

function jLabel(j: number | null | undefined): string {
  return j != null ? `${J_LABELS[j] ?? 'Unknown'} (${j})` : '—';
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ─── DOCX cell helper ─────────────────────────────────────────
function cell(
  text: string,
  opts: { bold?: boolean; shade?: boolean; width?: number; color?: string; rtl?: boolean } = {}
): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: 'E8F4F4' } : undefined,
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left:   { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right:  { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
    children: [new Paragraph({
      spacing: { before: 60, after: 60 },
      bidirectional: opts.rtl,
      children: [new TextRun({
        text,
        bold: opts.bold ?? false,
        size: 19,
        color: opts.color,
      })],
    })],
  });
}

// ─── DOCX builder ─────────────────────────────────────────────
function buildDocument(data: {
  school: Record<string, string | null>;
  academicYear: string;
  generatedAt: string;
  sedTeam: Array<{ full_name: string | null; department: string | null }>;
  indicators: Array<{
    id: string; description_en: string; description_ar: string | null;
    domain_id: string; standard_id: string; order_num: number;
  }>;
  standards: Array<{ id: string; domain_id: string; name_en: string; name_ar: string | null; order_num: number }>;
  ratings: Array<{
    indicator_id: string; rating: number | null;
    strengths: string | null; improvement_areas: string | null; next_steps: string | null;
  }>;
  evidenceCountMap: Record<string, number>;
  domainJudgements: Record<string, { judgement: number; limiting_standard: string | null }>;
  standardJudgements: Record<string, number>;
  overallJudgement: number | null;
  afis: Array<{
    title: string; status: string; due_date: string | null;
    indicator_id: string | null; domain_id: string | null;
    expected_impact: string | null; owner_name: string | null;
  }>;
  performance: Array<{ grade_label: string | null; subject: string; academic_year: string | null; proficiency_rate: number | null }>;
  attendance: Array<{ grade_label: string | null; academic_year: string | null; attendance_rate: number | null }>;
  options: { includePlan: boolean; includeQuantitative: boolean; includeSurveys: boolean; includeObservations: boolean };
}): Document {
  const { school, academicYear, generatedAt, sedTeam, indicators, standards, ratings,
          evidenceCountMap, domainJudgements, standardJudgements, overallJudgement,
          afis, performance, attendance, options } = data;

  const ratingMap = Object.fromEntries(ratings.map(r => [r.indicator_id, r]));
  const allChildren: (Paragraph | Table)[] = [];

  // ── COVER PAGE ──────────────────────────────────────────────
  allChildren.push(
    new Paragraph({
      text: 'School Self-Evaluation Document',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 },
    }),
    new Paragraph({
      spacing: { after: 120 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Prepared in accordance with the OAAAQA School Evaluation Framework (2024)', italics: true, size: 20, color: '555555' })],
    }),
    new Paragraph({
      spacing: { before: 400, after: 80 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: school.name_en ?? '—', bold: true, size: 36 })],
    }),
    new Paragraph({
      spacing: { after: 80 },
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      children: [new TextRun({ text: school.name_ar ?? '', bold: true, size: 30 })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Academic Year: ${academicYear}`, size: 24 })],
    }),
    new Paragraph({
      spacing: { after: 80 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: overallJudgement != null ? `Overall Judgement: ${jLabel(overallJudgement)}` : 'Overall Judgement: Not yet calculated',
        bold: true,
        size: 24,
        color: overallJudgement != null ? J_COLORS[overallJudgement] : '888888',
      })],
    }),
    new Paragraph({
      spacing: { after: 400 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated: ${generatedAt}`, size: 18, color: '888888' })],
    }),
  );

  // SED Team table on cover page
  if (sedTeam.length > 0) {
    allChildren.push(
      new Paragraph({
        text: 'Self-Evaluation Team',
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 120 },
      }),
    );
    allChildren.push(
      new Table({
        width: { size: 60, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cell('Name', { bold: true, shade: true, width: 60 }),
              cell('Role / Department', { bold: true, shade: true, width: 40 }),
            ],
          }),
          ...sedTeam.map(m => new TableRow({
            children: [
              cell(m.full_name ?? '—', { width: 60 }),
              cell(m.department ?? '—', { width: 40 }),
            ],
          })),
        ],
      })
    );
  }

  // Page break after cover
  allChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // ── SECTION 1: School Profile ────────────────────────────────
  allChildren.push(
    new Paragraph({ text: 'Section 1: School Profile', heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 } })
  );
  const profileRows = [
    ['School Name (EN)', school.name_en ?? '—'],
    ['School Name (AR)', school.name_ar ?? '—'],
    ['School Type',       school.school_type ?? '—'],
    ['Governorate',       school.governorate ?? '—'],
    ['Education Cycle',   school.education_cycle ?? '—'],
    ['OAAAQA Code',       school.oaaaqa_code ?? '—'],
    ['Academic Year',     academicYear],
    ['Overall Judgement', overallJudgement != null ? jLabel(overallJudgement) : '—'],
    ['Document Generated', generatedAt],
  ];
  allChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: profileRows.map(([label, value]) =>
        new TableRow({ children: [cell(label, { bold: true, shade: true, width: 30 }), cell(value, { width: 70 })] })
      ),
    })
  );

  // ── SECTIONS 2–6: Domains ────────────────────────────────────
  const domains = ['1', '2', '3', '4', '5'];
  for (let di = 0; di < domains.length; di++) {
    const domainId = domains[di];
    const domainInfo = DOMAIN_NAMES[domainId];
    const domainJudge = domainJudgements[domainId] ?? null;
    const limitingStd = domainJudge?.limiting_standard ?? null;
    const domainIndicators = indicators.filter(i => i.domain_id === domainId);
    const domainStandards = standards.filter(s => s.domain_id === domainId).sort((a, b) => a.order_num - b.order_num);

    allChildren.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({ text: `Section ${di + 2}: Domain ${domainId} — ${domainInfo.en}`, bold: true }),
          new TextRun({ text: `  ·  Judgement: ${jLabel(domainJudge?.judgement)}`, color: domainJudge?.judgement != null ? J_COLORS[domainJudge.judgement] : '888888' }),
        ],
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: domainInfo.ar, size: 20, color: '555555' })],
        bidirectional: true,
      }),
    );

    if (limitingStd) {
      allChildren.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: `⚠ Limiting Standard: ${limitingStd} — this standard constrained the domain judgement.`, italics: true, size: 19, color: 'B71C1C' })],
        })
      );
    }

    if (domainStandards.length === 0) {
      allChildren.push(new Paragraph({ text: 'No standards defined for this domain.', spacing: { after: 120 } }));
      continue;
    }

    for (const std of domainStandards) {
      const stdJudgement = standardJudgements[std.id] ?? null;
      const stdIndicators = domainIndicators
        .filter(i => i.standard_id === std.id)
        .sort((a, b) => a.order_num - b.order_num);

      allChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 100 },
          children: [
            new TextRun({ text: `${std.id}: ${std.name_en}`, bold: true }),
            stdJudgement != null
              ? new TextRun({ text: `  [${jLabel(stdJudgement)}]`, color: J_COLORS[stdJudgement] ?? '555555' })
              : new TextRun({ text: '' }),
          ],
        }),
      );

      if (stdIndicators.length === 0) {
        allChildren.push(new Paragraph({ text: 'No indicators for this standard.', spacing: { after: 80 } }));
        continue;
      }

      allChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                cell('Code', { bold: true, shade: true, width: 8 }),
                cell('Description (EN)', { bold: true, shade: true, width: 22 }),
                cell('Description (AR)', { bold: true, shade: true, width: 20 }),
                cell('Rating', { bold: true, shade: true, width: 12 }),
                cell('Evidence', { bold: true, shade: true, width: 7 }),
                cell('Strengths / Notes', { bold: true, shade: true, width: 16 }),
                cell('Next Steps', { bold: true, shade: true, width: 15 }),
              ],
            }),
            ...stdIndicators.map(ind => {
              const r = ratingMap[ind.id];
              const evCount = evidenceCountMap[ind.id] ?? 0;
              const ratingVal = r?.rating ?? null;
              return new TableRow({
                children: [
                  cell(ind.id, { bold: true, width: 8 }),
                  cell(ind.description_en, { width: 22 }),
                  cell(ind.description_ar ?? '—', { width: 20, rtl: true }),
                  cell(ratingVal != null ? J_LABELS[ratingVal] ?? '—' : 'Not rated', {
                    width: 12,
                    color: ratingVal != null ? J_COLORS[ratingVal] : '888888',
                    bold: ratingVal != null,
                  }),
                  cell(evCount > 0 ? `${evCount} file${evCount > 1 ? 's' : ''}` : '—', { width: 7 }),
                  cell(r?.strengths ?? (r?.improvement_areas ? '' : '—'), { width: 16 }),
                  cell(r?.next_steps ?? '—', { width: 15 }),
                ],
              });
            }),
          ],
        })
      );
    }
  }

  // ── SECTION 7: Improvement Plan ──────────────────────────────
  if (options.includePlan) {
    allChildren.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ text: 'Section 7: Improvement Plan Summary', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }),
    );
    if (afis.length === 0) {
      allChildren.push(new Paragraph({ text: 'No Areas for Improvement recorded for this academic year.', spacing: { after: 120 } }));
    } else {
      allChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                cell('Title', { bold: true, shade: true, width: 32 }),
                cell('Indicator', { bold: true, shade: true, width: 10 }),
                cell('Status', { bold: true, shade: true, width: 12 }),
                cell('Due Date', { bold: true, shade: true, width: 12 }),
                cell('Owner', { bold: true, shade: true, width: 14 }),
                cell('Expected Impact', { bold: true, shade: true, width: 20 }),
              ],
            }),
            ...afis.map(afi =>
              new TableRow({
                children: [
                  cell(afi.title, { width: 32 }),
                  cell(afi.indicator_id ?? afi.domain_id ?? '—', { width: 10 }),
                  cell(afi.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), { width: 12 }),
                  cell(afi.due_date ? new Date(afi.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—', { width: 12 }),
                  cell(afi.owner_name ?? '—', { width: 14 }),
                  cell(afi.expected_impact ?? '—', { width: 20 }),
                ],
              })
            ),
          ],
        })
      );
    }
  }

  // ── SECTION 8: Quantitative Annex ────────────────────────────
  if (options.includeQuantitative) {
    allChildren.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ text: 'Section 8: Quantitative Annex', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }),
    );

    // Student performance
    allChildren.push(new Paragraph({ text: '8.1 Student Proficiency Rates', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
    if (performance.length === 0) {
      allChildren.push(new Paragraph({ text: 'No student performance data recorded for this academic year.', spacing: { after: 120 } }));
    } else {
      const subjects = [...new Set(performance.map(p => p.subject))].sort();
      const grades   = [...new Set(performance.map(p => p.grade_label ?? ''))].sort();
      allChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                cell('Grade', { bold: true, shade: true, width: 15 }),
                ...subjects.map(s => cell(s, { bold: true, shade: true, width: Math.floor(85 / subjects.length) })),
              ],
            }),
            ...grades.map(grade =>
              new TableRow({
                children: [
                  cell(grade || '—', { bold: true, width: 15 }),
                  ...subjects.map(subject => {
                    const perf = performance.find(p => p.grade_label === grade && p.subject === subject);
                    return cell(perf?.proficiency_rate != null ? `${perf.proficiency_rate}%` : '—', {
                      width: Math.floor(85 / subjects.length),
                    });
                  }),
                ],
              })
            ),
          ],
        })
      );
    }

    // Attendance
    allChildren.push(new Paragraph({ text: '8.2 Attendance Rates', heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 } }));
    if (attendance.length === 0) {
      allChildren.push(new Paragraph({ text: 'No attendance records for this academic year.', spacing: { after: 120 } }));
    } else {
      allChildren.push(
        new Table({
          width: { size: 60, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                cell('Grade', { bold: true, shade: true, width: 50 }),
                cell('Attendance Rate', { bold: true, shade: true, width: 50 }),
              ],
            }),
            ...attendance.sort((a, b) => (a.grade_label ?? '').localeCompare(b.grade_label ?? '')).map(rec =>
              new TableRow({
                children: [
                  cell(rec.grade_label ?? '—', { width: 50 }),
                  cell(rec.attendance_rate != null ? `${rec.attendance_rate}%` : '—', { width: 50 }),
                ],
              })
            ),
          ],
        })
      );
    }
  }

  // ── SECTION 9: Survey Results ────────────────────────────────
  if (options.includeSurveys) {
    allChildren.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ text: 'Section 9: Survey Results Annex', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }),
      new Paragraph({ text: 'Survey data collection is not yet available in this system version. This section will be populated once survey templates are configured and responses collected.', spacing: { after: 120 }, children: [new TextRun({ text: 'Survey data collection is not yet available in this system version. This section will be populated once survey templates are configured and responses collected.', italics: true, color: '888888', size: 19 })] }),
    );
  }

  // ── Footer ────────────────────────────────────────────────────
  allChildren.push(
    new Paragraph({
      spacing: { before: 480 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `Generated by Madrasa Comply on ${generatedAt} · OAAAQA School Self-Evaluation Framework (2024)`,
        italics: true, size: 17, color: 'AAAAAA',
      })],
    })
  );

  return new Document({
    creator: 'Madrasa Comply',
    title: `School Self-Evaluation Document — ${academicYear}`,
    description: 'Generated by Madrasa Comply for OAAAQA submission',
    sections: [{ children: allChildren }],
  });
}

// ─── Main handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Verify JWT
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Missing authorization token' }, 401);

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Invalid or expired token' }, 401);

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 2. Parse body
    const body = await req.json() as {
      schoolId: string;
      academicYearId: string;
      options?: { includePlan?: boolean; includeQuantitative?: boolean; includeSurveys?: boolean; includeObservations?: boolean };
    };
    const { schoolId, academicYearId } = body;
    const opts = {
      includePlan:          body.options?.includePlan          ?? true,
      includeQuantitative:  body.options?.includeQuantitative  ?? true,
      includeSurveys:       body.options?.includeSurveys       ?? true,
      includeObservations:  body.options?.includeObservations  ?? true,
    };

    if (!schoolId || !academicYearId) return json({ error: 'schoolId and academicYearId are required' }, 400);

    // 3. Role check
    const [memberRes, profileRes] = await Promise.all([
      svc.from('school_members').select('role').eq('user_id', user.id).eq('school_id', schoolId).eq('status', 'active').maybeSingle(),
      svc.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
    ]);
    const adminRoles = ['school_admin', 'principal', 'vice_principal', 'quality_coordinator', 'senior_management'];
    if (profileRes.data?.is_super_admin !== true && !adminRoles.includes(memberRes.data?.role ?? '')) {
      return json({ error: 'Forbidden: school_admin role required to generate SED' }, 403);
    }

    // 4. Parallel data queries
    const [
      schoolRes, ratingsRes, indicatorsRes, standardsRes,
      domainJRes, stdJRes, overallJRes, membersRes, evidenceRes,
    ] = await Promise.all([
      svc.from('schools').select('name_en, name_ar, school_type, governorate, education_cycle, oaaaqa_code').eq('id', schoolId).single(),
      svc.from('indicator_ratings').select('indicator_id, rating, strengths, improvement_areas, next_steps').eq('school_id', schoolId).eq('academic_year', academicYearId),
      svc.from('indicators').select('id, description_en, description_ar, domain_id, standard_id, order_num').order('domain_id').order('order_num'),
      svc.from('standards').select('id, domain_id, name_en, name_ar, order_num').order('domain_id').order('order_num'),
      svc.from('domain_judgements').select('domain_id, judgement, limiting_standard').eq('school_id', schoolId).eq('academic_year', academicYearId),
      svc.from('standard_judgements').select('standard_id, judgement').eq('school_id', schoolId).eq('academic_year', academicYearId),
      svc.from('overall_judgements').select('judgement').eq('school_id', schoolId).eq('academic_year', academicYearId).maybeSingle(),
      svc.from('school_members').select('profiles(full_name, department, is_sed_team)').eq('school_id', schoolId).eq('status', 'active'),
      svc.from('evidence_indicator_links').select('indicator_id').eq('school_id', schoolId),
    ]);

    if (schoolRes.error) return json({ error: `School not found: ${schoolRes.error.message}` }, 404);

    // Conditional queries
    let afisRaw: Array<{ title: string; status: string; due_date: string | null; indicator_id: string | null; domain_id: string | null; expected_impact: string | null; owner_name: string | null }> = [];
    let perfRaw: Array<{ grade_label: string | null; subject: string; academic_year: string | null; proficiency_rate: number | null }> = [];
    let attendRaw: Array<{ grade_label: string | null; academic_year: string | null; attendance_rate: number | null }> = [];

    if (opts.includePlan) {
      const { data: afisData } = await svc
        .from('action_items')
        .select('title, status, due_date, indicator_id, domain_id, expected_impact, owner:profiles!action_items_owner_id_fkey(full_name)')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYearId)
        .eq('is_archived', false)
        .order('created_at');
      afisRaw = (afisData ?? []).map((a: Record<string, unknown>) => {
        const ownerProf = Array.isArray(a.owner) ? a.owner[0] : a.owner;
        return {
          title:           a.title as string,
          status:          a.status as string,
          due_date:        a.due_date as string | null,
          indicator_id:    a.indicator_id as string | null,
          domain_id:       a.domain_id as string | null,
          expected_impact: a.expected_impact as string | null,
          owner_name:      (ownerProf as { full_name?: string | null } | null)?.full_name ?? null,
        };
      });
    }

    if (opts.includeQuantitative) {
      const [perfRes, attendRes] = await Promise.all([
        svc.from('student_performance').select('grade_label, subject, academic_year, proficiency_rate').eq('school_id', schoolId).eq('academic_year', academicYearId).order('grade_label').order('subject'),
        svc.from('attendance_records').select('grade_label, academic_year, attendance_rate').eq('school_id', schoolId).eq('academic_year', academicYearId).order('grade_label'),
      ]);
      perfRaw  = (perfRes.data ?? []) as typeof perfRaw;
      attendRaw = (attendRes.data ?? []) as typeof attendRaw;
    }

    // Build lookup maps
    const domainJudgements: Record<string, { judgement: number; limiting_standard: string | null }> = {};
    for (const row of domainJRes.data ?? []) {
      domainJudgements[row.domain_id] = { judgement: row.judgement, limiting_standard: row.limiting_standard ?? null };
    }
    const standardJudgements: Record<string, number> = {};
    for (const row of stdJRes.data ?? []) {
      standardJudgements[row.standard_id] = row.judgement;
    }
    const evidenceCountMap: Record<string, number> = {};
    for (const link of evidenceRes.data ?? []) {
      evidenceCountMap[link.indicator_id] = (evidenceCountMap[link.indicator_id] ?? 0) + 1;
    }
    const sedTeam = (membersRes.data ?? [])
      .map((m: Record<string, unknown>) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return p as { full_name: string | null; department: string | null; is_sed_team: boolean } | null;
      })
      .filter((p): p is { full_name: string | null; department: string | null; is_sed_team: boolean } =>
        p !== null && p.is_sed_team === true
      );

    // 5. Build DOCX
    const generatedAt = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat',
    });

    const doc = buildDocument({
      school:             schoolRes.data as Record<string, string | null>,
      academicYear:       academicYearId,
      generatedAt,
      sedTeam,
      indicators:         (indicatorsRes.data ?? []) as typeof doc extends Document ? never : Parameters<typeof buildDocument>[0]['indicators'],
      standards:          (standardsRes.data ?? []) as Parameters<typeof buildDocument>[0]['standards'],
      ratings:            (ratingsRes.data ?? []) as Parameters<typeof buildDocument>[0]['ratings'],
      evidenceCountMap,
      domainJudgements,
      standardJudgements,
      overallJudgement:   overallJRes.data?.judgement ?? null,
      afis:               afisRaw,
      performance:        perfRaw,
      attendance:         attendRaw,
      options:            opts,
    });

    const buffer  = await Packer.toBuffer(doc);
    const uint8   = new Uint8Array(buffer);
    const timestamp = Date.now();
    const fileName  = `SED_${academicYearId.replace(/\//g, '-')}_${timestamp}.docx`;
    const filePath  = `${schoolId}/${academicYearId.replace(/\//g, '-')}/${fileName}`;

    // 6. Upload to Storage
    const { error: uploadErr } = await svc.storage
      .from('sed-documents')
      .upload(filePath, uint8, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });
    if (uploadErr) return json({ error: `Upload failed: ${uploadErr.message}` }, 500);

    // 7. Insert into sed_documents
    await svc.from('sed_documents').insert({
      school_id:                  schoolId,
      academic_year:              academicYearId,
      file_path:                  filePath,
      generated_by:               user.id,
      generated_at:               new Date().toISOString(),
      overall_judgement_snapshot: overallJRes.data?.judgement ?? null,
      file_size_bytes:            uint8.byteLength,
    });

    // 8. Signed URL (1 hour)
    const { data: signedData, error: signedErr } = await svc.storage
      .from('sed-documents')
      .createSignedUrl(filePath, 3600);
    if (signedErr || !signedData?.signedUrl) return json({ error: 'Failed to create signed URL' }, 500);

    return json({ signedUrl: signedData.signedUrl, fileName });

  } catch (err) {
    console.error('[generate-sed] Unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});
