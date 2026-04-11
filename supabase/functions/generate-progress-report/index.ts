import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, Packer,
  ShadingType,
} from 'npm:docx@8.5.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const J_LABELS: Record<number, string> = {
  1: 'Outstanding', 2: 'Good', 3: 'Satisfactory',
  4: 'Unsatisfactory', 5: 'Needs Urgent Intervention',
};
const J_COLORS: Record<number, string> = {
  1: '2E7D32', 2: '1565C0', 3: 'E65100', 4: 'B71C1C', 5: '4A148C',
};
const DOMAIN_NAMES: Record<string, { en: string; ar: string }> = {
  '1': { en: 'Academic Achievement',       ar: 'التحصيل الأكاديمي' },
  '2': { en: 'Personal Development',       ar: 'التنمية الشخصية' },
  '3': { en: 'Teaching and Assessment',    ar: 'التدريس والتقييم' },
  '4': { en: 'School Climate',             ar: 'المناخ المدرسي' },
  '5': { en: 'Leadership and Governance',  ar: 'القيادة والحوكمة' },
};
const VISIT_TYPE_LABELS: Record<string, string> = {
  external_review: 'External Review',
  follow_up_1:      'Follow-Up Visit 1',
  follow_up_2:      'Follow-Up Visit 2',
};

function jLabel(j: number | null | undefined): string {
  return j != null ? `${J_LABELS[j] ?? 'Unknown'} (${j})` : '—';
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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
      children: [new TextRun({ text, bold: opts.bold ?? false, size: 19, color: opts.color })],
    })],
  });
}

interface DomainContent {
  actionsTaken: string;
  evidenceSummary: string;
  currentJudgement: number | null;
}

interface ContentJson {
  domains: Record<string, DomainContent>;
  summaryEn: string;
  summaryAr: string;
  submittedBy?: string;
}

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
      reviewVisitId: string;
      contentJson: ContentJson;
    };
    const { schoolId, reviewVisitId, contentJson } = body;
    if (!schoolId || !reviewVisitId || !contentJson) {
      return json({ error: 'schoolId, reviewVisitId and contentJson are required' }, 400);
    }

    // 3. Role check
    const [memberRes, profileRes] = await Promise.all([
      svc.from('school_members').select('role').eq('user_id', user.id).eq('school_id', schoolId).eq('status', 'active').maybeSingle(),
      svc.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
    ]);
    const adminRoles = ['school_admin', 'principal', 'vice_principal', 'quality_coordinator', 'senior_management'];
    if (profileRes.data?.is_super_admin !== true && !adminRoles.includes(memberRes.data?.role ?? '')) {
      return json({ error: 'Forbidden: school_admin role required' }, 403);
    }

    // 4. Fetch data
    const [schoolRes, visitRes] = await Promise.all([
      svc.from('schools').select('name_en, name_ar').eq('id', schoolId).single(),
      svc.from('review_visits').select('*').eq('id', reviewVisitId).single(),
    ]);
    if (schoolRes.error || !schoolRes.data) return json({ error: 'School not found' }, 404);
    if (visitRes.error || !visitRes.data) return json({ error: 'Review visit not found' }, 404);

    const school = schoolRes.data as { name_en: string | null; name_ar: string | null };
    const visit  = visitRes.data as {
      visit_date: string; visit_type: string; overall_judgement: number;
      followup_deadline: string | null;
    };

    // 5. Build DOCX
    const generatedAt = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat',
    });
    const visitDateFmt = new Date(visit.visit_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const allChildren: (Paragraph | Table)[] = [];

    // ── COVER ──────────────────────────────────────────────────
    allChildren.push(
      new Paragraph({
        text: 'Annex 4: Progress Report',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { before: 800, after: 200 },
      }),
      new Paragraph({
        spacing: { after: 80 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: 'Following External Quality Review — OAAAQA School Evaluation Framework (2024)',
          italics: true, size: 20, color: '555555',
        })],
      }),
      new Paragraph({
        spacing: { before: 400, after: 80 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: school.name_en ?? '—', bold: true, size: 36 })],
      }),
    );
    if (school.name_ar) {
      allChildren.push(new Paragraph({
        spacing: { after: 80 },
        alignment: AlignmentType.CENTER,
        bidirectional: true,
        children: [new TextRun({ text: school.name_ar, bold: true, size: 28 })],
      }));
    }
    allChildren.push(
      new Paragraph({
        spacing: { after: 400 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `Report Generated: ${generatedAt}`, size: 18, color: '888888' })],
      }),
    );

    // Cover table
    const coverRows = [
      ['School',                school.name_en ?? '—'],
      ['Review Visit Date',     visitDateFmt],
      ['Visit Type',            VISIT_TYPE_LABELS[visit.visit_type] ?? visit.visit_type],
      ['Original Judgement',    jLabel(visit.overall_judgement)],
      ['Follow-Up Deadline',    visit.followup_deadline
                                  ? new Date(visit.followup_deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                                  : '—'],
      ['Report Generated',      generatedAt],
      ['Submitted By',          contentJson.submittedBy ?? '—'],
    ];
    allChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: coverRows.map(([label, value]) =>
          new TableRow({ children: [cell(label, { bold: true, shade: true, width: 30 }), cell(value, { width: 70 })] })
        ),
      })
    );

    // ── DOMAIN SECTIONS ────────────────────────────────────────
    const domains = ['1', '2', '3', '4', '5'];
    allChildren.push(
      new Paragraph({
        text: 'Domain Progress Since Review',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 160 },
      })
    );

    for (const domainId of domains) {
      const info = DOMAIN_NAMES[domainId];
      const dc   = contentJson.domains?.[domainId] as DomainContent | undefined;
      const cj   = dc?.currentJudgement ?? null;

      allChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 100 },
          children: [
            new TextRun({ text: `Domain ${domainId}: ${info.en}`, bold: true }),
            cj != null
              ? new TextRun({ text: `  — Current Self-Assessed: ${jLabel(cj)}`, color: J_COLORS[cj] ?? '555555' })
              : new TextRun({ text: '' }),
          ],
        }),
        new Paragraph({
          spacing: { after: 60 },
          bidirectional: true,
          children: [new TextRun({ text: info.ar, size: 18, color: '777777' })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [cell('Actions Taken Since Review', { bold: true, shade: true, width: 30 }), cell(dc?.actionsTaken || '—', { width: 70 })] }),
            new TableRow({ children: [cell('Evidence of Improvement', { bold: true, shade: true, width: 30 }), cell(dc?.evidenceSummary || '—', { width: 70 })] }),
            new TableRow({ children: [cell('Current Self-Assessed Judgement', { bold: true, shade: true, width: 30 }), cell(cj != null ? jLabel(cj) : '—', { width: 70, color: cj != null ? J_COLORS[cj] : undefined, bold: cj != null })] }),
          ],
        })
      );
    }

    // ── OVERALL NARRATIVE ──────────────────────────────────────
    allChildren.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Overall Summary', spacing: { before: 480, after: 160 } }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Summary (English)', spacing: { before: 200, after: 80 } }),
      new Paragraph({ text: contentJson.summaryEn || '—', spacing: { after: 200 } }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'الملخص (عربي)', spacing: { before: 200, after: 80 }, bidirectional: true }),
      new Paragraph({ text: contentJson.summaryAr || '—', spacing: { after: 200 }, bidirectional: true }),
    );

    // ── FOOTER ─────────────────────────────────────────────────
    allChildren.push(
      new Paragraph({
        spacing: { before: 480 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: `Generated by Madrasa Comply on ${generatedAt} · OAAAQA School Evaluation Framework (2024)`,
          italics: true, size: 17, color: 'AAAAAA',
        })],
      })
    );

    const doc = new Document({
      creator: 'Madrasa Comply',
      title: `Progress Report — ${school.name_en ?? 'School'} — ${visitDateFmt}`,
      sections: [{ children: allChildren }],
    });

    const buffer   = await Packer.toBuffer(doc);
    const uint8    = new Uint8Array(buffer);
    const timestamp = Date.now();
    const fileName  = `ProgressReport_${timestamp}.docx`;
    const filePath  = `${schoolId}/${reviewVisitId}/${fileName}`;

    // 6. Upload to Storage
    const { error: uploadErr } = await svc.storage
      .from('progress-reports')
      .upload(filePath, uint8, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });
    if (uploadErr) return json({ error: `Upload failed: ${uploadErr.message}` }, 500);

    // 7. Upsert progress_reports record
    await svc.from('progress_reports').upsert({
      school_id:       schoolId,
      review_visit_id: reviewVisitId,
      content_json:    contentJson,
      generated_at:    new Date().toISOString(),
      file_path:       filePath,
    }, { onConflict: 'review_visit_id' });

    // 8. Signed URL
    const { data: signedData, error: signedErr } = await svc.storage
      .from('progress-reports')
      .createSignedUrl(filePath, 3600);
    if (signedErr || !signedData?.signedUrl) return json({ error: 'Failed to create signed URL' }, 500);

    return json({ signedUrl: signedData.signedUrl, fileName });

  } catch (err) {
    console.error('[generate-progress-report] Unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});
