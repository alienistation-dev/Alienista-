'use client';

import { useTransition } from 'react';
import { calculateSemesterAssessment, finalizeSemesterAssessment } from '@/lib/actions/assessments';
import type { SemesterAssessment } from '@/lib/types/models';

export function AssessmentsView({ termKey, initialAssessments }: { termKey: string; initialAssessments: SemesterAssessment[] }) {
  const [isPending, startTransition] = useTransition();
  const calculate = () => startTransition(async () => { await calculateSemesterAssessment(termKey); window.location.reload(); });
  const finalize = (id: string) => startTransition(async () => { await finalizeSemesterAssessment(id); window.location.reload(); });
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-900">Semester Assessments</h1><p className="text-xs text-slate-500">Draft sanctions for {termKey}; review before finalizing.</p></div>
        <button type="button" disabled={isPending} onClick={calculate} className="rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-bold text-white">{isPending ? 'Working...' : 'Calculate drafts'}</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#E5EBE5] bg-white">
        <table className="w-full text-left text-xs"><thead className="bg-[#F8FAF9]"><tr><th className="p-3">Student</th><th className="p-3">Earned / Max</th><th className="p-3">Missed</th><th className="p-3">Tier / obligation</th><th className="p-3">Action</th></tr></thead>
          <tbody>{initialAssessments.map((assessment) => <tr key={assessment.id} className="border-t border-[#E5EBE5]"><td className="p-3 font-mono">{assessment.student_id}</td><td className="p-3">{assessment.earned_points} / {assessment.maximum_points}</td><td className="p-3">{assessment.missed_points}</td><td className="p-3">{assessment.tier_label || 'No sanction'}<br /><span className="text-slate-500">{assessment.obligation_text || ''}</span></td><td className="p-3">{assessment.status === 'draft' ? <button type="button" disabled={isPending} onClick={() => finalize(assessment.id)} className="font-bold text-[#2D6A4F]">Finalize</button> : <span className="text-slate-500">{assessment.status}</span>}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
