import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, ChevronLeft, FileDown, UserCheck, MessageSquare,
  BookOpen, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../components/ui/toast';
import { useAcademicYears } from '../hooks/useAcademicYears';

// ─── Types ────────────────────────────────────────────────────

interface AppraisalCycle {
  id: string;
  school_id: string;
  teacher_id: string;
  reviewer_id: string | null;
  academic_year: string;
  status: 'draft' | 'targets_set' | 'midyear_done' | 'complete';
  overall_rating: number | null;
  created_at: string;
  updated_at: string;
  teacher: { id: string; full_name: string | null } | null;
  reviewer: { id: string; full_name: string | null } | null;
}

interface AppraisalTarget {
  id: string;
  cycle_id: string;
  title: string;
  description: string | null;
  success_criteria: string | null;
  target_date: string | null;
  category: string | null;
  midyear_progress: string | null;
  midyear_rating: number | null;
  endyear_evidence: string | null;
  endyear_rating: number | null;
  created_at: string;
}

interface AppraisalNote {
  id: string;
  cycle_id: string;
  author_id: string | null;
  stage: 'initial' | 'midyear' | 'endyear' | null;
  content: string;
  created_at: string;
  author: { full_name: string | null } | null;
}

interface TeacherOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface CPDEntry {
  id: string;
  title: string;
  cpd_date: string;
  hours: number;
  category: string | null;
}

// ─── Constants ────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:        { label: 'Draft',          color: 'bg-gray-100 text-gray-600',    icon: Clock },
  targets_set:  { label: 'Targets Set',    color: 'bg-blue-100 text-blue-700',    icon: CheckCircle2 },
  midyear_done: { label: 'Mid-Year Done',  color: 'bg-amber-100 text-amber-700',  icon: AlertCircle },
  complete:     { label: 'Complete',       color: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
};

const RATING_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: 'Outstanding',       color: 'bg-green-100 text-green-800 border-green-200' },
  2: { label: 'Good',              color: 'bg-blue-100 text-blue-800 border-blue-200' },
  3: { label: 'Satisfactory',      color: 'bg-amber-100 text-amber-800 border-amber-200' },
  4: { label: 'Needs Improvement', color: 'bg-red-100 text-red-800 border-red-200' },
};

const CATEGORY_LABELS: Record<string, string> = {
  teaching_quality:        'Teaching Quality',
  student_outcomes:        'Student Outcomes',
  professional_development:'Professional Development',
  leadership:              'Leadership',
  safeguarding:            'Safeguarding',
  other:                   'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  teaching_quality:        'bg-blue-100 text-blue-700',
  student_outcomes:        'bg-green-100 text-green-700',
  professional_development:'bg-purple-100 text-purple-700',
  leadership:              'bg-amber-100 text-amber-700',
  safeguarding:            'bg-red-100 text-red-700',
  other:                   'bg-gray-100 text-gray-600',
};

const STAGE_LABELS: Record<string, string> = {
  initial:  'Initial',
  midyear:  'Mid-Year',
  endyear:  'End-of-Year',
};

const STATUS_ORDER: AppraisalCycle['status'][] = [
  'draft', 'targets_set', 'midyear_done', 'complete',
];

// ─── Helpers ──────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-gray-400 text-xs">—</span>;
  const cfg = RATING_CONFIG[rating];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      {rating} — {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: AppraisalCycle['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function StepperBar({ status }: { status: AppraisalCycle['status'] }) {
  const steps = [
    { key: 'draft',        label: 'Draft' },
    { key: 'targets_set',  label: 'Targets Set' },
    { key: 'midyear_done', label: 'Mid-Year' },
    { key: 'complete',     label: 'Complete' },
  ];
  const currentIdx = STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, i) => {
        const done    = i < currentIdx;
        const active  = i === currentIdx;
        const future  = i > currentIdx;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                done   ? 'bg-[#01696f] border-[#01696f] text-white' :
                active ? 'bg-white border-[#01696f] text-[#01696f]' :
                         'bg-gray-100 border-gray-200 text-gray-400'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                active ? 'text-[#01696f]' : future ? 'text-gray-400' : 'text-gray-600'
              }`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-[#01696f]' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Data hooks ───────────────────────────────────────────────

function useCycles(schoolId: string | undefined, year: string, teacherId?: string) {
  return useQuery<AppraisalCycle[]>({
    queryKey: ['appraisal_cycles', schoolId, year, teacherId],
    queryFn: async () => {
      if (!schoolId) return [];
      let q = supabase
        .from('appraisal_cycles')
        .select('*, teacher:profiles!teacher_id(id,full_name), reviewer:profiles!reviewer_id(id,full_name)')
        .eq('school_id', schoolId)
        .eq('academic_year', year)
        .order('created_at', { ascending: false });
      if (teacherId) q = q.eq('teacher_id', teacherId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AppraisalCycle[];
    },
    enabled: !!schoolId && !!year,
    staleTime: 1000 * 60 * 2,
  });
}

function useTargets(cycleId: string | undefined) {
  return useQuery<AppraisalTarget[]>({
    queryKey: ['appraisal_targets', cycleId],
    queryFn: async () => {
      if (!cycleId) return [];
      const { data, error } = await supabase
        .from('appraisal_targets')
        .select('*')
        .eq('cycle_id', cycleId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppraisalTarget[];
    },
    enabled: !!cycleId,
    staleTime: 1000 * 60 * 2,
  });
}

function useNotes(cycleId: string | undefined) {
  return useQuery<AppraisalNote[]>({
    queryKey: ['appraisal_notes', cycleId],
    queryFn: async () => {
      if (!cycleId) return [];
      const { data, error } = await supabase
        .from('appraisal_notes')
        .select('*, author:profiles!author_id(full_name)')
        .eq('cycle_id', cycleId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppraisalNote[];
    },
    enabled: !!cycleId,
    staleTime: 1000 * 60 * 2,
  });
}

function useTeachers(schoolId: string | undefined) {
  return useQuery<TeacherOption[]>({
    queryKey: ['school_members_teachers', schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from('school_members')
        .select('user_id, profiles(full_name, email)')
        .eq('school_id', schoolId)
        .eq('role', 'teacher')
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []).map((m: { user_id: string; profiles: { full_name: string | null; email: string | null } | null }) => ({
        user_id:   m.user_id,
        full_name: m.profiles?.full_name ?? null,
        email:     m.profiles?.email ?? null,
      }));
    },
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
  });
}

function useTeacherCPD(teacherId: string | undefined, schoolId: string | undefined, year: string) {
  return useQuery<CPDEntry[]>({
    queryKey: ['cpd_entries_for_teacher', teacherId, schoolId, year],
    queryFn: async () => {
      if (!teacherId || !schoolId) return [];
      const { data, error } = await supabase
        .from('cpd_entries')
        .select('id, title, cpd_date, hours, category')
        .eq('school_id', schoolId)
        .eq('teacher_id', teacherId)
        .eq('academic_year', year)
        .order('cpd_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CPDEntry[];
    },
    enabled: !!teacherId && !!schoolId,
    staleTime: 1000 * 60 * 5,
  });
}

// ─── PDF Export ───────────────────────────────────────────────

function exportAppraisalPDF(
  cycle: AppraisalCycle,
  targets: AppraisalTarget[],
  notes: AppraisalNote[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  const addText = (text: string, opts: { size?: number; bold?: boolean; color?: [number,number,number]; indent?: number } = {}) => {
    doc.setFontSize(opts.size ?? 11);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    if (opts.color) doc.setTextColor(...opts.color);
    else doc.setTextColor(40, 40, 40);
    const x = margin + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(text, pageWidth - margin - x);
    lines.forEach((line: string) => {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.text(line, x, y);
      y += (opts.size ?? 11) * 0.45;
    });
    y += 2;
  };

  const divider = () => {
    if (y > 270) { doc.addPage(); y = margin; }
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };

  // Header
  addText('Teacher Appraisal / PDR Summary', { size: 18, bold: true, color: [1, 105, 111] });
  divider();
  addText(`Teacher: ${cycle.teacher?.full_name ?? '—'}`, { bold: true });
  addText(`Reviewer: ${cycle.reviewer?.full_name ?? 'Not assigned'}`);
  addText(`Academic Year: ${cycle.academic_year}`);
  addText(`Status: ${STATUS_CONFIG[cycle.status]?.label ?? cycle.status}`);
  if (cycle.overall_rating) {
    addText(`Overall Rating: ${cycle.overall_rating} — ${RATING_CONFIG[cycle.overall_rating]?.label ?? ''}`, { bold: true });
  }
  y += 4;

  // Targets
  addText('Targets', { size: 14, bold: true });
  divider();
  if (targets.length === 0) {
    addText('No targets set.', { color: [120, 120, 120] });
  } else {
    targets.forEach((t, i) => {
      addText(`${i + 1}. ${t.title}`, { bold: true });
      if (t.category) addText(`Category: ${CATEGORY_LABELS[t.category] ?? t.category}`, { indent: 4 });
      if (t.success_criteria) addText(`Success Criteria: ${t.success_criteria}`, { indent: 4 });
      if (t.target_date) addText(`Target Date: ${t.target_date}`, { indent: 4 });
      if (t.midyear_progress) {
        addText('Mid-Year Progress:', { indent: 4, bold: true });
        addText(t.midyear_progress, { indent: 8 });
      }
      if (t.midyear_rating) addText(`Mid-Year Rating: ${t.midyear_rating} — ${RATING_CONFIG[t.midyear_rating]?.label}`, { indent: 4 });
      if (t.endyear_evidence) {
        addText('End-Year Evidence:', { indent: 4, bold: true });
        addText(t.endyear_evidence, { indent: 8 });
      }
      if (t.endyear_rating) addText(`End-Year Rating: ${t.endyear_rating} — ${RATING_CONFIG[t.endyear_rating]?.label}`, { indent: 4 });
      y += 2;
    });
  }

  // Notes
  if (notes.length > 0) {
    y += 4;
    addText('Reviewer Notes', { size: 14, bold: true });
    divider();
    notes.forEach((n) => {
      const stage = n.stage ? STAGE_LABELS[n.stage] : '';
      addText(`[${stage}] ${n.author?.full_name ?? 'Unknown'} — ${n.created_at.slice(0, 10)}`, { bold: true, size: 10 });
      addText(n.content, { indent: 4, size: 10 });
      y += 2;
    });
  }

  const teacherName = (cycle.teacher?.full_name ?? 'teacher').replace(/\s+/g, '-').toLowerCase();
  doc.save(`appraisal-${teacherName}-${cycle.academic_year}.pdf`);
}

// ─── Target Form ──────────────────────────────────────────────

interface TargetFormProps {
  cycleId: string;
  target?: AppraisalTarget;
  onSaved: () => void;
  onCancel: () => void;
}

function TargetForm({ cycleId, target, onSaved, onCancel }: TargetFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title:            target?.title ?? '',
    description:      target?.description ?? '',
    success_criteria: target?.success_criteria ?? '',
    target_date:      target?.target_date ?? '',
    category:         target?.category ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        cycle_id:         cycleId,
        title:            form.title.trim(),
        description:      form.description.trim() || null,
        success_criteria: form.success_criteria.trim() || null,
        target_date:      form.target_date || null,
        category:         form.category || null,
      };
      if (target) {
        await supabase.from('appraisal_targets').update(payload).eq('id', target.id);
      } else {
        await supabase.from('appraisal_targets').insert(payload);
      }
      await qc.invalidateQueries({ queryKey: ['appraisal_targets', cycleId] });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="e.g. Improve student reading comprehension scores"
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
          <select
            value={form.category}
            onChange={e => set('category', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f]"
          >
            <option value="">Select…</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Target Date</label>
          <input
            type="date"
            value={form.target_date}
            onChange={e => set('target_date', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f]"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Success Criteria</label>
        <textarea
          rows={2}
          value={form.success_criteria}
          onChange={e => set('success_criteria', e.target.value)}
          placeholder="How will success be measured?"
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f] resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f] resize-none"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !form.title.trim()}
          className="px-4 py-1.5 bg-[#01696f] text-white rounded-md text-sm font-medium hover:bg-[#015a5f] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Target'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── CPD Picker (mini-modal) ───────────────────────────────────

interface CPDPickerProps {
  teacherId: string;
  schoolId: string;
  year: string;
  target: AppraisalTarget;
  onClose: () => void;
  onLinked: () => void;
}

function CPDPicker({ teacherId, schoolId, year, target, onClose, onLinked }: CPDPickerProps) {
  const qc = useQueryClient();
  const { data: cpdEntries = [] } = useTeacherCPD(teacherId, schoolId, year);
  const [linking, setLinking] = useState<string | null>(null);

  const linkCPD = async (entry: CPDEntry) => {
    setLinking(entry.id);
    const currentEvidence = target.endyear_evidence ?? '';
    const ref = `[CPD: ${entry.title} (${entry.cpd_date}, ${entry.hours}h)]`;
    const newEvidence = currentEvidence ? `${currentEvidence}\n${ref}` : ref;
    await supabase
      .from('appraisal_targets')
      .update({ endyear_evidence: newEvidence })
      .eq('id', target.id);
    await qc.invalidateQueries({ queryKey: ['appraisal_targets', target.cycle_id] });
    setLinking(null);
    onLinked();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-semibold text-sm text-gray-900">Link CPD Entry</p>
            <p className="text-xs text-gray-500 mt-0.5">Target: {target.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {cpdEntries.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No CPD entries for this teacher in {year}</p>
          ) : (
            cpdEntries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-[#01696f]/40 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{entry.title}</p>
                  <p className="text-xs text-gray-500">{entry.cpd_date} · {entry.hours}h{entry.category ? ` · ${entry.category}` : ''}</p>
                </div>
                <button
                  onClick={() => linkCPD(entry)}
                  disabled={linking === entry.id}
                  className="ml-3 shrink-0 px-3 py-1 bg-[#01696f] text-white rounded-md text-xs font-medium hover:bg-[#015a5f] disabled:opacity-50"
                >
                  {linking === entry.id ? '…' : 'Link'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cycle Detail View ────────────────────────────────────────

interface CycleDetailProps {
  cycle: AppraisalCycle;
  schoolId: string;
  year: string;
  canEdit: boolean;   // admin/HOD can edit ratings, status
  isOwner: boolean;   // teacher can edit their own progress fields
  onBack: () => void;
  profileId: string;
}

function CycleDetail({ cycle, schoolId, year, canEdit, isOwner, onBack, profileId }: CycleDetailProps) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { data: targets = [] } = useTargets(cycle.id);
  const { data: notes = [] } = useNotes(cycle.id);
  const [addingTarget, setAddingTarget] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [cpdPickerTarget, setCpdPickerTarget] = useState<AppraisalTarget | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteStage, setNoteStage] = useState<'initial' | 'midyear' | 'endyear'>('initial');
  const [addingNote, setAddingNote] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline field saver for target mid/end fields
  const saveTargetField = async (targetId: string, field: string, value: string | number | null) => {
    await supabase.from('appraisal_targets').update({ [field]: value }).eq('id', targetId);
    await qc.invalidateQueries({ queryKey: ['appraisal_targets', cycle.id] });
  };

  // Advance cycle status
  const advanceStatus = async () => {
    const idx = STATUS_ORDER.indexOf(cycle.status);
    if (idx >= STATUS_ORDER.length - 1) return;
    const next = STATUS_ORDER[idx + 1];
    setSaving(true);
    const { error } = await supabase
      .from('appraisal_cycles')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', cycle.id);
    if (error) showToast('Failed to advance status', 'error');
    else await qc.invalidateQueries({ queryKey: ['appraisal_cycles'] });
    setSaving(false);
  };

  // Set overall rating
  const setOverallRating = async (rating: number) => {
    await supabase.from('appraisal_cycles').update({ overall_rating: rating }).eq('id', cycle.id);
    await qc.invalidateQueries({ queryKey: ['appraisal_cycles'] });
  };

  // Delete target
  const deleteTarget = async (targetId: string) => {
    await supabase.from('appraisal_targets').delete().eq('id', targetId);
    await qc.invalidateQueries({ queryKey: ['appraisal_targets', cycle.id] });
  };

  // Add note
  const submitNote = async () => {
    if (!noteContent.trim()) return;
    setAddingNote(true);
    const { error } = await supabase.from('appraisal_notes').insert({
      cycle_id:  cycle.id,
      author_id: profileId,
      stage:     noteStage,
      content:   noteContent.trim(),
    });
    if (!error) {
      setNoteContent('');
      await qc.invalidateQueries({ queryKey: ['appraisal_notes', cycle.id] });
    }
    setAddingNote(false);
  };

  const canAdvance = cycle.status !== 'complete';
  const nextStatus = STATUS_ORDER[STATUS_ORDER.indexOf(cycle.status) + 1];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex-1" />
        <button
          onClick={() => exportAppraisalPDF(cycle, targets, notes)}
          className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          <FileDown className="h-4 w-4" /> Export PDF
        </button>
      </div>

      {/* Teacher + status card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{cycle.teacher?.full_name ?? 'Teacher'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {cycle.academic_year} · Reviewer: {cycle.reviewer?.full_name ?? 'Not assigned'}
            </p>
          </div>
          <StatusBadge status={cycle.status} />
        </div>

        <div className="mt-4">
          <StepperBar status={cycle.status} />
        </div>

        {canEdit && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {canAdvance && (
              <button
                onClick={advanceStatus}
                disabled={saving}
                className="px-4 py-1.5 bg-[#01696f] text-white rounded-md text-sm font-medium hover:bg-[#015a5f] disabled:opacity-50"
              >
                {saving ? 'Saving…' : `Advance to: ${STATUS_CONFIG[nextStatus]?.label ?? nextStatus}`}
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Overall Rating:</span>
              {[1, 2, 3, 4].map(r => (
                <button
                  key={r}
                  onClick={() => setOverallRating(r)}
                  className={`px-2 py-0.5 rounded border text-xs font-medium transition-colors ${
                    cycle.overall_rating === r
                      ? 'border-[#01696f] bg-[#01696f] text-white'
                      : 'border-gray-200 text-gray-600 hover:border-[#01696f]'
                  }`}
                >
                  {r}
                </button>
              ))}
              {cycle.overall_rating && (
                <span className="text-xs text-gray-500">— {RATING_CONFIG[cycle.overall_rating]?.label}</span>
              )}
            </div>
          </div>
        )}

        {!canEdit && cycle.overall_rating && (
          <div className="mt-3">
            <span className="text-sm text-gray-600 font-medium">Overall Rating: </span>
            <RatingBadge rating={cycle.overall_rating} />
          </div>
        )}
      </div>

      {/* Targets */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Targets</h3>
          {canEdit && !addingTarget && (
            <button
              onClick={() => setAddingTarget(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#01696f] text-white rounded-lg text-sm font-medium hover:bg-[#015a5f]"
            >
              <Plus className="h-3.5 w-3.5" /> Add Target
            </button>
          )}
        </div>

        {addingTarget && (
          <div className="mb-4">
            <TargetForm
              cycleId={cycle.id}
              onSaved={() => setAddingTarget(false)}
              onCancel={() => setAddingTarget(false)}
            />
          </div>
        )}

        {targets.length === 0 && !addingTarget ? (
          <p className="text-sm text-gray-400 text-center py-6">No targets set yet.</p>
        ) : (
          <div className="space-y-4">
            {targets.map(target => (
              <div key={target.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {editingTargetId === target.id ? (
                  <div className="p-4">
                    <TargetForm
                      cycleId={cycle.id}
                      target={target}
                      onSaved={() => setEditingTargetId(null)}
                      onCancel={() => setEditingTargetId(null)}
                    />
                  </div>
                ) : (
                  <>
                    {/* Target header */}
                    <div className="flex items-start justify-between p-4 bg-gray-50 border-b border-gray-200">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{target.title}</span>
                          {target.category && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[target.category] ?? 'bg-gray-100 text-gray-600'}`}>
                              {CATEGORY_LABELS[target.category] ?? target.category}
                            </span>
                          )}
                          {target.target_date && (
                            <span className="text-[10px] text-gray-400">Due: {target.target_date}</span>
                          )}
                        </div>
                        {target.success_criteria && (
                          <p className="text-xs text-gray-500 mt-1">Criteria: {target.success_criteria}</p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <button
                            onClick={() => setCpdPickerTarget(target)}
                            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium"
                          >
                            <BookOpen className="h-3.5 w-3.5" /> Link CPD
                          </button>
                          <button
                            onClick={() => setEditingTargetId(target.id)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTarget(target.id)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Mid-year section */}
                    <div className="grid grid-cols-2 divide-x divide-gray-200">
                      <div className="p-4">
                        <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-2">Mid-Year Progress</p>
                        {(isOwner || canEdit) ? (
                          <textarea
                            rows={2}
                            defaultValue={target.midyear_progress ?? ''}
                            onBlur={e => saveTargetField(target.id, 'midyear_progress', e.target.value || null)}
                            placeholder="Describe progress made…"
                            className="w-full text-xs text-gray-700 bg-transparent border-0 resize-none focus:outline-none focus:ring-0 p-0"
                          />
                        ) : (
                          <p className="text-xs text-gray-600">{target.midyear_progress ?? '—'}</p>
                        )}
                        {canEdit && (
                          <div className="mt-2">
                            <span className="text-[10px] text-gray-500 mr-2">Rating:</span>
                            {[1, 2, 3, 4].map(r => (
                              <button
                                key={r}
                                onClick={() => saveTargetField(target.id, 'midyear_rating', r)}
                                className={`mr-1 w-6 h-6 rounded text-[10px] font-medium border transition-colors ${
                                  target.midyear_rating === r
                                    ? 'bg-amber-500 border-amber-500 text-white'
                                    : 'border-gray-200 text-gray-500 hover:border-amber-400'
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                            {target.midyear_rating && (
                              <span className="text-[10px] text-gray-400">{RATING_CONFIG[target.midyear_rating]?.label}</span>
                            )}
                          </div>
                        )}
                        {!canEdit && target.midyear_rating && (
                          <div className="mt-1"><RatingBadge rating={target.midyear_rating} /></div>
                        )}
                      </div>

                      {/* End-year section */}
                      <div className="p-4">
                        <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-2">End-of-Year Evidence</p>
                        {(isOwner || canEdit) ? (
                          <textarea
                            rows={2}
                            defaultValue={target.endyear_evidence ?? ''}
                            onBlur={e => saveTargetField(target.id, 'endyear_evidence', e.target.value || null)}
                            placeholder="Evidence of achievement…"
                            className="w-full text-xs text-gray-700 bg-transparent border-0 resize-none focus:outline-none focus:ring-0 p-0"
                          />
                        ) : (
                          <p className="text-xs text-gray-600">{target.endyear_evidence ?? '—'}</p>
                        )}
                        {canEdit && (
                          <div className="mt-2">
                            <span className="text-[10px] text-gray-500 mr-2">Rating:</span>
                            {[1, 2, 3, 4].map(r => (
                              <button
                                key={r}
                                onClick={() => saveTargetField(target.id, 'endyear_rating', r)}
                                className={`mr-1 w-6 h-6 rounded text-[10px] font-medium border transition-colors ${
                                  target.endyear_rating === r
                                    ? 'bg-green-600 border-green-600 text-white'
                                    : 'border-gray-200 text-gray-500 hover:border-green-400'
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                            {target.endyear_rating && (
                              <span className="text-[10px] text-gray-400">{RATING_CONFIG[target.endyear_rating]?.label}</span>
                            )}
                          </div>
                        )}
                        {!canEdit && target.endyear_rating && (
                          <div className="mt-1"><RatingBadge rating={target.endyear_rating} /></div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-400" /> Reviewer Notes
        </h3>
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No notes yet.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {notes.map(note => (
              <div key={note.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  {note.stage && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      {STAGE_LABELS[note.stage]}
                    </span>
                  )}
                  <span className="text-xs font-medium text-gray-700">{note.author?.full_name ?? 'Unknown'}</span>
                  <span className="text-xs text-gray-400">{note.created_at.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <div className="flex items-center gap-3">
            <select
              value={noteStage}
              onChange={e => setNoteStage(e.target.value as typeof noteStage)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#01696f]"
            >
              {Object.entries(STAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <textarea
              rows={2}
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f] resize-none"
            />
            <button
              onClick={submitNote}
              disabled={addingNote || !noteContent.trim()}
              className="px-3 py-1.5 bg-[#01696f] text-white rounded-md text-sm font-medium hover:bg-[#015a5f] disabled:opacity-50"
            >
              {addingNote ? '…' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      {/* CPD Picker */}
      {cpdPickerTarget && (
        <CPDPicker
          teacherId={cycle.teacher_id}
          schoolId={schoolId}
          year={year}
          target={cpdPickerTarget}
          onClose={() => setCpdPickerTarget(null)}
          onLinked={() => setCpdPickerTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function AppraisalPage() {
  const { school, profile } = useSchoolStore();
  const { isTeacher, isHOD, isSchoolAdmin, isSuperAdmin } = usePermissions();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { years, currentYear } = useAcademicYears();

  const [yearFilter, setYearFilter] = useState('');
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [creatingForTeacherId, setCreatingForTeacherId] = useState<string | null>(null);

  const resolvedYear =
    yearFilter ||
    currentYear?.label ||
    years[0]?.label ||
    String(new Date().getFullYear());

  const canManage = isSchoolAdmin || isHOD || isSuperAdmin;

  // Teachers only see their own cycle; admins see all
  const teacherFilter = isTeacher ? (profile?.id ?? undefined) : undefined;
  const { data: cycles = [], isLoading } = useCycles(school?.id, resolvedYear, teacherFilter);
  const { data: allTeachers = [] } = useTeachers(school?.id);

  const selectedCycle = useMemo(
    () => cycles.find(c => c.id === selectedCycleId) ?? null,
    [cycles, selectedCycleId],
  );

  // Teachers without an active appraisal cycle
  const cycleTeacherIds = useMemo(() => new Set(cycles.map(c => c.teacher_id)), [cycles]);
  const teachersWithoutCycle = useMemo(
    () => allTeachers.filter(t => !cycleTeacherIds.has(t.user_id)),
    [allTeachers, cycleTeacherIds],
  );

  const startAppraisal = async (teacherId: string) => {
    if (!school?.id) return;
    setCreatingForTeacherId(teacherId);
    const { error } = await supabase.from('appraisal_cycles').insert({
      school_id:     school.id,
      teacher_id:    teacherId,
      academic_year: resolvedYear,
      reviewer_id:   profile?.id ?? null,
      status:        'draft',
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      await qc.invalidateQueries({ queryKey: ['appraisal_cycles', school.id, resolvedYear] });
      showToast('Appraisal cycle started', 'success');
    }
    setCreatingForTeacherId(null);
  };

  // ── Teacher own-cycle view ──────────────────────────────────

  if (isTeacher) {
    const ownCycle = cycles[0] ?? null;
    return (
      <div className="min-h-screen bg-[#f7f6f2]">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <div className="flex items-center gap-3 mb-6">
            <UserCheck className="h-6 w-6 text-[#01696f]" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">My Appraisal</h1>
              <p className="text-sm text-gray-500">Professional Development Review</p>
            </div>
            <div className="ml-auto">
              <select
                value={yearFilter}
                onChange={e => setYearFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f]"
              >
                <option value="">Current Year</option>
                {years.map(y => (
                  <option key={y.id} value={y.label}>{y.label}</option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : !ownCycle ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <UserCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No appraisal started for {resolvedYear}</p>
              <p className="text-sm text-gray-400 mt-1">Your line manager will initiate your appraisal cycle.</p>
            </div>
          ) : selectedCycleId === ownCycle.id ? (
            <CycleDetail
              cycle={ownCycle}
              schoolId={school?.id ?? ''}
              year={resolvedYear}
              canEdit={false}
              isOwner={true}
              onBack={() => setSelectedCycleId(null)}
              profileId={profile?.id ?? ''}
            />
          ) : (
            <div
              className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-[#01696f]/40 hover:shadow-sm transition-all"
              onClick={() => setSelectedCycleId(ownCycle.id)}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-gray-900">{resolvedYear} Appraisal</p>
                  <p className="text-sm text-gray-500 mt-0.5">Reviewer: {ownCycle.reviewer?.full_name ?? 'Not assigned'}</p>
                </div>
                <StatusBadge status={ownCycle.status} />
              </div>
              <StepperBar status={ownCycle.status} />
              {ownCycle.overall_rating && (
                <div className="mt-2">
                  <span className="text-sm text-gray-600">Overall: </span>
                  <RatingBadge rating={ownCycle.overall_rating} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Admin / HOD view ──────────────────────────────────────────

  if (selectedCycle) {
    return (
      <div className="min-h-screen bg-[#f7f6f2]">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <CycleDetail
            cycle={selectedCycle}
            schoolId={school?.id ?? ''}
            year={resolvedYear}
            canEdit={canManage}
            isOwner={false}
            onBack={() => setSelectedCycleId(null)}
            profileId={profile?.id ?? ''}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <UserCheck className="h-6 w-6 text-[#01696f]" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Appraisals</h1>
              <p className="text-sm text-gray-500">Teacher Professional Development Reviews</p>
            </div>
          </div>
          <select
            value={yearFilter}
            onChange={e => setYearFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f]"
          >
            <option value="">Current Year</option>
            {years.map(y => (
              <option key={y.id} value={y.label}>{y.label}</option>
            ))}
          </select>
        </div>

        {/* Summary stats */}
        {cycles.length > 0 && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total',        value: cycles.length,                                            color: 'text-gray-700' },
              { label: 'Complete',     value: cycles.filter(c => c.status === 'complete').length,       color: 'text-green-600' },
              { label: 'In Progress',  value: cycles.filter(c => c.status !== 'complete' && c.status !== 'draft').length, color: 'text-amber-600' },
              { label: 'Draft',        value: cycles.filter(c => c.status === 'draft').length,          color: 'text-gray-400' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Active cycles table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Active Appraisal Cycles — {resolvedYear}</h2>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : cycles.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No appraisal cycles started for {resolvedYear}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3">Teacher</th>
                  <th className="text-left px-4 py-3">Reviewer</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Overall Rating</th>
                  <th className="text-left px-4 py-3">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cycles.map(cycle => (
                  <tr
                    key={cycle.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedCycleId(cycle.id)}
                  >
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {cycle.teacher?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{cycle.reviewer?.full_name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={cycle.status} /></td>
                    <td className="px-4 py-3"><RatingBadge rating={cycle.overall_rating} /></td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{cycle.updated_at.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-[#01696f] hover:underline">View →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Teachers without a cycle */}
        {canManage && teachersWithoutCycle.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Teachers Without Appraisal</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {teachersWithoutCycle.map(teacher => (
                  <tr key={teacher.user_id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{teacher.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{teacher.email}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startAppraisal(teacher.user_id)}
                        disabled={creatingForTeacherId === teacher.user_id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#01696f] text-white rounded-md text-xs font-medium hover:bg-[#015a5f] disabled:opacity-50 ml-auto"
                      >
                        <Plus className="h-3 w-3" />
                        {creatingForTeacherId === teacher.user_id ? 'Starting…' : 'Start Appraisal'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
