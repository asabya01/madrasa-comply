import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  Packer,
  ShadingType,
} from 'npm:docx@8.5.0';

// ─── CORS ─────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Judgement labels ─────────────────────────────────────────
const JUDGEMENT_LABELS: Record<number, string> = {
  1: 'Outstanding',
  2: 'Good',
  3: 'Satisfactory',
  4: 'Requires Improvement',
  5: 'Needs Urgent Improvement',
};

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching and Assessment',
  '4': 'School Climate',
  '5': 'Leadership and Governance',
};

// ─── Helpers ──────────────────────────────────────────────────
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function judgeLabel(j: number | null | undefined): string {
  return j != null ? `${j} — ${JUDGEMENT_LABELS[j] ?? 'Unknown'}` : '—';
}

// Thin bordered table cell helper
function cell(
  text: string,
  opts: { bold?: boolean; shade?: boolean; width?: number } = {}
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
    children: [
      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text, bold: opts.bold ?? false, size: 20 })],
      }),
    ],
  });
}

// ─── DOCX builder ─────────────────────────────────────────────
function buildDocument(data: {
  school: Record<string, string | number | null>;
  academicYear: string;
  generatedAt: string;
  indicators: Array<{ id: string; description_en: string; domain_id: string; standard_id: string }>;
  ratings: Array<{ indicator_id: string; rating: number | null; strengths: string | null; improvement_areas: string | null }>;
  domainJudgements: Record<string, number>;
  overallJudgement: number | null;
  afis: Array<{ title: string; status: string; due_date: string | null; expected_impact: string | null }>;
}): Document {
  const { school, academicYear, generatedAt, indicators, ratings, domainJudgements, overallJudgement, afis } = data;

  const ratingMap = Object.fromEntries(ratings.map(r => [r.indicator_id, r]));

  // ── Section 1: School Profile ─────────────────────────────
  const section1: Paragraph[] = [
    new Paragraph({
      text: 'School Self-Evaluation Document',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: 'Prepared in accordance with the OAAAQA School Evaluation Framework (2024)', italics: true, size: 20, color: '555555' }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: 'Section 1: School Profile',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 320, after: 160 },
    }),
  ];

  const profileRows = [
    ['School Name', String(school.name_en ?? '—')],
    ['School Type', String(school.school_type ?? '—')],
    ['Governorate', String(school.governorate ?? '—')],
    ['OAAAQA Code', String(school.oaaaqa_code ?? '—')],
    ['Academic Year', academicYear],
    ['Generated', generatedAt],
    ['Overall Judgement', judgeLabel(overallJudgement)],
  ];

  const profileTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: profileRows.map(([label, value]) =>
      new TableRow({
        children: [
          cell(label, { bold: true, shade: true, width: 30 }),
          cell(value, { width: 70 }),
        ],
      })
    ),
  });

  section1.push(profileTable as unknown as Paragraph);

  // ── Section 2: Domain-by-domain results ───────────────────
  const section2: Paragraph[] = [
    new Paragraph({
      text: 'Section 2: Self-Evaluation Results',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 480, after: 160 },
    }),
  ];

  const domains = ['1', '2', '3', '4', '5'];

  for (const domainId of domains) {
    const domainName = DOMAIN_NAMES[domainId] ?? `Domain ${domainId}`;
    const domainJudgement = domainJudgements[domainId] ?? null;
    const domainIndicators = indicators.filter(i => i.domain_id === domainId);

    // Domain heading
    section2.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 120 },
        children: [
          new TextRun({ text: `Domain ${domainId}: ${domainName}`, bold: true }),
          new TextRun({ text: `  ·  Judgement: ${judgeLabel(domainJudgement)}`, color: domainJudgement != null && domainJudgement <= 2 ? '2E7D32' : domainJudgement != null && domainJudgement >= 4 ? 'C62828' : '0277BD' }),
        ],
      })
    );

    if (domainIndicators.length === 0) {
      section2.push(new Paragraph({ text: 'No indicators for this domain.', spacing: { after: 120 } }));
      continue;
    }

    // Header row
    const indTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell('Indicator', { bold: true, shade: true, width: 12 }),
            cell('Description', { bold: true, shade: true, width: 33 }),
            cell('Rating', { bold: true, shade: true, width: 10 }),
            cell('Strengths', { bold: true, shade: true, width: 22 }),
            cell('Areas for Improvement', { bold: true, shade: true, width: 23 }),
          ],
        }),
        ...domainIndicators.map(ind => {
          const r = ratingMap[ind.id];
          return new TableRow({
            children: [
              cell(ind.id, { bold: true }),
              cell(ind.description_en),
              cell(r?.rating != null ? judgeLabel(r.rating) : 'Not rated'),
              cell(r?.strengths ?? '—'),
              cell(r?.improvement_areas ?? '—'),
            ],
          });
        }),
      ],
    });

    section2.push(indTable as unknown as Paragraph);
  }

  // ── Section 3: Improvement Plan ───────────────────────────
  const section3: Paragraph[] = [
    new Paragraph({
      text: 'Section 3: Improvement Plan Summary',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 480, after: 160 },
    }),
  ];

  if (afis.length === 0) {
    section3.push(new Paragraph({ text: 'No Areas for Improvement recorded for this academic year.' }));
  } else {
    const afiTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell('Title', { bold: true, shade: true, width: 38 }),
            cell('Status', { bold: true, shade: true, width: 14 }),
            cell('Due Date', { bold: true, shade: true, width: 14 }),
            cell('Expected Impact', { bold: true, shade: true, width: 34 }),
          ],
        }),
        ...afis.map((afi, idx) =>
          new TableRow({
            children: [
              cell(`${idx + 1}. ${afi.title}`, { width: 38 }),
              cell(afi.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), { width: 14 }),
              cell(afi.due_date ? new Date(afi.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—', { width: 14 }),
              cell(afi.expected_impact ?? '—', { width: 34 }),
            ],
          })
        ),
      ],
    });
    section3.push(afiTable as unknown as Paragraph);
  }

  // ── Footer note ───────────────────────────────────────────
  section3.push(
    new Paragraph({
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Generated by Madrasa Comply on ${generatedAt} · OAAAQA School Self-Evaluation Framework (2024)`,
          italics: true,
          size: 18,
          color: '888888',
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  return new Document({
    creator: 'Madrasa Comply',
    title: `School Self-Evaluation Document — ${academicYear}`,
    description: 'Generated by Madrasa Comply for OAAAQA submission',
    sections: [{
      children: [
        ...section1,
        ...section2,
        ...section3,
      ],
    }],
  });
}

// ─── Main handler ─────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── 1. Verify JWT ──────────────────────────────────────
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Missing authorization token' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return json({ error: 'Invalid or expired token' }, 401);

    const userId = user.id;

    // Service-role client for all privileged DB / Storage operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── 2. Parse body ──────────────────────────────────────
    const body = await req.json() as { schoolId: string; academicYear: string };
    const { schoolId, academicYear } = body;
    if (!schoolId || !academicYear) {
      return json({ error: 'schoolId and academicYear are required' }, 400);
    }

    // ── 3. Role check — school_admin / principal / quality_coordinator / super_admin ──
    const [memberRes, profileRes] = await Promise.all([
      supabaseAdmin
        .from('school_members')
        .select('role')
        .eq('user_id', userId)
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .maybeSingle(),
      supabaseAdmin
        .from('profiles')
        .select('is_super_admin')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    const adminRoles = ['school_admin', 'principal', 'vice_principal', 'quality_coordinator', 'senior_management'];
    const isSuperAdmin = profileRes.data?.is_super_admin === true;
    const isSchoolAdmin = adminRoles.includes(memberRes.data?.role ?? '');

    if (!isSuperAdmin && !isSchoolAdmin) {
      return json({ error: 'Forbidden: school_admin role required to generate SED' }, 403);
    }

    // ── 4. Fetch all data in parallel ─────────────────────
    const [
      schoolRes,
      ratingsRes,
      indicatorsRes,
      domainJudgementsRes,
      overallJudgementRes,
      afisRes,
    ] = await Promise.all([
      supabaseAdmin.from('schools').select('name_en, school_type, governorate, oaaaqa_code').eq('id', schoolId).single(),
      supabaseAdmin.from('indicator_ratings').select('indicator_id, rating, strengths, improvement_areas').eq('school_id', schoolId).eq('academic_year', academicYear),
      supabaseAdmin.from('indicators').select('id, description_en, domain_id, standard_id').order('id'),
      supabaseAdmin.from('domain_judgements').select('domain_id, judgement').eq('school_id', schoolId).eq('academic_year', academicYear),
      supabaseAdmin.from('overall_judgements').select('judgement').eq('school_id', schoolId).eq('academic_year', academicYear).maybeSingle(),
      supabaseAdmin.from('action_items').select('title, status, due_date, expected_impact').eq('school_id', schoolId).eq('academic_year', academicYear).eq('is_archived', false).order('created_at'),
    ]);

    if (schoolRes.error) return json({ error: `School not found: ${schoolRes.error.message}` }, 404);

    const domainJudgements: Record<string, number> = {};
    for (const row of domainJudgementsRes.data ?? []) {
      domainJudgements[row.domain_id] = row.judgement;
    }

    // ── 5. Build DOCX ──────────────────────────────────────
    const generatedAt = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat',
    });

    const doc = buildDocument({
      school: schoolRes.data as Record<string, string | number | null>,
      academicYear,
      generatedAt,
      indicators: (indicatorsRes.data ?? []) as Array<{ id: string; description_en: string; domain_id: string; standard_id: string }>,
      ratings: (ratingsRes.data ?? []) as Array<{ indicator_id: string; rating: number | null; strengths: string | null; improvement_areas: string | null }>,
      domainJudgements,
      overallJudgement: overallJudgementRes.data?.judgement ?? null,
      afis: (afisRes.data ?? []) as Array<{ title: string; status: string; due_date: string | null; expected_impact: string | null }>,
    });

    // Convert document to buffer
    const buffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(buffer);

    // ── 6. Upload to Storage ───────────────────────────────
    const timestamp = Date.now();
    const filePath = `${schoolId}/${academicYear.replace('/', '-')}/${timestamp}.docx`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('sed-documents')
      .upload(filePath, uint8, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (uploadErr) {
      console.error('[generate-sed] Upload error:', uploadErr.message);
      return json({ error: `Upload failed: ${uploadErr.message}` }, 500);
    }

    // ── 7. Insert record into sed_documents ────────────────
    const { error: insertErr } = await supabaseAdmin
      .from('sed_documents')
      .insert({
        school_id: schoolId,
        academic_year: academicYear,
        file_path: filePath,
        generated_by: userId,
        generated_at: new Date().toISOString(),
        overall_judgement_snapshot: overallJudgementRes.data?.judgement ?? null,
        file_size_bytes: uint8.byteLength,
      });

    if (insertErr) {
      console.error('[generate-sed] DB insert error:', insertErr.message);
      // Non-fatal — file is uploaded, just log
    }

    // ── 8. Create signed URL (1 hour) ─────────────────────
    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from('sed-documents')
      .createSignedUrl(filePath, 3600);

    if (signedErr || !signedData?.signedUrl) {
      return json({ error: 'Failed to create signed URL' }, 500);
    }

    return json({
      url: signedData.signedUrl,
      filePath,
      fileSizeBytes: uint8.byteLength,
      overallJudgement: overallJudgementRes.data?.judgement ?? null,
    });

  } catch (err) {
    console.error('[generate-sed] Unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});
