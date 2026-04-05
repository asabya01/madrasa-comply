import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Search, Upload, FileText, Image, Table, File, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useEvidence, useUploadEvidence } from '../hooks/useEvidence';
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
  const [dragOver, setDragOver] = useState(false);
  const { data: evidenceFiles, isLoading } = useEvidence();
  const uploadEvidence = useUploadEvidence();

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
          <label>
            <input type="file" className="hidden" multiple onChange={handleFileInput} />
            <Button variant="outline" size="sm" type="button" onClick={() => {}}>Browse Files</Button>
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
    </div>
  );
}
