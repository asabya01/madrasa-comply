import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel } from '../lib/judgement';
import type { Domain, Standard, Indicator, IndicatorRating, EvidenceFile } from '../types';

// ─── Types ───────────────────────────────────────────────────

interface IndicatorWithRating extends Indicator {
  rating: IndicatorRating | null;
  evidenceFiles: EvidenceFile[];
}

interface StandardWithIndicators extends Standard {
  indicators: IndicatorWithRating[];
}

interface DomainWithStandards extends Domain {
  standards: StandardWithIndicators[];
}

// ─── Component ───────────────────────────────────────────────

export default function SelfEvaluationPage() {
  const { school } = useSchoolStore();
  const [activeTab, setActiveTab] = useState('1');
  const [domains, setDomains] = useState<DomainWithStandards[]>([]);
  const [loading, setLoading] = useState(true);
  const [academicYear, setAcademicYear] = useState('2024-2025');
  const [domainNarrative, setDomainNarrative] = useState<Record<string, { strengths: string; improvements: string }>>({});

  useEffect(() => {
    if (school?.id) loadAll();
  }, [school?.id, academicYear]);

  async function loadAll() {
    if (!school?.id) return;
    setLoading(true);
    try {
      // 1. Load framework structure
      const { data: domainRows } = await supabase
        .from('domains')
        .select('*')
        .order('order_num');

      const { data: standardRows } = await supabase
        .from('standards')
        .select('*')
        .order('order_num');

      const { data: indicatorRows } = await supabase
        .from('indicators')
        .select('*')
        .order('order_num');

      // 2. Load all indicator ratings for this school + year
      const { data: ratingRows } = await supabase
        .from('indicator_ratings')
        .select('*')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);

      // 3. Load all evidence links + files for this school
      const { data: linkRows } = await supabase
        .from('evidence_indicator_links')
        .select(`
          indicator_id,
          evidence_files (
            id,
            file_name,
            file_path,
            file_type,
            description
          )
        `)
        .eq('school_id', school.id);

      // Build lookup maps
      const ratingsMap: Record<string, IndicatorRating> = {};
      for (const r of ratingRows || []) {
        ratingsMap[r.indicator_id] = r;
      }

      const evidenceMap: Record<string, EvidenceFile[]> = {};
      for (const link of linkRows || []) {
        const iid = link.indicator_id;
        if (!evidenceMap[iid]) evidenceMap[iid] = [];
        if (link.evidence_files) {
          const file = Array.isArray(link.evidence_files)
            ? link.evidence_files[0]
            : link.evidence_files;
          if (file) evidenceMap[iid].push(file as EvidenceFile);
        }
      }

      // Assemble tree
      const domainsWithData: DomainWithStandards[] = (domainRows || []).map(domain => ({
        ...domain,
        standards: (standardRows || [])
          .filter(s => s.domain_id === domain.id)
          .map(standard => ({
            ...standard,
            indicators: (indicatorRows || [])
              .filter(i => i.standard_id === standard.id)
              .map(indicator => ({
                ...indicator,
                rating: ratingsMap[indicator.id] ?? null,
                evidenceFiles: evidenceMap[indicator.id] ?? [],
              })),
          })),
      }));

      setDomains(domainsWithData);
    } finally {
      setLoading(false);
    }
  }

  // Compute completion stats for a domain
  function domainStats(d: DomainWithStandards) {
    const allIndicators = d.standards.flatMap(s => s.indicators);
    const rated = allIndicators.filter(i => i.rating?.rating != null).length;
    const withEvidence = allIndicators.filter(i => i.evidenceFiles.length > 0).length;
    return { total: allIndicators.length, rated, withEvidence };
  }

  // Overall stats
  const allIndicators = domains.flatMap(d => d.standards.flatMap(s => s.indicators));
  const totalRated = allIndicators.filter(i => i.rating?.rating != null).length;
  const totalWithEvidence = allIndicators.filter(i => i.evidenceFiles.length > 0).length;
  const totalCount = allIndicators.length;

  const completenessPercent = totalCount > 0 ? Math.round((totalRated / totalCount) * 100) : 0;

  if (!school) {
    return (
      <div className="p-8 text-center text-gray-400">
        No school context. Please log in again.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Self-Evaluation Document</h1>
            <p className="text-sm text-gray-500 mt-1">{school.name_en} · Academic Year {academicYear}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Academic year selector */}
            <select
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#01696f]"
            >
              <option value="2024-2025">2024–2025</option>
              <option value="2023-2024">2023–2024</option>
              <option value="2022-2023">2022–2023</option>
            </select>
          </div>
        </div>

        {/* Overall completeness */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          <CompletionPill
            label="Indicators Rated"
            value={totalRated}
            total={totalCount}
            color="#01696f"
          />
          <CompletionPill
            label="With Evidence"
            value={totalWithEvidence}
            total={totalCount}
            color="#006494"
          />
          <CompletionPill
            label="Overall Completeness"
            value={completenessPercent}
            total={100}
            color={completenessPercent >= 80 ? '#437a22' : completenessPercent >= 50 ? '#d19900' : '#da7101'}
            suffix="%"
          />
        </div>
      </div>

      {/* Domain tabs */}
      <div className="px-8 pt-5">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 w-fit shadow-sm overflow-x-auto">
          {domains.map(d => {
            const stats = domainStats(d);
            const isComplete = stats.rated === stats.total && stats.total > 0;
            return (
              <button
                key={d.id}
                onClick={() => setActiveTab(d.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === d.id
                    ? 'bg-[#01696f] text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>Domain {d.id}</span>
                {isComplete && <span className="text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Domain content */}
      <div className="px-8 py-6">
        {loading ? (
          <SkeletonDomain />
        ) : (
          domains
            .filter(d => d.id === activeTab)
            .map(domain => {
              const stats = domainStats(domain);
              const narrative = domainNarrative[domain.id] || { strengths: '', improvements: '' };

              return (
                <div key={domain.id} className="space-y-6">
                  {/* Domain header card */}
                  <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                          Domain {domain.id}: {domain.name_en}
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5 capitalize">
                          Weight: <span className="font-medium">{domain.weight}</span>
                        </p>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <p>{stats.rated}/{stats.total} indicators rated</p>
                        <p>{stats.withEvidence}/{stats.total} with evidence</p>
                      </div>
                    </div>

                    {/* Domain narratives */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                          Overall Strengths
                        </label>
                        <textarea
                          value={narrative.strengths}
                          onChange={e =>
                            setDomainNarrative(prev => ({
                              ...prev,
                              [domain.id]: { ...narrative, strengths: e.target.value },
                            }))
                          }
                          rows={4}
                          placeholder="Describe the key strengths observed across this domain..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                          Areas for Improvement
                        </label>
                        <textarea
                          value={narrative.improvements}
                          onChange={e =>
                            setDomainNarrative(prev => ({
                              ...prev,
                              [domain.id]: { ...narrative, improvements: e.target.value },
                            }))
                          }
                          rows={4}
                          placeholder="Describe the key areas requiring improvement in this domain..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Standards + Indicators table */}
                  {domain.standards.map(standard => (
                    <div key={standard.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide mr-2">
                            {standard.id}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">{standard.name_en}</span>
                          {standard.is_primary && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 bg-[#01696f]/10 text-[#01696f] rounded font-medium">
                              Primary
                            </span>
                          )}
                        </div>
                        <Link
                          to={`/domains/${domain.id}/${standard.id}`}
                          className="text-xs text-[#01696f] hover:underline font-medium"
                        >
                          Rate indicators →
                        </Link>
                      </div>

                      {/* Indicator rows */}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 w-16">ID</th>
                            <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Indicator</th>
                            <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-36">Rating</th>
                            <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-48">Evidence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {standard.indicators.map(indicator => (
                            <IndicatorRow
                              key={indicator.id}
                              indicator={indicator}
                              domainId={domain.id}
                              standardId={standard.id}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}

// ─── Indicator Row ────────────────────────────────────────────

function IndicatorRow({
  indicator,
  domainId,
  standardId,
}: {
  indicator: IndicatorWithRating;
  domainId: string;
  standardId: string;
}) {
  const rating = indicator.rating?.rating as JudgementLevel | undefined;

  async function openFile(file: EvidenceFile) {
    const { data } = await supabase.storage
      .from('evidence-files')
      .createSignedUrl(file.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      {/* ID */}
      <td className="px-5 py-3 align-top">
        <span className="text-xs font-mono font-bold text-gray-400">{indicator.id}</span>
      </td>

      {/* Full description */}
      <td className="px-3 py-3 align-top">
        <p className="text-sm text-gray-700 leading-relaxed">{indicator.description_en}</p>
        {indicator.rating?.strengths && (
          <p className="text-xs text-green-700 mt-1">
            <span className="font-medium">Strengths:</span> {indicator.rating.strengths}
          </p>
        )}
        {indicator.rating?.improvement_areas && (
          <p className="text-xs text-amber-700 mt-0.5">
            <span className="font-medium">Areas:</span> {indicator.rating.improvement_areas}
          </p>
        )}
      </td>

      {/* Rating badge */}
      <td className="px-3 py-3 align-top">
        {rating ? (
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: JUDGEMENT_COLORS[rating] }}
          >
            {rating}. {JUDGEMENT_LABELS[rating]}
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Not rated
          </span>
        )}
      </td>

      {/* Evidence files — clickable links */}
      <td className="px-3 py-3 align-top">
        {indicator.evidenceFiles.length > 0 ? (
          <div className="flex flex-col gap-1">
            {indicator.evidenceFiles.map(file => (
              <button
                key={file.id}
                onClick={() => openFile(file)}
                className="flex items-center gap-1.5 text-xs text-[#01696f] hover:underline text-left group"
                title={file.description || file.file_name}
              >
                <FileIcon type={file.file_type} />
                <span className="truncate max-w-[160px] group-hover:text-[#0c4e54]">
                  {file.file_name}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Link
            to={`/domains/${domainId}/${standardId}`}
            className="text-xs text-gray-400 hover:text-[#01696f] hover:underline"
          >
            No evidence — upload
          </Link>
        )}
      </td>
    </tr>
  );
}

// ─── File Icon ────────────────────────────────────────────────

function FileIcon({ type }: { type?: string }) {
  const icons: Record<string, string> = {
    pdf: '📄',
    docx: '📝',
    image: '🖼️',
    spreadsheet: '📊',
    other: '📎',
  };
  return <span className="text-xs">{icons[type || 'other'] || '📎'}</span>;
}

// ─── Completion Pill ──────────────────────────────────────────

function CompletionPill({
  label,
  value,
  total,
  color,
  suffix = '',
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  suffix?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">
        {suffix ? `${value}${suffix}` : `${value} / ${total}`}
      </p>
      <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function SkeletonDomain() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-white rounded-xl h-48 border border-gray-200" />
      <div className="bg-white rounded-xl h-64 border border-gray-200" />
    </div>
  );
}
