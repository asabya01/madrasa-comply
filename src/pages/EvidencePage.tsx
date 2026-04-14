import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Search, Upload, FileText, Image, Table, File, Trash2, Link2, X, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useEvidence, useUploadEvidence, useLinkEvidence, useEvidenceLinks } from '../hooks/useEvidence';
import { useSchoolStore } from '../stores/schoolStore';
import { formatDate } from '../lib/utils';
import type { EvidenceFile } from '../types';

const FILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  docx: FileText,
  image: Image,
  spreadsheet: Table,
  other: File,
};

// ─── Link-to-indicator modal ──────────────────────────────────

interface LinkModalProps {
  file: EvidenceFile;
  onClose: () => void;
}

function useFramework() {
  return useQuery({
    queryKey: ['framework-tree'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('indicators')
        .select('id, description_en, standard_id, domain_id')
        .order('id');
      if (error) throw error;
      const all = data as Array<{ id: string; description_en: string; standard_id: string; domain_id: string }>;
      const domainMap: Record<string, Record<string, typeof all>> = {};
      for (const ind of all) {
        (domainMap[ind.domain_id] ??= {})[ind.standard_id] ??= [];
        domainMap[ind.domain_id][ind.standard_id].push(ind);
      }
      return domainMap;
    },
    staleTime: 1000 * 60 * 60,
  });
}

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement', '2': 'Personal Development',
  '3': 'Teaching & Assessment', '4': 'School Climate', '5': 'Leadership & Governance',
};

function LinkIndicatorModal({ file, onClose }: LinkModalProps) {
  const { data: tree, isLoading } = useFramework();
  const linkEvidence = useLinkEvidence();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedStandard, setSelectedStandard] = useState<string | null>(null);

  async function handleLink(indicatorId: string) {
    if (!selectedDomain || !selectedStandard) return;
    await linkEvidence.mutateAsync({
      evidenceFileId: file.id,
      indicatorId,
      standardId: selectedStandard,
      domainId: selectedDomain,
    });
    onClose();
  }

  const standards = selectedDomain ? Object.keys(tree?.[selectedDomain] ?? {}).sort() : [];
  const indicators = selectedDomain && selectedStandard ? (tree?.[selectedDomain]?.[selectedStandard] ?? []) : [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">Link to Indicator</p>
            <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{file.file_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading framework…</p>
          ) : (
            <>
              {/* Step 1: Domain */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">1. Select Domain</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {['1', '2', '3', '4', '5'].map(d => (
                    <button
                      key={d}
                      onClick={() => { setSelectedDomain(d); setSelectedStandard(null); }}
                      className={`p-2 rounded-lg border text-xs font-medium transition-colors text-center ${
                        selectedDomain === d
                          ? 'bg-[#01696f] text-white border-[#01696f]'
                          : 'border-gray-200 text-gray-600 hover:border-[#01696f] hover:text-[#01696f]'
                      }`}
                    >
                      <span className="block text-base font-bold">{d}</span>
                      <span className="block leading-tight mt-0.5" style={{ fontSize: '9px' }}>
                        {DOMAIN_NAMES[d].split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Standard */}
              {selectedDomain && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">2. Select Standard</p>
                  <div className="flex flex-wrap gap-1.5">
                    {standards.map(s => (
                      <button
                        key={s}
                        onClick={() => setSelectedStandard(s)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          selectedStandard === s
                            ? 'bg-[#01696f] text-white border-[#01696f]'
                            : 'border-gray-200 text-gray-600 hover:border-[#01696f] hover:text-[#01696f]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Indicator */}
              {selectedStandard && indicators.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">3. Select Indicator</p>
                  <div className="space-y-1">
                    {indicators.map(ind => (
                      <button
                        key={ind.id}
                        onClick={() => handleLink(ind.id)}
                        disabled={linkEvidence.isPending}
                        className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#01696f] hover:bg-[#01696f]/5 transition-colors text-left group"
                      >
                        <span className="shrink-0 text-xs font-mono font-bold text-gray-400 pt-0.5">{ind.id}</span>
                        <span className="flex-1 text-xs text-gray-600 leading-snug">{ind.description_en}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-[#01696f] mt-0.5 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CoverageWidget() {
  const { school } = useSchoolStore();

  const { data: stats } = useQuery({
    queryKey: ['evidence-coverage', school?.id],
    queryFn: async () => {
      if (!school) return { zero: 0, low: 0, good: 0 };
      const { data: indicators } = await supabase.from('indicators').select('id');
      const { data: links } = await supabase
        .from('evidence_indicator_links')
        .select('indicator_id')
        .eq('school_id', school.id);

      const counts: Record<string, number> = {};
      (links || []).forEach((l) => {
        counts[l.indicator_id] = (counts[l.indicator_id] || 0) + 1;
      });

      let zero = 0, low = 0, good = 0;
      (indicators || []).forEach((ind) => {
        const c = counts[ind.id] || 0;
        if (c === 0) zero++;
        else if (c <= 2) low++;
        else good++;
      });
      return { zero, low, good, total: (indicators || []).length };
    },
    enabled: !!school,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-100">
        <span className="text-xs text-red-700">No evidence</span>
        <span className="text-sm font-bold text-red-700">{stats?.zero || 0}</span>
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-100">
        <span className="text-xs text-amber-700">1–2 files</span>
        <span className="text-sm font-bold text-amber-700">{stats?.low || 0}</span>
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-100">
        <span className="text-xs text-green-700">3+ files</span>
        <span className="text-sm font-bold text-green-700">{stats?.good || 0}</span>
      </div>
      <p className="text-xs text-[#6b7280] text-center">{stats?.total || 0} total indicators</p>
    </div>
  );
}

export function EvidencePage() {
  const [search, setSearch] = useState('');
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const [linkingFile, setLinkingFile] = useState<EvidenceFile | null>(null);
  const { data: evidenceFiles, isLoading } = useEvidence();
  const { data: allLinks } = useEvidenceLinks();
  const uploadEvidence = useUploadEvidence();

  // Build a map: evidenceFileId → linked indicator count
  const linkCountByFile: Record<string, number> = {};
  for (const l of allLinks ?? []) {
    linkCountByFile[l.evidence_file_id] = (linkCountByFile[l.evidence_file_id] ?? 0) + 1;
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await uploadEvidence.mutateAsync({ file });
    }
  }, [uploadEvidence]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await uploadEvidence.mutateAsync({ file });
    }
  };

  const handleDelete = async (file: EvidenceFile) => {
    await supabase.storage.from('evidence-files').remove([file.file_path]);
    await supabase.from('evidence_files').delete().eq('id', file.id);
  };

  const filtered = (evidenceFiles || []).filter((f) =>
    f.file_name.toLowerCase().includes(search.toLowerCase()) ||
    f.description?.toLowerCase().includes(search.toLowerCase())
  );

  const getFileUrl = (path: string) => {
    const { data } = supabase.storage.from('evidence-files').getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1">
        {/* Upload zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-colors ${
            dragOver ? 'border-[#01696f] bg-[#01696f]/5' : 'border-[#e2e0db] hover:border-[#01696f]/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-8 w-8 text-[#6b7280] mx-auto mb-2" />
          <p className="text-sm text-[#1a1a1a] font-medium">Drag and drop files here</p>
          <p className="text-xs text-[#6b7280] mt-1 mb-3">PDF, Word, images, spreadsheets up to 50MB</p>
          <label className="cursor-pointer inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium border border-[#e2e0db] rounded-md bg-white hover:bg-gray-50 transition-colors">
            <input type="file" className="hidden" multiple onChange={handleFileInput} />
            Browse Files
          </label>
          {uploadEvidence.isPending && <p className="text-xs text-[#01696f] mt-2">Uploading...</p>}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search evidence files..."
            className="pl-9"
          />
        </div>

        {/* File grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => <div key={i} className="h-32 bg-white rounded-lg border animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-[#6b7280]">No evidence files yet</p>
            <p className="text-sm text-[#6b7280]">Upload files to link them to indicators</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((file) => {
              const Icon = FILE_ICONS[file.file_type || 'other'] || File;
              const linkedCount = linkCountByFile[file.id] ?? 0;
              return (
                <Card key={file.id} className="group hover:border-[#01696f] transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <Icon className="h-8 w-8 text-[#01696f]" />
                      <button
                        onClick={() => handleDelete(file)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <a href={getFileUrl(file.file_path)} target="_blank" rel="noreferrer">
                      <p className="text-xs font-medium text-[#1a1a1a] hover:text-[#01696f] line-clamp-2 leading-tight">
                        {file.file_name}
                      </p>
                    </a>
                    <p className="text-xs text-[#6b7280] mt-1">
                      {formatDate(file.uploaded_at)}
                    </p>
                    {file.file_size_bytes && (
                      <p className="text-xs text-[#6b7280]">
                        {(file.file_size_bytes / 1024).toFixed(0)} KB
                      </p>
                    )}
                    {/* Link indicator button */}
                    <button
                      onClick={() => setLinkingFile(file)}
                      className="mt-2 flex items-center gap-1 text-xs text-[#01696f] hover:underline"
                    >
                      <Link2 className="h-3 w-3" />
                      {linkedCount > 0 ? `${linkedCount} indicator${linkedCount > 1 ? 's' : ''} linked` : 'Link to indicator'}
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Sidebar coverage */}
      <div className="w-52 shrink-0">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3 font-sans">Evidence Coverage</h3>
            <CoverageWidget />
          </CardContent>
        </Card>
      </div>

      {/* Link-to-indicator modal */}
      {linkingFile && (
        <LinkIndicatorModal file={linkingFile} onClose={() => setLinkingFile(null)} />
      )}
    </div>
  );
}
