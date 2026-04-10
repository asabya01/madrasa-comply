/**
 * EvidenceUploader
 * Indicator-scoped file uploader.
 *
 * Storage path:  evidence-files/{schoolId}/{academicYear}/{indicatorId}/{uuid}-{filename}
 * DB tables:     evidence_files + evidence_indicator_links
 * Signed URLs:   1-hour expiry, generated on mount and cached in component state.
 */

import { useState, useEffect, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from './ui/toast';
import { formatDate } from '../lib/utils';
import type { EvidenceFile } from '../types';

// ─── Constants ────────────────────────────────────────────────

const BUCKET = 'evidence-files';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf':                                                      'pdf',
  'application/msword':                                                   'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel':                                             'spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':   'spreadsheet',
  'image/jpeg':                                                           'image',
  'image/png':                                                            'image',
};

const ALLOWED_EXTS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];

// ─── Types ────────────────────────────────────────────────────

interface UploadJob {
  tempId: string;
  name: string;
  sizeBytes: number;
  status: 'uploading' | 'error';
  errorMsg?: string;
}

interface EvidenceUploaderProps {
  indicatorId: string;
  standardId?: string;
  domainId?: string;
  /** Compact inline mode — smaller drop zone, tighter file list */
  compact?: boolean;
}

// ─── Hook: files linked to this indicator ────────────────────

function useIndicatorFiles(schoolId: string | undefined, indicatorId: string) {
  return useQuery({
    queryKey: ['evidence', schoolId, indicatorId],
    queryFn: async () => {
      const { data: links } = await supabase
        .from('evidence_indicator_links')
        .select('evidence_file_id')
        .eq('school_id', schoolId!)
        .eq('indicator_id', indicatorId);

      const ids = (links ?? []).map(l => l.evidence_file_id);
      if (!ids.length) return [] as EvidenceFile[];

      const { data, error } = await supabase
        .from('evidence_files')
        .select('*')
        .in('id', ids)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as EvidenceFile[];
    },
    enabled: !!schoolId,
  });
}

// ─── Component ────────────────────────────────────────────────

export default function EvidenceUploader({
  indicatorId,
  standardId,
  domainId,
  compact = false,
}: EvidenceUploaderProps) {
  const { school, profile, academicYear } = useSchoolStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const inputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading } = useIndicatorFiles(school?.id, indicatorId);

  // Generate signed URLs for all loaded files
  useEffect(() => {
    if (!files.length) return;
    const missing = files.filter(f => !signedUrls[f.id]);
    if (!missing.length) return;

    Promise.all(
      missing.map(async f => {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(f.file_path, 3600);
        return { id: f.id, url: data?.signedUrl ?? '' };
      })
    ).then(results => {
      setSignedUrls(prev => {
        const next = { ...prev };
        for (const { id, url } of results) if (url) next[id] = url;
        return next;
      });
    });
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ──────────────────────────────────────────────

  function validate(file: File): string | null {
    if (!ALLOWED_TYPES[file.type]) {
      return `"${file.name}": unsupported type. Allowed: PDF, DOCX, XLSX, JPG, PNG.`;
    }
    if (file.size > MAX_BYTES) {
      return `"${file.name}": exceeds 20 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
    }
    return null;
  }

  // ── Upload ───────────────────────────────────────────────────

  async function uploadFile(file: File) {
    if (!school || !profile) return;

    const err = validate(file);
    if (err) { showToast(err, 'error'); return; }

    const tempId = crypto.randomUUID();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${school.id}/${academicYear}/${indicatorId}/${tempId}-${sanitizedName}`;
    const fileType = ALLOWED_TYPES[file.type] ?? 'other';

    setJobs(prev => [
      ...prev,
      { tempId, name: file.name, sizeBytes: file.size, status: 'uploading' },
    ]);

    try {
      // 1. Upload to storage
      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (storageErr) throw storageErr;

      // 2. Insert metadata row
      const { data: fileRecord, error: dbErr } = await supabase
        .from('evidence_files')
        .insert({
          school_id: school.id,
          file_name: file.name,
          file_path: storagePath,
          file_type: fileType,
          file_size_bytes: file.size,
          uploaded_by: profile.id,
        })
        .select()
        .single();

      if (dbErr) {
        // Roll back storage object on DB failure
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw dbErr;
      }

      // 3. Create indicator link
      await supabase.from('evidence_indicator_links').insert({
        evidence_file_id: fileRecord.id,
        indicator_id: indicatorId,
        standard_id: standardId ?? null,
        domain_id: domainId ?? null,
        school_id: school.id,
      });

      queryClient.invalidateQueries({ queryKey: ['evidence', school.id, indicatorId] });
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      queryClient.invalidateQueries({ queryKey: ['evidence-links'] });
      showToast(`${file.name} uploaded`, 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setJobs(prev =>
        prev.map(j => j.tempId === tempId ? { ...j, status: 'error', errorMsg: msg } : j)
      );
      showToast(`Upload failed: ${msg}`, 'error');
      return;
    }

    setJobs(prev => prev.filter(j => j.tempId !== tempId));
  }

  // ── Delete (unlink from indicator + remove file + storage) ──

  async function deleteFile(file: EvidenceFile) {
    if (!school) return;
    if (!window.confirm(`Remove "${file.file_name}" from this indicator?`)) return;

    // Remove link
    await supabase
      .from('evidence_indicator_links')
      .delete()
      .eq('evidence_file_id', file.id)
      .eq('indicator_id', indicatorId);

    // Check if file is still linked to other indicators
    const { data: otherLinks } = await supabase
      .from('evidence_indicator_links')
      .select('id')
      .eq('evidence_file_id', file.id);

    if (!otherLinks?.length) {
      // No other links — remove file record and storage object
      await supabase.from('evidence_files').delete().eq('id', file.id);
      await supabase.storage.from(BUCKET).remove([file.file_path]);
    }

    setSignedUrls(prev => { const next = { ...prev }; delete next[file.id]; return next; });
    queryClient.invalidateQueries({ queryKey: ['evidence', school.id, indicatorId] });
    queryClient.invalidateQueries({ queryKey: ['evidence'] });
    showToast('File removed', 'info');
  }

  // ── Drag handlers ────────────────────────────────────────────

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      for (const file of Array.from(e.dataTransfer.files)) {
        await uploadFile(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [school, profile, indicatorId, academicYear]
  );

  const onInputChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      for (const file of Array.from(e.target.files ?? [])) {
        await uploadFile(file);
      }
      if (inputRef.current) inputRef.current.value = '';
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [school, profile, indicatorId, academicYear]
  );

  const anyUploading = jobs.some(j => j.status === 'uploading');

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── Drop zone ── */}
      {compact ? (
        <CompactDropZone
          dragOver={dragOver}
          uploading={anyUploading}
          inputRef={inputRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onInputChange={onInputChange}
        />
      ) : (
        <FullDropZone
          dragOver={dragOver}
          uploading={anyUploading}
          inputRef={inputRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onInputChange={onInputChange}
        />
      )}

      {/* ── In-progress uploads ── */}
      {jobs.length > 0 && (
        <div className="space-y-1.5">
          {jobs.map(job => (
            <div
              key={job.tempId}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                job.status === 'error'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-[#01696f]/5 border border-[#01696f]/20'
              }`}
            >
              {job.status === 'uploading' ? (
                <UploadSpinner />
              ) : (
                <span className="text-red-500">✕</span>
              )}
              <span className="flex-1 truncate font-medium text-gray-700">{job.name}</span>
              <span className="text-gray-400 shrink-0">{formatBytes(job.sizeBytes)}</span>
              {job.status === 'error' && (
                <button
                  onClick={() => setJobs(prev => prev.filter(j => j.tempId !== job.tempId))}
                  className="text-gray-400 hover:text-gray-600 ml-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Existing files list ── */}
      {isLoading ? (
        <SkeletonFiles compact={compact} />
      ) : files.length > 0 ? (
        <div className={`space-y-1.5 ${compact ? '' : 'mt-1'}`}>
          {files.map(file => (
            <FileRow
              key={file.id}
              file={file}
              signedUrl={signedUrls[file.id]}
              compact={compact}
              onDelete={() => deleteFile(file)}
            />
          ))}
        </div>
      ) : !jobs.length ? (
        <p className="text-xs text-gray-400 text-center py-1">No files uploaded yet</p>
      ) : null}
    </div>
  );
}

// ─── Drop zones ───────────────────────────────────────────────

interface DropZoneProps {
  dragOver: boolean;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

function FullDropZone({
  dragOver,
  uploading,
  inputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onInputChange,
}: DropZoneProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
        dragOver
          ? 'border-[#01696f] bg-[#01696f]/5'
          : 'border-gray-200 hover:border-[#01696f]/50 hover:bg-gray-50/50'
      }`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTS.join(',')}
        className="hidden"
        onChange={onInputChange}
      />
      <div className="text-3xl mb-2">{dragOver ? '📂' : '📁'}</div>
      <p className="text-sm font-medium text-gray-700">
        {dragOver ? 'Drop files here' : 'Drag files here or click to browse'}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        PDF · DOCX · XLSX · JPG · PNG &nbsp;·&nbsp; max 20 MB
      </p>
      {uploading && (
        <div className="absolute inset-0 rounded-xl bg-white/70 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-[#01696f] font-medium">
            <UploadSpinner />
            Uploading…
          </div>
        </div>
      )}
    </div>
  );
}

function CompactDropZone({
  dragOver,
  uploading,
  inputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onInputChange,
}: DropZoneProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex items-center gap-2 border border-dashed rounded-lg px-3 py-2 transition-colors cursor-pointer ${
        dragOver
          ? 'border-[#01696f] bg-[#01696f]/5'
          : 'border-gray-200 hover:border-[#01696f]/50'
      }`}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTS.join(',')}
        className="hidden"
        onChange={onInputChange}
      />
      {uploading ? (
        <>
          <UploadSpinner />
          <span className="text-xs text-[#01696f]">Uploading…</span>
        </>
      ) : (
        <>
          <span className="text-base">📎</span>
          <span className="text-xs text-gray-500">
            {dragOver ? 'Drop files' : 'Attach evidence'}
          </span>
          <span className="text-xs text-gray-300 ml-auto">PDF·DOCX·XLSX·JPG·PNG ≤20MB</span>
        </>
      )}
    </div>
  );
}

// ─── File row ─────────────────────────────────────────────────

function FileRow({
  file,
  signedUrl,
  compact,
  onDelete,
}: {
  file: EvidenceFile;
  signedUrl: string | undefined;
  compact: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 transition-colors">
      {/* Type icon */}
      <span className="text-base shrink-0" aria-hidden>
        {fileTypeIcon(file.file_type)}
      </span>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-[#01696f] hover:underline truncate block"
            title={file.file_name}
          >
            {file.file_name}
          </a>
        ) : (
          <span className="text-xs font-medium text-gray-700 truncate block" title={file.file_name}>
            {file.file_name}
          </span>
        )}
        {!compact && (
          <p className="text-xs text-gray-400 mt-0.5">
            {file.file_size_bytes ? formatBytes(file.file_size_bytes) + ' · ' : ''}
            {formatDate(file.uploaded_at)}
          </p>
        )}
      </div>

      {/* Size (compact) */}
      {compact && file.file_size_bytes && (
        <span className="text-xs text-gray-400 shrink-0">{formatBytes(file.file_size_bytes)}</span>
      )}

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        title="Remove file"
        className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function SkeletonFiles({ compact }: { compact: boolean }) {
  return (
    <div className="space-y-1.5 animate-pulse">
      {[1, 2].map(i => (
        <div
          key={i}
          className={`flex items-center gap-3 px-3 ${compact ? 'py-2' : 'py-2.5'} rounded-lg border border-gray-100`}
        >
          <div className="w-5 h-5 bg-gray-100 rounded shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-gray-100 rounded w-40" />
            {!compact && <div className="h-2.5 bg-gray-100 rounded w-24" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Micro components ─────────────────────────────────────────

function UploadSpinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-[#01696f] shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 7a1 1 0 012 0v3a1 1 0 01-2 0V9zm4 0a1 1 0 012 0v3a1 1 0 01-2 0V9z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function fileTypeIcon(type?: string): string {
  switch (type) {
    case 'pdf':         return '📄';
    case 'docx':        return '📝';
    case 'spreadsheet': return '📊';
    case 'image':       return '🖼️';
    default:            return '📎';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
