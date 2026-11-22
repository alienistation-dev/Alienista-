'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { calculateSemesterAssessment, finalizeSemesterAssessment } from '@/lib/actions/assessments';
import type { SemesterAssessment } from '@/lib/types/models';

export function AssessmentsView({ termKey, initialAssessments, sanctionsEnabled }: { termKey: string; initialAssessments: SemesterAssessment[]; sanctionsEnabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const calculate = () => startTransition(async () => {
    const result = await calculateSemesterAssessment(termKey);
    if (!result.success) { setError(result.error); return; }
    router.refresh();
  });
  const finalize = (id: string) => startTransition(async () => {
    const result = await finalizeSemesterAssessment(id);
    if (!result.success) { setError(result.error); return; }
    router.refresh();
  });
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-900">Semester Assessments</h1><p className="text-xs text-slate-500">Draft sanctions for {termKey}; review before finalizing.</p></div>
        <button type="button" disabled={isPending || !sanctionsEnabled} onClick={calculate} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isPending ? 'Working...' : 'Calculate drafts'}</button>
      </div>
      {!sanctionsEnabled && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Sanctions are disabled. Existing assessments remain available.</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
      {initialAssessments.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-xs text-slate-500">
          No assessments for this term yet. {sanctionsEnabled ? 'Select "Calculate drafts" to create them from attendance.' : 'Turn on sanctions in Settings first.'}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full text-left text-xs"><thead className="bg-muted"><tr><th className="p-3">Student</th><th className="p-3">Earned / Max</th><th className="p-3">Missed</th><th className="p-3">Tier / obligation</th><th className="p-3">Action</th></tr></thead>
          <tbody>{initialAssessments.map((assessment) => <tr key={assessment.id} className="border-t border-border"><td className="p-3"><span className="font-semibold">{assessment.student?.full_name ?? 'Unknown student'}</span><br /><span className="font-mono text-slate-500">{assessment.student?.uid ?? assessment.student_id}</span></td><td className="p-3">{assessment.earned_points} / {assessment.maximum_points}</td><td className="p-3">{assessment.missed_points}</td><td className="p-3">{assessment.tier_label || 'No sanction'}<br /><span className="text-slate-500">{assessment.obligation_text || ''}</span></td><td className="p-3">{assessment.status === 'draft' ? <button type="button" disabled={isPending || !sanctionsEnabled} onClick={() => finalize(assessment.id)} className="font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40">Finalize</button> : <span className="text-slate-500">{assessment.status}</span>}</td></tr>)}</tbody>
        </table>
      </div>
      )}
    </div>
  );
}
