'use server';

import { requireRole } from '@/lib/auth/guards';
import { calculateStudentAssessment, selectSanctionTier, type AssessmentEventInput } from '@/lib/sanctions/calculate-assessment';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { ActionResponse } from '@/lib/types/actions';
import type { SanctionPolicy, SemesterAssessment } from '@/lib/types/models';
import { revalidatePath } from 'next/cache';

type PolicyRow = SanctionPolicy & { sanction_tiers?: SanctionPolicy['tiers'] };

function termKey(settings: { academic_year: string; semester: string }): string {
  return `${settings.academic_year}:${settings.semester}`;
}

async function resolveTerm(admin: ReturnType<typeof createAdminClient>, orgId: string, requestedTerm: string) {
  const { data, error } = await admin
    .from('organization_settings')
    .select('academic_year, semester, sanctions_enabled')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error || !data) throw new Error('Organization term settings are unavailable.');
  if (!data.sanctions_enabled) throw new Error('Sanctions are disabled in organization settings.');
  const currentTerm = termKey(data);
  if (requestedTerm !== currentTerm) throw new Error('The requested semester is not the active organization term.');
  return currentTerm;
}

async function requireSanctionsEnabled(admin: ReturnType<typeof createAdminClient>, orgId: string) {
  const { data, error } = await admin
    .from('organization_settings')
    .select('sanctions_enabled')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error || !data) throw new Error('Organization settings are unavailable.');
  if (!data.sanctions_enabled) throw new Error('Sanctions are disabled in organization settings.');
  const { data: policy, error: policyError } = await admin
    .from('sanction_policies')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .maybeSingle();
  if (policyError || !policy) throw new Error('An active sanction policy is required.');
  return policy.id as string;
}

async function loadPolicy(admin: ReturnType<typeof createAdminClient>, orgId: string, policyId?: string) {
  let query = admin.from('sanction_policies').select('*, sanction_tiers(*)').eq('organization_id', orgId);
  query = policyId
    ? query.eq('id', policyId).eq('is_active', true)
    : query.eq('is_active', true).order('version', { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error('Sanction policy not found for this organization.');
  const row = data as PolicyRow;
  return { ...row, tiers: row.sanction_tiers || row.tiers || [] } as SanctionPolicy;
}

export async function calculateSemesterAssessment(
  semesterId: string,
  policyId?: string
): Promise<ActionResponse<SemesterAssessment[]>> {
  let user;
  try { user = await requireRole('admin'); } catch { return { success: false, error: 'Only admins can calculate assessments.' }; }

  try {
    const orgId = await getEffectiveOrgId(user.organization_id);
    const admin = createAdminClient();
    const term = await resolveTerm(admin, orgId, semesterId);
    const policy = await loadPolicy(admin, orgId, policyId);
    const { data: students, error: studentsError } = await admin
      .from('students').select('id').eq('organization_id', orgId).eq('status', 'Active');
    if (studentsError) throw new Error(studentsError.message);

    const { data: events, error: eventsError } = await admin
      .from('events')
      .select('id, name, weight, slots:event_slots(id, label, is_required), attendance:attendance_records(student_id, slot_id, attendance_status, late_penalty_percent, earned_points_override)')
      .eq('organization_id', orgId)
      .eq('term_key', term);
    if (eventsError) throw new Error(eventsError.message);

    const { data: locked, error: lockedError } = await admin
      .from('semester_assessments').select('*').eq('organization_id', orgId).eq('term_key', term)
      .in('status', ['finalized', 'corrected']);
    if (lockedError) throw new Error(lockedError.message);
    const lockedByStudent = new Map((locked || []).map((assessment) => [assessment.student_id, assessment]));

    const assessments: SemesterAssessment[] = [];
    for (const student of students || []) {
      const existingLocked = lockedByStudent.get(student.id);
      if (existingLocked) {
        assessments.push(existingLocked as SemesterAssessment);
        continue;
      }
      const inputs: AssessmentEventInput[] = (events || []).map((event) => ({
        id: event.id,
        name: event.name,
        weight: Number(event.weight),
        slots: (event.slots || []).map((slot: { id: string; label: string; is_required: boolean }) => slot),
        attendance: (event.attendance || [])
          .filter((attendance: { student_id: string }) => attendance.student_id === student.id)
          .map((attendance: { slot_id: string | null; attendance_status: 'on_time' | 'late' | 'manual'; late_penalty_percent: number; earned_points_override: number | null }) => attendance),
      }));
      const calculated = calculateStudentAssessment(student.id, inputs, policy);
      const tier = selectSanctionTier(calculated.missed_points, calculated.attendance_ratio, policy);
      const payload = {
        organization_id: orgId,
        student_id: student.id,
        term_key: term,
        policy_id: policy.id,
        policy_version: policy.version,
        status: 'draft',
        maximum_points: calculated.maximum_points,
        earned_points: calculated.earned_points,
        missed_points: calculated.missed_points,
        attendance_ratio: calculated.attendance_ratio,
        tier_label: tier?.label || null,
        tier_threshold: tier?.matched_threshold || null,
        obligation_text: tier?.obligation_text || null,
        contributions: calculated.contributions,
      };
      const { data: assessment, error } = await admin
        .from('semester_assessments')
        .upsert(payload, { onConflict: 'organization_id,student_id,term_key' })
        .select('*').single();
      if (error || !assessment) throw new Error(error?.message || 'Failed to persist assessment.');
      assessments.push(assessment as SemesterAssessment);
    }
    revalidatePath('/assessments');
    return { success: true, data: assessments };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to calculate assessments.' };
  }
}

export async function finalizeSemesterAssessment(assessmentId: string): Promise<ActionResponse<SemesterAssessment>> {
  let user;
  try { user = await requireRole('admin'); } catch { return { success: false, error: 'Only admins can finalize assessments.' }; }
  try {
    const orgId = await getEffectiveOrgId(user.organization_id);
    const admin = createAdminClient();
    const activePolicyId = await requireSanctionsEnabled(admin, orgId);
    const { data, error } = await admin
      .from('semester_assessments')
      .update({ status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: user.id })
      .eq('id', assessmentId).eq('organization_id', orgId).eq('policy_id', activePolicyId).eq('status', 'draft')
      .select('*').maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Assessment is missing, outside your organization, or already finalized.' };
    revalidatePath('/assessments');
    return { success: true, data: data as SemesterAssessment };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to finalize assessment.' };
  }
}

export async function getSemesterAssessmentsAction(termKey: string): Promise<ActionResponse<SemesterAssessment[]>> {
  let user;
  try { user = await requireRole('admin', 'officer'); } catch { return { success: false, error: 'Unauthorized.' }; }
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await admin.from('semester_assessments').select('*')
    .eq('organization_id', orgId).eq('term_key', termKey).order('student_id');
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []) as SemesterAssessment[] };
}

export async function correctSemesterAssessment(
  assessmentId: string,
  reason: string,
  values: Partial<Pick<SemesterAssessment, 'maximum_points' | 'earned_points' | 'missed_points' | 'attendance_ratio' | 'tier_label' | 'tier_threshold' | 'obligation_text' | 'contributions'>>,
): Promise<ActionResponse<SemesterAssessment>> {
  let user;
  try { user = await requireRole('admin'); } catch { return { success: false, error: 'Only admins can correct assessments.' }; }
  if (!reason.trim()) return { success: false, error: 'A correction reason is required.' };
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('correct_semester_assessment', {
    p_assessment_id: assessmentId,
    p_organization_id: orgId,
    p_corrected_by: user.id,
    p_reason: reason.trim(),
    p_values: values,
  });
  if (error || !data) return { success: false, error: error?.message || 'Failed to record correction.' };
  revalidatePath('/assessments');
  return { success: true, data: data as SemesterAssessment };
}
