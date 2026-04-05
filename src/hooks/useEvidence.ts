import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';
import type { EvidenceFile, EvidenceIndicatorLink } from '../types';

export function useEvidence(indicatorId?: string) {
  const { school } = useSchoolStore();

  return useQuery({
    queryKey: ['evidence', school?.id, indicatorId],
    queryFn: async () => {
      if (!school) return [];
      if (indicatorId) {
        const { data: links } = await supabase
          .from('evidence_indicator_links')
          .select('evidence_file_id')
          .eq('school_id', school.id)
          .eq('indicator_id', indicatorId);
        const fileIds = (links || []).map((l) => l.evidence_file_id);
        if (!fileIds.length) return [];
        const { data, error } = await supabase
          .from('evidence_files')
          .select('*')
          .in('id', fileIds);
        if (error) throw error;
        return data as EvidenceFile[];
      }
      const { data, error } = await supabase
        .from('evidence_files')
        .select('*')
        .eq('school_id', school.id)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data as EvidenceFile[];
    },
    enabled: !!school,
  });
}

export function useEvidenceLinks() {
  const { school } = useSchoolStore();

  return useQuery({
    queryKey: ['evidence-links', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('evidence_indicator_links')
        .select('*')
        .eq('school_id', school.id);
      if (error) throw error;
      return data as EvidenceIndicatorLink[];
    },
    enabled: !!school,
  });
}

export function useUploadEvidence() {
  const queryClient = useQueryClient();
  const { school, profile } = useSchoolStore();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      file: File;
      indicatorId?: string;
      standardId?: string;
      domainId?: string;
      description?: string;
    }) => {
      if (!school) throw new Error('No school');

      const ext = params.file.name.split('.').pop();
      const path = `${school.id}/${Date.now()}-${params.file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('evidence-files')
        .upload(path, params.file);
      if (uploadError) throw uploadError;

      const fileType = ext === 'pdf' ? 'pdf'
        : ['doc', 'docx'].includes(ext || '') ? 'docx'
        : ['jpg', 'jpeg', 'png', 'gif'].includes(ext || '') ? 'image'
        : ['xlsx', 'xls', 'csv'].includes(ext || '') ? 'spreadsheet'
        : 'other';

      const { data: fileRecord, error: dbError } = await supabase
        .from('evidence_files')
        .insert({
          school_id: school.id,
          file_name: params.file.name,
          file_path: path,
          file_type: fileType,
          file_size_bytes: params.file.size,
          description: params.description,
          uploaded_by: profile?.id,
        })
        .select()
        .single();
      if (dbError) throw dbError;

      if (params.indicatorId) {
        await supabase.from('evidence_indicator_links').insert({
          evidence_file_id: fileRecord.id,
          indicator_id: params.indicatorId,
          standard_id: params.standardId,
          domain_id: params.domainId,
          school_id: school.id,
        });
      }

      return fileRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      queryClient.invalidateQueries({ queryKey: ['evidence-links'] });
      showToast('Evidence uploaded', 'success');
    },
    onError: (error: Error) => {
      console.error('[useUploadEvidence] Error:', error.message);
      showToast(`Upload failed: ${error.message}`, 'error');
    },
  });
}

export function useLinkEvidence() {
  const queryClient = useQueryClient();
  const { school } = useSchoolStore();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      evidenceFileId: string;
      indicatorId: string;
      standardId: string;
      domainId: string;
    }) => {
      if (!school) throw new Error('No school');
      const { data, error } = await supabase
        .from('evidence_indicator_links')
        .upsert({
          evidence_file_id: params.evidenceFileId,
          indicator_id: params.indicatorId,
          standard_id: params.standardId,
          domain_id: params.domainId,
          school_id: school.id,
        }, { onConflict: 'evidence_file_id,indicator_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-links'] });
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      showToast('Evidence linked', 'success');
    },
    onError: (error: Error) => {
      console.error('[useLinkEvidence] Error:', error.message);
      showToast(`Failed to link evidence: ${error.message}`, 'error');
    },
  });
}
