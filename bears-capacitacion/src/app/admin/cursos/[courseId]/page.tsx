import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseBuilder, type BuilderAsset, type BuilderCourse, type BuilderExam, type BuilderModule } from "@/components/admin/course-builder";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  if (!isSupabaseConfigured()) return <PortalShell role="admin" view="courses" />;

  const viewer = await requireRole(["admin"]);
  const { courseId } = await params;
  const supabase = await createClient();
  const { data: courseData } = await supabase.from("courses").select("id, title, slug, description, is_published").eq("id", courseId).maybeSingle();
  if (!courseData) notFound();
  const course: BuilderCourse = { id: courseData.id, title: courseData.title, slug: courseData.slug, description: courseData.description, isPublished: courseData.is_published };

  const [{ data: moduleData }, { data: employeeData }, { data: franchiseData }, { data: enrollmentData }] = await Promise.all([
    supabase.from("modules").select("id, title, description, order_index, is_published").eq("course_id", course.id).order("order_index"),
    supabase.from("profiles").select("id, full_name, email, franchise_id").in("role", ["empleado", "franquiciado"]).eq("is_active", true).order("full_name"),
    supabase.from("franchises").select("id, name"),
    supabase.from("enrollments").select("user_id, due_date, status, progress_percent").eq("course_id", course.id),
  ]);
  const sourceModules = moduleData ?? [];
  const moduleIds = sourceModules.map((courseModule) => courseModule.id);
  const [{ data: assetData }, { data: courseExamData }, { data: moduleExamData }] = await Promise.all([
    moduleIds.length ? supabase.from("assets").select("id, module_id, type, is_primary, title, description, url, storage_path, duration_seconds, order_index").in("module_id", moduleIds).order("order_index") : Promise.resolve({ data: [] }),
    supabase.from("exams").select("id, title, description, course_id, module_id, passing_score, max_attempts, cooldown_minutes, time_limit_minutes, shuffle_questions, shuffle_options, show_correct_answers, blocks_progress, is_active").eq("course_id", course.id),
    moduleIds.length ? supabase.from("exams").select("id, title, description, course_id, module_id, passing_score, max_attempts, cooldown_minutes, time_limit_minutes, shuffle_questions, shuffle_options, show_correct_answers, blocks_progress, is_active").in("module_id", moduleIds) : Promise.resolve({ data: [] }),
  ]);
  const sourceExams = [...(courseExamData ?? []), ...(moduleExamData ?? [])];
  const examIds = sourceExams.map((exam) => exam.id);
  const { data: questionData } = examIds.length ? await supabase.from("questions").select("id, exam_id, prompt, explanation, points, order_index").in("exam_id", examIds).order("order_index") : { data: [] };
  const questionIds = (questionData ?? []).map((question) => question.id);
  const { data: optionData } = questionIds.length ? await supabase.from("options").select("question_id, label, is_correct, order_index").in("question_id", questionIds).order("order_index") : { data: [] };
  const optionsByQuestionId = new Map<string, Array<{ label: string; isCorrect: boolean }>>();
  for (const option of optionData ?? []) optionsByQuestionId.set(option.question_id, [...(optionsByQuestionId.get(option.question_id) ?? []), { label: option.label, isCorrect: option.is_correct }]);
  const questionsByExamId = new Map<string, Array<{ prompt: string; explanation: string | null; points: number; options: Array<{ label: string; isCorrect: boolean }> }>>();
  for (const question of questionData ?? []) questionsByExamId.set(question.exam_id, [...(questionsByExamId.get(question.exam_id) ?? []), { prompt: question.prompt, explanation: question.explanation, points: Number(question.points), options: optionsByQuestionId.get(question.id) ?? [] }]);
  const exams: BuilderExam[] = sourceExams.map((exam) => ({ id: exam.id, title: exam.title, description: exam.description, courseId: exam.course_id, moduleId: exam.module_id, passingScore: Number(exam.passing_score), maxAttempts: exam.max_attempts, cooldownMinutes: exam.cooldown_minutes, timeLimitMinutes: exam.time_limit_minutes, shuffleQuestions: exam.shuffle_questions, shuffleOptions: exam.shuffle_options, showCorrectAnswers: exam.show_correct_answers, blocksProgress: exam.blocks_progress, isActive: exam.is_active, questions: questionsByExamId.get(exam.id) ?? [] }));
  const assets = (assetData ?? []) as Array<{ id: string; module_id: string | null; type: BuilderAsset["type"]; is_primary: boolean; title: string; description: string | null; url: string; storage_path: string | null; duration_seconds: number; order_index: number }>;
  const modules: BuilderModule[] = sourceModules.map((courseModule) => ({ id: courseModule.id, title: courseModule.title, description: courseModule.description, orderIndex: courseModule.order_index, isPublished: courseModule.is_published, assets: assets.filter((asset) => asset.module_id === courseModule.id).map((asset) => ({ id: asset.id, type: asset.type, isPrimary: asset.is_primary, title: asset.title, description: asset.description, url: asset.url, storagePath: asset.storage_path, durationSeconds: asset.duration_seconds, orderIndex: asset.order_index })), exams: exams.filter((exam) => exam.moduleId === courseModule.id) }));
  const franchiseById = new Map((franchiseData ?? []).map((franchise) => [franchise.id, franchise.name]));
  const employees = (employeeData ?? []).map((employee) => ({ id: employee.id, fullName: employee.full_name, email: employee.email, franchiseName: employee.franchise_id ? franchiseById.get(employee.franchise_id) ?? null : null }));
  const enrollments = (enrollmentData ?? []).map((enrollment) => ({ userId: enrollment.user_id, dueDate: enrollment.due_date, status: enrollment.status, progressPercent: Number(enrollment.progress_percent) }));

  return <PortalLayout viewer={viewer} activeKey="courses"><div className="space-y-6"><section className="flex flex-wrap items-center justify-between gap-4 border border-line bg-surface px-5 py-4"><div><p className="font-medium">Videos, archivos y recursos</p><p className="mt-1 text-sm text-muted">Cargá contenido privado para el curso completo o para un módulo.</p></div><Link className="inline-flex h-10 items-center rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep" href={`/admin/cursos/${course.id}/contenido`}>Gestionar contenido</Link></section><CourseBuilder course={course} modules={modules} courseExams={exams.filter((exam) => exam.courseId === course.id)} employees={employees} enrollments={enrollments} /></div></PortalLayout>;
}