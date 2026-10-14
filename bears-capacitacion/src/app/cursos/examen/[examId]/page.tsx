import { notFound } from "next/navigation";
import { ExamPlayer } from "@/components/learning/exam-player";
import { requirePortalRole } from "@/lib/auth/roles";
import { PortalLayout } from "@/components/portal/portal-layout";
import { getEmployeeExam } from "@/lib/platform/employee";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type ExamPageProps = {
  params: Promise<{ examId: string }>;
};

export default async function ExamPage({ params }: ExamPageProps) {
  if (!isSupabaseConfigured()) notFound();

  const viewer = await requirePortalRole(["empleado", "franquiciado"]);
  const { examId } = await params;
  const exam = await getEmployeeExam(viewer, examId);
  if (!exam) notFound();

  return viewer.previewAdminId
    ? <PortalLayout viewer={viewer} activeKey="learning"><ExamPlayer exam={exam} readOnly /></PortalLayout>
    : <ExamPlayer exam={exam} />;
}