import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, Minus, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';

// ─── Types ────────────────────────────────────────────────────

interface SedDoc {
  id: string;
  academic_year: string;
  generated_at: string;
  overall_judgement_snapshot: number | null;
}

interface IndicatorMeta {
  id: string;
  description_en: string;
  domain_id: string;
}

interface RatingRow {
  indicator_id: string;
  rating: number | null;
}

interface DiffRow {
  indicator_id: string;
  label: string;
  domain_id: string;
  ratingA: number | null;
  ratingB: number | null;
  change: 'improved' | 'declined' | 'same' | 'new_in_b' | 'removed';
}

const JUDGEMENT_LABELS: Record<number, string> = {
  1: 'Outstanding', 2: 'Good', 3: 'Satisfactory', 4: 'Unsatisfactory', 5: 'Needs Urgent Intervention',
};

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement', '2': 'Personal Development',
  '3': 'Teaching & Assessment', '4': 'School Climate', '5': 'Leadership & Governance',
};

// ─── Hooks ────────────────────────────────────────────────────

function useSedDocuments() {
  const { school } = useSchoolStore();
  return useQuery({
    queryKey: ['sed-documents-all', school?.id],
    queryFn: async () => {
      if (!school) return [] as SedDoc[];
      const { data } = await supabase
        .from('sed_documents')
        .select('id, academic_year, generated_at, overall_judgement_snapshot')
        .eq('school_id', school.id)
        .order('generated_at', { ascending: false });
      return (data ?? []) as SedDoc[];
    },
    enabled: !!school,
  });
}

function useIndicators() {
  return useQuery({
    queryKey: ['indicators-diff'],
    queryFn: async () => {
      const { data } = await supabase
        .from('indicators')
        .select('id, description_en, domain_id')
        .order('order_num');
      return (data ?? []) as IndicatorMeta[];
    },
    staleTime: 1000 * 60 * 60,
  });
}

function useRatingsForYear(schoolId: string | undefined, academicYear: string | undefined) {
  return useQuery({
    queryKey: ['ratings-diff', schoolId, academicYear],
    queryFn: async () => {
      if (!schoolId || !academicYear) return [] as RatingRow[];
      const { data } = await supabase
        .from('indicator_ratings')
        .select('indicator_id, rating')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear);
      return (data ?? []) as RatingRow[];
    },
    enabled: !!schoolId && !!academicYear,
  });
}

// ─── Diff calculation ─────────────────────────────────────────

function buildDiff(
  indicators: IndicatorMeta[],
  ratingsA: RatingRow[],
  ratingsB: RatingRow[],
): DiffRow[] {
  const mapA = Object.fromEntries(ratingsA.map(r => [r.indicator_id, r.rating]));
  const mapB = Object.fromEntries(ratingsB.map(r => [r.indicator_id, r.rating]));
  const allIds = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);

  return indicators
    .filter(i => allIds.has(i.id))
    .map(i => {
      const rA = mapA[i.id] ?? null;
      const rB = mapB[i.id] ?? null;
      let change: DiffRow['change'];
      if (rA === null && rB !== null) change = 'new_in_b';
      else if (rA !== null && rB === null) change = 'removed';
      else if (rA === rB) change = 'same';
      // Lower rating = better in OAAAQA (1=Outstanding)
      else if (rA !== null && rB !== null && rB < rA) change = 'improved';
      else change = 'declined';
      return { indicator_id: i.id, label: i.description_en, domain_id: i.domain_id, ratingA: rA, ratingB: rB, change };
    });
}

// ─── Component ────────────────────────────────────────────────

export function SedDiffReport() {
  const { school } = useSchoolStore();
  const [sedAId, setSedAId] = useState('');
  const [sedBId, setSedBId] = useState('');
  const [compared, setCompared] = useState(false);

  const { data: seds = [] } = useSedDocuments();
  const { data: indicators = [] } = useIndicators();

  const sedA = seds.find(s => s.id === sedAId);
  const sedB = seds.find(s => s.id === sedBId);

  const { data: ratingsA = [] } = useRatingsForYear(school?.id, compared ? sedA?.academic_year : undefined);
  const { data: ratingsB = [] } = useRatingsForYear(school?.id, compared ? sedB?.academic_year : undefined);

  const diff = compared && sedA && sedB ? buildDiff(indicators, ratingsA, ratingsB) : [];

  const improved  = diff.filter(d => d.change === 'improved').length;
  const declined  = diff.filter(d => d.change === 'declined').length;
  const unchanged = diff.filter(d => d.change === 'same').length;

  function handleCompare() {
    if (sedAId && sedBId && sedAId !== sedBId) setCompared(true);
  }

  function handleExport() {
    if (!diff.length || !school) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    let y = 10;

    doc.setFillColor(1, 105, 111);
    doc.rect(0, 0, 297, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(`${school.name_en} — SED Comparison: ${sedA?.academic_year} vs ${sedB?.academic_year}`, 10, 10);
    doc.setTextColor(26, 26, 26);
    y = 24;

    // Summary
    doc.setFontSize(9);
    doc.setTextColor(34, 197, 94);
    doc.text(`${improved} Improved`, 10, y);
    doc.setTextColor(239, 68, 68);
    doc.text(`${declined} Declined`, 50, y);
    doc.setTextColor(107, 114, 128);
    doc.text(`${unchanged} Unchanged`, 90, y);
    doc.setTextColor(26, 26, 26);
    y += 8;

    // Table header
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(243, 244, 246);
    doc.rect(10, y, 277, 7, 'F');
    doc.text('Domain', 12, y + 5);
    doc.text('Indicator', 35, y + 5);
    doc.text(sedA?.academic_year ?? 'SED A', 195, y + 5);
    doc.text(sedB?.academic_year ?? 'SED B', 225, y + 5);
    doc.text('Change', 260, y + 5);
    y += 10;
    doc.setFont('helvetica', 'normal');

    for (const row of diff) {
      if (y > 185) { doc.addPage(); y = 10; }
      const domainLabel = `D${row.domain_id}`;
      const indicatorShort = row.label.length > 80 ? row.label.slice(0, 77) + '…' : row.label;
      const rALabel = row.ratingA != null ? `${row.ratingA} ${JUDGEMENT_LABELS[row.ratingA] ?? ''}` : '—';
      const rBLabel = row.ratingB != null ? `${row.ratingB} ${JUDGEMENT_LABELS[row.ratingB] ?? ''}` : '—';
      const changeLabel =
        row.change === 'improved'  ? '↑ Improved'  :
        row.change === 'declined'  ? '↓ Declined'  :
        row.change === 'same'      ? '→ Same'      :
        row.change === 'new_in_b'  ? 'New'         : 'Removed';

      if (row.change === 'improved')      doc.setTextColor(34, 197, 94);
      else if (row.change === 'declined') doc.setTextColor(239, 68, 68);
      else                               doc.setTextColor(107, 114, 128);

      doc.text(domainLabel, 12, y);
      doc.setTextColor(26, 26, 26);
      doc.text(indicatorShort, 35, y, { maxWidth: 155 });
      doc.text(rALabel, 195, y);
      doc.text(rBLabel, 225, y);
      if (row.change === 'improved')      doc.setTextColor(34, 197, 94);
      else if (row.change === 'declined') doc.setTextColor(239, 68, 68);
      else                               doc.setTextColor(107, 114, 128);
      doc.text(changeLabel, 260, y);
      doc.setTextColor(26, 26, 26);
      y += 7;
    }

    doc.save(`sed-comparison-${sedA?.academic_year}-vs-${sedB?.academic_year}.pdf`);
  }

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Compare Two SEDs</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 shrink-0">Compare</label>
            <select
              value={sedAId}
              onChange={e => { setSedAId(e.target.value); setCompared(false); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
            >
              <option value="">Select SED…</option>
              {seds.map(s => (
                <option key={s.id} value={s.id} disabled={s.id === sedBId}>
                  {s.academic_year} — {new Date(s.generated_at).toLocaleDateString('en-GB')}
                </option>
              ))}
            </select>
          </div>

          <span className="text-sm text-gray-400">with</span>

          <div className="flex items-center gap-2">
            <select
              value={sedBId}
              onChange={e => { setSedBId(e.target.value); setCompared(false); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#01696f]"
            >
              <option value="">Select SED…</option>
              {seds.map(s => (
                <option key={s.id} value={s.id} disabled={s.id === sedAId}>
                  {s.academic_year} — {new Date(s.generated_at).toLocaleDateString('en-GB')}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCompare}
            disabled={!sedAId || !sedBId || sedAId === sedBId}
            className="px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Compare
          </button>

          {seds.length === 0 && (
            <p className="text-sm text-gray-400">No SEDs generated yet for this school.</p>
          )}
        </div>
      </div>

      {/* Results */}
      {compared && diff.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Summary bar */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
                <ArrowUp className="h-3.5 w-3.5" /> {improved} improved
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 px-3 py-1 rounded-full">
                <ArrowDown className="h-3.5 w-3.5" /> {declined} declined
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                <Minus className="h-3.5 w-3.5" /> {unchanged} unchanged
              </span>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export PDF
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Domain</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Indicator</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{sedA?.academic_year}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{sedB?.academic_year}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {diff.map(row => (
                  <tr key={row.indicator_id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="text-xs font-medium text-gray-500">
                        D{row.domain_id} · {DOMAIN_NAMES[row.domain_id] ?? ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-xs font-mono text-[#01696f] mr-1.5">{row.indicator_id}</span>
                      <span className="text-xs text-gray-700">{row.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.ratingA != null ? (
                        <span className="text-xs font-medium text-gray-700">{row.ratingA} · {JUDGEMENT_LABELS[row.ratingA]}</span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.ratingB != null ? (
                        <span className="text-xs font-medium text-gray-700">{row.ratingB} · {JUDGEMENT_LABELS[row.ratingB]}</span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.change === 'improved' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <ArrowUp className="h-3 w-3" /> Improved
                        </span>
                      )}
                      {row.change === 'declined' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                          <ArrowDown className="h-3 w-3" /> Declined
                        </span>
                      )}
                      {row.change === 'same' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          <Minus className="h-3 w-3" /> Same
                        </span>
                      )}
                      {row.change === 'new_in_b' && (
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">New</span>
                      )}
                      {row.change === 'removed' && (
                        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Removed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {compared && diff.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No shared indicators found between the selected SEDs.</p>
        </div>
      )}
    </div>
  );
}
