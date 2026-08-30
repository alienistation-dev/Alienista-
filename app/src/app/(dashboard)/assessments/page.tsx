import { getSettingsDataAction } from '@/lib/actions/settings';
import { getSemesterAssessmentsAction } from '@/lib/actions/assessments';
import { AssessmentsView } from './assessments-view';

export default async function AssessmentsPage() {
  const settings = await getSettingsDataAction();
  if (!settings.success) return <p className="text-sm text-red-600">{settings.error}</p>;
  const termKey = `${settings.data.settings.academic_year}:${settings.data.settings.semester}`;
  const assessments = await getSemesterAssessmentsAction(termKey);
  return <AssessmentsView
    termKey={termKey}
    initialAssessments={assessments.success ? assessments.data : []}
    sanctionsEnabled={Boolean(settings.data.settings.sanctions_enabled)}
  />;
}
