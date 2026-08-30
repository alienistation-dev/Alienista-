'use client';

import { useState, useTransition } from 'react';
import { createSanctionPolicyVersionAction, toggleSanctionsAction } from '@/lib/actions/settings';
import type { SanctionPolicy, SanctionPolicyMode } from '@/lib/types/models';
import { Plus, Save, Scale, Trash2 } from 'lucide-react';

interface TierDraft {
  label: string;
  threshold: string;
  obligation_text: string;
}

const emptyTier = (): TierDraft => ({ label: '', threshold: '', obligation_text: '' });

export function SanctionsPolicyEditor({
  initialEnabled,
  initialPolicy,
}: {
  initialEnabled: boolean;
  initialPolicy: SanctionPolicy | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [name, setName] = useState(initialPolicy?.name || 'Attendance obligations');
  const [mode, setMode] = useState<SanctionPolicyMode>(initialPolicy?.mode || 'weighted_missed_points');
  const [activate, setActivate] = useState(true);
  const [tiers, setTiers] = useState<TierDraft[]>(() => initialPolicy?.tiers.length
    ? initialPolicy.tiers.map((tier) => ({
        label: tier.label,
        threshold: String(mode === 'weighted_missed_points'
          ? tier.minimum_missed_points ?? ''
          : Math.round((tier.maximum_attendance_ratio ?? 0) * 100)),
        obligation_text: tier.obligation_text,
      }))
    : [emptyTier()]);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const setPolicyMode = (nextMode: SanctionPolicyMode) => {
    setMode(nextMode);
    setTiers((current) => current.map((tier) => ({ ...tier, threshold: '' })));
  };

  const handleToggle = () => {
    const nextEnabled = !enabled;
    startTransition(async () => {
      const result = await toggleSanctionsAction(nextEnabled);
      if (!result.success) {
        setFeedback({ message: result.error, error: true });
        return;
      }
      setEnabled(nextEnabled);
      setFeedback({ message: result.message || 'Sanctions setting updated.', error: false });
    });
  };

  const handleCreateVersion = () => {
    startTransition(async () => {
      const result = await createSanctionPolicyVersionAction({
        name,
        mode,
        activate,
        tiers: tiers.map((tier) => ({
          label: tier.label,
          threshold: tier.threshold.trim() === '' ? Number.NaN : Number(tier.threshold),
          obligation_text: tier.obligation_text,
        })),
      });
      if (!result.success) {
        setFeedback({ message: result.error, error: true });
        return;
      }
      setFeedback({ message: result.message || 'Policy version created.', error: false });
      window.location.reload();
    });
  };

  return (
    <section className="space-y-5 rounded-2xl border border-[#E5EBE5] bg-white p-6 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Scale className="h-4 w-4 text-[#2D6A4F]" /> Sanctions Policy</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {initialPolicy ? `Active: ${initialPolicy.name} · Version ${initialPolicy.version}` : 'No active policy'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <input type="checkbox" checked={enabled} disabled={isPending} onChange={handleToggle} className="h-4 w-4 accent-[#2D6A4F]" />
          Sanctions enabled
        </label>
      </div>

      {feedback && (
        <div className={`rounded-lg border p-3 text-xs font-semibold ${feedback.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-[#C2E0CC] bg-[#EBF5EE] text-[#1B4332]'}`}>
          {feedback.message}
        </div>
      )}

      <div className="space-y-4 border-t border-border pt-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-xs font-semibold text-slate-700">
            Policy name
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-foreground" />
          </label>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-700">Mode</span>
            <div className="inline-flex rounded-lg border border-border bg-slate-50 p-1">
              <button type="button" onClick={() => setPolicyMode('weighted_missed_points')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === 'weighted_missed_points' ? 'bg-white text-[#1B4332] shadow-xs' : 'text-muted-foreground'}`}>Missed points</button>
              <button type="button" onClick={() => setPolicyMode('attendance_percentage')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === 'attendance_percentage' ? 'bg-white text-[#1B4332] shadow-xs' : 'text-muted-foreground'}`}>Attendance %</button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {tiers.map((tier, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-border bg-slate-50 p-3 sm:grid-cols-[1fr_8rem_2fr_auto] sm:items-end">
              <label className="text-xs font-semibold text-slate-700">Tier name<input value={tier.label} onChange={(event) => setTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground" /></label>
              <label className="text-xs font-semibold text-slate-700">{mode === 'weighted_missed_points' ? 'Min. missed' : 'Max. %'}<input type="number" min="0" max={mode === 'attendance_percentage' ? 100 : undefined} step={mode === 'attendance_percentage' ? 1 : 0.01} value={tier.threshold} onChange={(event) => setTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, threshold: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground" /></label>
              <label className="text-xs font-semibold text-slate-700">Obligation<input value={tier.obligation_text} onChange={(event) => setTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, obligation_text: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground" /></label>
              <button type="button" title="Remove tier" disabled={tiers.length === 1} onClick={() => setTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => setTiers((current) => [...current, emptyTier()])} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold text-[#2D6A4F] hover:bg-[#EBF5EE]"><Plus className="h-3.5 w-3.5" /> Add tier</button>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={activate} onChange={(event) => setActivate(event.target.checked)} className="h-4 w-4 accent-[#2D6A4F]" /> Activate new version</label>
            <button type="button" disabled={isPending} onClick={handleCreateVersion} className="inline-flex items-center gap-1.5 rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Create version</button>
          </div>
        </div>
      </div>
    </section>
  );
}
