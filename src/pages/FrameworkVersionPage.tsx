import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Plus, CheckCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';

// ── Types ─────────────────────────────────────────────────────────────────────

type FrameworkVersion = {
  id: string;
  version_code: string;
  label: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
};

type SchoolRow   = { id: string; name_en: string };
type SedDocument = {
  id: string;
  academic_year: string;
  generated_at: string;
  overall_judgement_snapshot: number | null;
};
type SnapshotRow = {
  id: string;
  indicator_code: string;
  indicator_label_en: string | null;
  standard_code: string;
  domain_number: number;
  rating: number | null;
  strengths_en: string | null;
  improvements_en: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const JUDGEMENT_LABELS: Record<number, string> = {
  1: 'Outstanding', 2: 'Good', 3: 'Satisfactory', 4: 'Unsatisfactory', 5: 'NUI',
};
const JUDGEMENT_COLORS: Record<number, string> = {
  1: 'text-[#437a22] bg-[#437a22]/10',
  2: 'text-[#006494] bg-[#006494]/10',
  3: 'text-[#d19900] bg-[#d19900]/10',
  4: 'text-[#da7101] bg-[#da7101]/10',
  5: 'text-[#a12c7b] bg-[#a12c7b]/10',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FrameworkVersionPage() {
  const { profile } = useSchoolStore();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [addOpen, setAddOpen]     = useState(false);
  const [newVersion, setNewVersion] = useState({ version_code: '', label: '', effective_from: '' });
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedSedId, setSelectedSedId]       = useState('');

  // Guard — redirect non-super-admins
  if (profile && !profile.is_super_admin) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ['framework-versions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('framework_versions')
        .select('*')
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return data as FrameworkVersion[];
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ['fw-schools'],
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('id, name_en').order('name_en');
      return (data ?? []) as SchoolRow[];
    },
  });

  const { data: sedDocuments = [] } = useQuery({
    queryKey: ['fw-sed-docs', selectedSchoolId],
    enabled: !!selectedSchoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sed_documents')
        .select('id, academic_year, generated_at, overall_judgement_snapshot')
        .eq('school_id', selectedSchoolId)
        .order('generated_at', { ascending: false });
      return (data ?? []) as SedDocument[];
    },
  });

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery({
    queryKey: ['fw-snapshots', selectedSedId],
    enabled: !!selectedSedId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sed_indicator_snapshots')
        .select('id, indicator_code, indicator_label_en, standard_code, domain_number, rating, strengths_en, improvements_en')
        .eq('sed_document_id', selectedSedId)
        .order('domain_number')
        .order('indicator_code');
      return (data ?? []) as SnapshotRow[];
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async () => {
      // Find current active version to supersede
      const { data: current } = await supabase
        .from('framework_versions')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      const today = new Date().toISOString().split('T')[0];

      if (current?.id) {
        await supabase
          .from('framework_versions')
          .update({ is_active: false, effective_to: today })
          .eq('id', current.id);
      }

      const { error } = await supabase.from('framework_versions').insert({
        version_code:   newVersion.version_code.trim(),
        label:          newVersion.label.trim(),
        effective_from: newVersion.effective_from,
        is_active:      true,
        effective_to:   null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['framework-versions'] });
      setAddOpen(false);
      setNewVersion({ version_code: '', label: '', effective_from: '' });
      showToast('New framework version added', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Back navigation */}
      <Button
        variant="ghost"
        onClick={() => navigate('/super-admin')}
        className="mb-2 -ml-2 text-sm text-[#6b7280] hover:text-[#1a1a1a]"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Admin Panel
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <GitBranch className="h-6 w-6 text-[#01696f] shrink-0" />
          <div>
            <h1 className="text-xl font-semibold text-[#1a1a1a] font-sans">Framework Versions</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">
              Manage OAAAQA framework versions. Schools are locked to the version active when their academic year was created.
            </p>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Add New Version
        </Button>
      </div>

      {/* Versions table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base">Registered Versions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {versionsLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#e2e0db] bg-gray-50">
                  <tr>
                    {['Version Code', 'Label', 'Effective From', 'Effective To', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e0db]">
                  {versions.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-[#1a1a1a]">{v.version_code}</td>
                      <td className="px-4 py-3 text-[#1a1a1a]">{v.label}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{fmtDate(v.effective_from)}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{v.effective_to ? fmtDate(v.effective_to) : '—'}</td>
                      <td className="px-4 py-3">
                        {v.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#437a22] bg-[#437a22]/10 px-2 py-0.5 rounded-full">
                            <CheckCircle className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-[#6b7280] bg-gray-100 px-2 py-0.5 rounded-full">
                            Superseded
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {versions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[#6b7280]">No framework versions found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SED Snapshot viewer */}
      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base">SED Indicator Snapshots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selectors */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-[#6b7280] block mb-1">School</label>
              <select
                className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm"
                value={selectedSchoolId}
                onChange={e => { setSelectedSchoolId(e.target.value); setSelectedSedId(''); }}
              >
                <option value="">Select a school…</option>
                {schools.map(s => (
                  <option key={s.id} value={s.id}>{s.name_en}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="text-xs text-[#6b7280] block mb-1">SED Document</label>
              <select
                className="flex h-9 w-full rounded-md border border-[#e2e0db] bg-white px-3 py-1 text-sm disabled:opacity-50"
                value={selectedSedId}
                onChange={e => setSelectedSedId(e.target.value)}
                disabled={!selectedSchoolId}
              >
                <option value="">Select a document…</option>
                {sedDocuments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.academic_year} — {fmtDate(d.generated_at)}
                    {d.overall_judgement_snapshot != null
                      ? ` (${JUDGEMENT_LABELS[d.overall_judgement_snapshot] ?? d.overall_judgement_snapshot})`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Snapshot table */}
          {!selectedSedId ? (
            <p className="text-sm text-[#6b7280] text-center py-8">
              Select a school and SED document to view its frozen indicator snapshot.
            </p>
          ) : snapshotsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-[#6b7280] text-center py-8">
              No snapshot data for this document.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#e2e0db] bg-gray-50">
                  <tr>
                    {['Domain', 'Standard', 'Indicator', 'Label', 'Rating', 'Strengths', 'Improvements'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e0db]">
                  {snapshots.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-[#6b7280] font-mono">{s.domain_number}</td>
                      <td className="px-3 py-2 text-[#6b7280] font-mono text-xs">{s.standard_code}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-[#01696f] text-xs">{s.indicator_code}</td>
                      <td className="px-3 py-2 text-[#1a1a1a] max-w-xs">
                        <span className="line-clamp-2">{s.indicator_label_en ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2">
                        {s.rating != null ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${JUDGEMENT_COLORS[s.rating] ?? 'text-[#6b7280] bg-gray-100'}`}>
                            {JUDGEMENT_LABELS[s.rating] ?? s.rating}
                          </span>
                        ) : (
                          <span className="text-xs text-[#6b7280]">Not rated</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[#6b7280] max-w-xs text-xs">
                        <span className="line-clamp-2">{s.strengths_en || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-[#6b7280] max-w-xs text-xs">
                        <span className="line-clamp-2">{s.improvements_en || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Version Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Framework Version</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#6b7280] block mb-1">Version Code*</label>
              <Input
                placeholder="e.g. OAAAQA-2025"
                value={newVersion.version_code}
                onChange={e => setNewVersion({ ...newVersion, version_code: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[#6b7280] block mb-1">Label*</label>
              <Input
                placeholder="e.g. OAAAQA Framework 2025"
                value={newVersion.label}
                onChange={e => setNewVersion({ ...newVersion, label: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[#6b7280] block mb-1">Effective From*</label>
              <Input
                type="date"
                value={newVersion.effective_from}
                onChange={e => setNewVersion({ ...newVersion, effective_from: e.target.value })}
              />
            </div>
            <p className="text-xs text-[#6b7280]">
              Adding a new version will mark the currently active version as superseded (effective_to = today).
            </p>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setAddOpen(false)} className="flex-1">Cancel</Button>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={
                  !newVersion.version_code.trim() ||
                  !newVersion.label.trim() ||
                  !newVersion.effective_from ||
                  addMutation.isPending
                }
                className="flex-1"
              >
                {addMutation.isPending ? 'Adding…' : 'Add Version'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
