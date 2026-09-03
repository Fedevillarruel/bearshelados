import { notFound } from "next/navigation";
import { ExamPlayer } from "@/components/learning/exam-player";
import { requireRole } from "@/lib/auth/roles";
import { getEmployeeExam } from "@/lib/platform/employee";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type ExamPageProps = {
  params: Promise<{ examId: string }>;
};

export default async function ExamPage({ params }: ExamPageProps) {
  if (!isSupabaseConfigured()) notFound();

  const viewer = await requireRole(["empleado", "franquiciado"]);
  const { examId } = await params;
  const exam = await getEmployeeExam(viewer, examId);
  if (!exam) notFound();

  return <ExamPlayer exam={exam} />;
}