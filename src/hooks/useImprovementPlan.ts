import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';

// ─── Types ────────────────────────────────────────────────────

export type AFIStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';
export type ImpactLevel = 'not_met' | 'partially_met' | 'met' | 'exceeded';
export type TaskStatus = 'not_started' | 'completed';

export interface AFI {
  id: string;
  school_id: string;
  indicator_id?: string | null;
  domain_id?: string | null;
  title: string;
  description?: string | null;
  expected_impact?: string | null;
  due_date?: string | null;
  owner_id?: string | null;
  status: AFIStatus;
  completion_date?: string | null;
  actual_impact?: ImpactLevel | null;
  is_archived: boolean;
  academic_year?: string | null;
  priority?: string | null;
  success_metric?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
  completion_prompted?: boolean | null;
}

export interface ActionTask {
  id: string;
  action_item_id: string;
  title: string;
  owner_id?: string | null;
  due_date?: string | null;
  completion_date?: string | null;
  status: TaskStatus;
  created_at: string;
}

export interface ImpactNote {
  id: string;
  action_item_id: string;
  content: string;
  current_impact?: ImpactLevel | null;
  created_by?: string | null;
  created_at: string;
}

// ─── AFIs ─────────────────────────────────────────────────────

export function useAFIs(showArchived = false) {
  const { school, academicYear } = useSchoolStore();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['afis', school?.id, academicYear, showArchived],
    queryFn: async () => {
      if (!school) return [] as AFI[];
      const { data, error } = await supabase
        .from('action_items')
        .select('*')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear)
        .eq('is_archived', showArchived)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AFI[];
    },
    enabled: !!school,
  });

  // Auto-overdue: items past due_date that haven't been completed/overdue yet
  useEffect(() => {
    if (!query.data?.length || !school) return;
    const today = new Date().toISOString().split('T')[0];
    const ids = query.data
      .filter(a => a.due_date && a.due_date < today && a.status !== 'completed' && a.status !== 'overdue')
      .map(a => a.id);
    if (!ids.length) return;
    supabase
      .from('action_items')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .in('id', ids)
      .then(() => queryClient.invalidateQueries({ queryKey: ['afis'] }));
  }, [query.data, school, queryClient]);

  return query;
}

export function useCreateAFI() {
  const queryClient = useQueryClient();
  const { school, academicYear, profile } = useSchoolStore();

  return useMutation({
    mutationFn: async (input: Omit<AFI, 'id' | 'school_id' | 'is_archived' | 'created_at'>) => {
      if (!school) throw new Error('No school');
      const { data, error } = await supabase
        .from('action_items')
        .insert({
          ...input,
          school_id: school.id,
          academic_year: academicYear,
          is_archived: false,
          created_by: profile?.id ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as AFI;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['afis'] }),
  });
}

export function useUpdateAFI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<AFI> & { id: string }) => {
      const { data, error } = await supabase
        .from('action_items')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as AFI;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['afis'] }),
  });
}

export function useArchiveAFI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_archived }: { id: string; is_archived: boolean }) => {
      const { error } = await supabase
        .from('action_items')
        .update({ is_archived, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['afis'] }),
  });
}

// ─── Tasks ────────────────────────────────────────────────────

export function useTasks(afiId: string | null) {
  return useQuery({
    queryKey: ['tasks', afiId],
    queryFn: async () => {
      if (!afiId) return [] as ActionTask[];
      const { data, error } = await supabase
        .from('action_tasks')
        .select('*')
        .eq('action_item_id', afiId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as ActionTask[];
    },
    enabled: !!afiId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      action_item_id: string;
      title: string;
      owner_id?: string | null;
      due_date?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('action_tasks')
        .insert({ ...input, status: 'not_started' })
        .select()
        .single();
      if (error) throw error;
      return data as ActionTask;
    },
    onSuccess: (_, vars) =>
      queryClient.invalidateQueries({ queryKey: ['tasks', vars.action_item_id] }),
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action_item_id }: { id: string; action_item_id: string }) => {
      const { error } = await supabase
        .from('action_tasks')
        .update({ status: 'completed', completion_date: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return { action_item_id };
    },
    onSuccess: (result) =>
      queryClient.invalidateQueries({ queryKey: ['tasks', result.action_item_id] }),
  });
}

// ─── Impact Notes ─────────────────────────────────────────────

export function useImpactNotes(afiId: string | null) {
  return useQuery({
    queryKey: ['impact-notes', afiId],
    queryFn: async () => {
      if (!afiId) return [] as ImpactNote[];
      const { data, error } = await supabase
        .from('impact_notes')
        .select('*')
        .eq('action_item_id', afiId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImpactNote[];
    },
    enabled: !!afiId,
  });
}

export function useAddImpactNote() {
  const queryClient = useQueryClient();
  const { profile } = useSchoolStore();

  return useMutation({
    mutationFn: async (input: {
      action_item_id: string;
      content: string;
      current_impact?: ImpactLevel | null;
    }) => {
      const { data, error } = await supabase
        .from('impact_notes')
        .insert({ ...input, created_by: profile?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as ImpactNote;
    },
    onSuccess: (_, vars) =>
      queryClient.invalidateQueries({ queryKey: ['impact-notes', vars.action_item_id] }),
  });
}
