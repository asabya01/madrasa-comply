import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, CheckSquare, Square, Plus, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useSchoolStore } from '../stores/schoolStore';
import type { AuditChecklistItem, AuditSettings } from '../types';

export function AuditPrepPage() {
  const { school } = useSchoolStore();
  const queryClient = useQueryClient();
  const [newItem, setNewItem] = useState('');
  const [auditDateInput, setAuditDateInput] = useState('');

  const { data: auditSettings } = useQuery({
    queryKey: ['audit-settings', school?.id],
    queryFn: async () => {
      if (!school) return null;
      const { data } = await supabase.from('audit_settings').select('*').eq('school_id', school.id).single();
      return data as AuditSettings | null;
    },
    enabled: !!school,
  });

  // Sync date input when audit settings load from DB
  useEffect(() => {
    if (auditSettings?.expected_audit_date) {
      setAuditDateInput(auditSettings.expected_audit_date);
    }
  }, [auditSettings?.expected_audit_date]);

  const { data: checklist } = useQuery({
    queryKey: ['audit-checklist', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase.from('audit_checklist_items').select('*').eq('school_id', school.id).order('is_custom');
      return (data || []) as AuditChecklistItem[];
    },
    enabled: !!school,
  });

  const { data: evidenceGaps } = useQuery({
    queryKey: ['evidence-gaps', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data: indicators } = await supabase.from('indicators').select('id, description_en, domain_id, standard_id').order('order_num');
      const { data: links } = await supabase.from('evidence_indicator_links').select('indicator_id').eq('school_id', school.id);
      const covered = new Set((links || []).map((l) => l.indicator_id));
      return (indicators || []).filter((i) => !covered.has(i.id));
    },
    enabled: !!school,
  });

  const { data: riskIndicators } = useQuery({
    queryKey: ['risk-indicators', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase
        .from('indicator_ratings')
        .select('indicator_id, rating, indicators(description_en, domain_id)')
        .eq('school_id', school.id)
        .gte('rating', 4)
        .order('rating', { ascending: false });
      return data || [];
    },
    enabled: !!school,
  });

  const setAuditDate = useMutation({
    mutationFn: async (date: string) => {
      if (!school) return;
      await supabase.from('audit_settings').upsert(
        { school_id: school.id, expected_audit_date: date, updated_at: new Date().toISOString() },
        { onConflict: 'school_id' }
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['audit-settings'] }),
  });

  const toggleItem = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      await supabase.from('audit_checklist_items').update({
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
      }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['audit-checklist'] }),
  });

  const addCustomItem = useMutation({
    mutationFn: async () => {
      if (!school || !newItem.trim()) return;
      await supabase.from('audit_checklist_items').insert({
        school_id: school.id,
        category: 'custom',
        item_text: newItem.trim(),
        is_custom: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-checklist'] });
      setNewItem('');
    },
  });

  const daysUntil = auditDateInput
    ? Math.ceil((new Date(auditDateInput).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const completedCount = (checklist || []).filter((i) => i.is_completed).length;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Audit date setter */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <Calendar className="h-6 w-6 text-[#01696f]" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[#1a1a1a]">Expected Audit Date</h3>
              {daysUntil !== null && (
                <p className={`text-sm mt-0.5 ${daysUntil <= 30 ? 'text-red-600 font-medium' : daysUntil <= 90 ? 'text-amber-600' : 'text-[#437a22]'}`}>
                  {daysUntil > 0 ? `${daysUntil} days until audit` : 'Audit date has passed'}
                </p>
              )}
            </div>
            <Input
              type="date"
              value={auditDateInput}
              onChange={(e) => {
                setAuditDateInput(e.target.value);
                if (e.target.value) setAuditDate.mutate(e.target.value);
              }}
              className="w-44"
            />
          </div>
        </CardContent>
      </Card>

      {/* Checklist */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-sans">Pre-Audit Checklist</CardTitle>
            <span className="text-sm text-[#6b7280]">{completedCount}/{checklist?.length || 0} completed</span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {(checklist || []).map((item) => (
              <button
                key={item.id}
                onClick={() => toggleItem.mutate({ id: item.id, is_completed: !item.is_completed })}
                className="flex items-start gap-3 w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {item.is_completed
                  ? <CheckSquare className="h-5 w-5 text-[#437a22] shrink-0 mt-0.5" />
                  : <Square className="h-5 w-5 text-[#6b7280] shrink-0 mt-0.5" />
                }
                <span className={`text-sm ${item.is_completed ? 'line-through text-[#6b7280]' : 'text-[#1a1a1a]'}`}>
                  {item.item_text}
                </span>
              </button>
            ))}
          </div>

          {/* Add custom item */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-[#e2e0db]">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add custom checklist item..."
              onKeyDown={(e) => e.key === 'Enter' && addCustomItem.mutate()}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => addCustomItem.mutate()}
              disabled={!newItem.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Evidence Gaps */}
      {evidenceGaps && evidenceGaps.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <CardTitle className="font-sans">Evidence Gap Report ({evidenceGaps.length} indicators)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {evidenceGaps.slice(0, 20).map((ind) => (
                <div key={ind.id} className="flex items-center gap-2 py-1.5 border-b border-[#e2e0db] last:border-0">
                  <span className="text-xs font-mono text-[#6b7280] shrink-0">{ind.id}</span>
                  <span className="text-xs text-[#1a1a1a]">{ind.description_en}</span>
                </div>
              ))}
              {evidenceGaps.length > 20 && (
                <p className="text-xs text-[#6b7280] pt-2">+ {evidenceGaps.length - 20} more...</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Radar */}
      {riskIndicators && riskIndicators.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <CardTitle className="font-sans">Risk Radar — Unsatisfactory/NUI Indicators</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {riskIndicators.map((r: any) => (
                <div key={r.indicator_id} className={`flex items-center gap-3 p-2.5 rounded-lg ${r.rating === 5 ? 'bg-[#a12c7b]/10' : 'bg-[#da7101]/10'}`}>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded text-white ${r.rating === 5 ? 'bg-[#a12c7b]' : 'bg-[#da7101]'}`}>
                    {r.rating === 5 ? 'NUI' : 'Unsatisfactory'}
                  </span>
                  <span className="text-xs font-mono text-[#6b7280]">{r.indicator_id}</span>
                  <span className="text-xs text-[#1a1a1a] truncate">{r.indicators?.description_en}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
