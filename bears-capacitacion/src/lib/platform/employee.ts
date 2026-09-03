import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/roles";

type CourseRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  summary: string | null;
  cover_url: string | null;
  category: string | null;
  estimated_minutes: number | null;
  is_published: boolean;
};

type EnrollmentRow = {
  id: string;
  course_id: string;
  due_date: string | null;
  status: "asignado" | "en_progreso" | "completado";
  progress_percent: number;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type ModuleRow = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_published: boolean;
};

type AssetRow = {
  id: string;
  course_id: string | null;
  module_id: string | null;
  type: "video" | "pdf" | "image" | "spreadsheet" | "document" | "text" | "link";
  title: string;
  description: string | null;
  url: string;
  storage_path: string | null;
  duration_seconds: number;
  size_bytes: number | null;
  order_index: number;
};

type VideoProgressRow = {
  asset_id: string;
  last_position: number;
  watched_ranges: [number, number][] | null;
  completed: boolean;
};

type ExamRow = {
  id: string;
  course_id: string | null;
  module_id: string | null;
  title: string;
  description: string | null;
  passing_score: number;
  max_attempts: number | null;
  cooldown_minutes: number;
  time_limit_minutes: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_correct_answers: boolean;
  blocks_progress: boolean;
};

type QuestionRow = {
  id: string;
  prompt: string;
  explanation: string | null;
  points: number;
  order_index: number;
};

type OptionRow = {
  id: string;
  question_id: string;
  label: string;
  order_index: number;
};

export type EmployeeCourse = CourseRow & {
  enrollment: EnrollmentRow;
  moduleCount: number;
  firstModuleId: string | null;
};

export type EmployeeModule = ModuleRow;

export type EmployeeAsset = AssetRow & {
  progress?: VideoProgressRow;
};

export type EmployeeCourseModule = {
  course: CourseRow;
  enrollment: EnrollmentRow;
  modules: EmployeeModule[];
  currentModule: EmployeeModule;
  assets: EmployeeAsset[];
  courseAssets: EmployeeAsset[];
  exams: ExamRow[];
  courseExams: ExamRow[];
  previousModule: EmployeeModule | null;
  nextModule: EmployeeModule | null;
};

export type EmployeeExam = Omit<ExamRow, "show_correct_answers"> & {
  showCorrectAnswersAfterSubmission: boolean;
  questions: Array<QuestionRow & { options: OptionRow[] }>;
};

export type EmployeeProgress = EmployeeCourse & {
  averageScore: number | null;
  latestAttemptAt: string | null;
};

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[targetIndex]] = [copy[targetIndex], copy[index]];
  }
  return copy;
}

export async function getEmployeeCourses(viewer: Viewer): Promise<EmployeeCourse[]> {
  const supabase = await createClient();
  const { data: enrollmentData } = await supabase
    .from("enrollments")
    .select("id, course_id, due_date, status, progress_percent, assigned_at, started_at, completed_at")
    .eq("user_id", viewer.id)
    .order("assigned_at", { ascending: false });
  const enrollments = (enrollmentData ?? []) as EnrollmentRow[];
  if (!enrollments.length) return [];

  const courseIds = enrollments.map((enrollment) => enrollment.course_id);
  const [{ data: courseData }, { data: moduleData }] = await Promise.all([
    supabase.from("courses").select("id, title, slug, description, summary, cover_url, category, estimated_minutes, is_published").in("id", courseIds),
    supabase.from("modules").select("id, course_id, order_index").in("course_id", courseIds).eq("is_published", true).order("order_index"),
  ]);
  const courses = (courseData ?? []) as CourseRow[];
  const modules = (moduleData ?? []) as Array<Pick<ModuleRow, "id" | "course_id" | "order_index">>;
  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const moduleCountByCourse = new Map<string, number>();
  const firstModuleIdByCourse = new Map<string, string>();
  for (const courseModule of modules) {
    moduleCountByCourse.set(courseModule.course_id, (moduleCountByCourse.get(courseModule.course_id) ?? 0) + 1);
    if (!firstModuleIdByCourse.has(courseModule.course_id)) firstModuleIdByCourse.set(courseModule.course_id, courseModule.id);
  }

  return enrollments.flatMap((enrollment) => {
    const course = coursesById.get(enrollment.course_id);
    return course ? [{ ...course, enrollment, moduleCount: moduleCountByCourse.get(course.id) ?? 0, firstModuleId: firstModuleIdByCourse.get(course.id) ?? null }] : [];
  });
}

export async function getEmployeeCourseModule(viewer: Viewer, slug: string, moduleId: string): Promise<EmployeeCourseModule | null> {
  const supabase = await createClient();
  const { data: courseData } = await supabase
    .from("courses")
    .select("id, title, slug, description, summary, cover_url, category, estimated_minutes, is_published")
    .eq("slug", slug)
    .maybeSingle();
  const course = courseData as CourseRow | null;
  if (!course) return null;

  const { data: enrollmentData } = await supabase
    .from("enrollments")
    .select("id, course_id, due_date, status, progress_percent, assigned_at, started_at, completed_at")
    .eq("user_id", viewer.id)
    .eq("course_id", course.id)
    .maybeSingle();
  const enrollment = enrollmentData as EnrollmentRow | null;
  if (!enrollment) return null;

  const { data: moduleData } = await supabase
    .from("modules")
    .select("id, course_id, title, description, order_index, is_published")
    .eq("course_id", course.id)
    .eq("is_published", true)
    .order("order_index");
  const modules = (moduleData ?? []) as ModuleRow[];
  const currentIndex = modules.findIndex((module) => module.id === moduleId);
  if (currentIndex < 0) return null;
  const currentModule = modules[currentIndex];

  const [{ data: assetData }, { data: courseAssetData }, { data: examData }, { data: courseExamData }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, course_id, module_id, type, title, description, url, storage_path, duration_seconds, size_bytes, order_index")
      .eq("module_id", currentModule.id)
      .order("order_index"),
    supabase
      .from("assets")
      .select("id, course_id, module_id, type, title, description, url, storage_path, duration_seconds, size_bytes, order_index")
      .eq("course_id", course.id)
      .order("order_index"),
    supabase
      .from("exams")
      .select("id, course_id, module_id, title, description, passing_score, max_attempts, cooldown_minutes, time_limit_minutes, shuffle_questions, shuffle_options, show_correct_answers, blocks_progress")
      .eq("module_id", currentModule.id)
      .eq("is_active", true),
    currentIndex === modules.length - 1
      ? supabase
        .from("exams")
        .select("id, course_id, module_id, title, description, passing_score, max_attempts, cooldown_minutes, time_limit_minutes, shuffle_questions, shuffle_options, show_correct_answers, blocks_progress")
        .eq("course_id", course.id)
        .eq("is_active", true)
      : Promise.resolve({ data: [] }),
  ]);
  const assets = (assetData ?? []) as AssetRow[];
  const courseAssets = (courseAssetData ?? []) as AssetRow[];
  const allAssets = [...assets, ...courseAssets];
  const videoAssetIds = allAssets.filter((asset) => asset.type === "video").map((asset) => asset.id);
  const { data: progressData } = videoAssetIds.length
    ? await supabase.from("video_progress").select("asset_id, last_position, watched_ranges, completed").eq("user_id", viewer.id).in("asset_id", videoAssetIds)
    : { data: [] };
  const progressByAssetId = new Map(((progressData ?? []) as VideoProgressRow[]).map((progress) => [progress.asset_id, progress]));
  const admin = allAssets.some((asset) => asset.storage_path) ? createAdminClient() : null;
  const accessibleAssets = await Promise.all(allAssets.map(async (asset) => {
    if (!asset.storage_path || !admin) return asset;
    const { data: signedAsset, error } = await admin.storage.from("course-media").createSignedUrl(asset.storage_path, 60 * 60);
    return error || !signedAsset?.signedUrl ? null : { ...asset, url: signedAsset.signedUrl };
  }));
  const accessibleById = new Map(accessibleAssets.flatMap((asset) => asset ? [[asset.id, asset] as const] : []));
  const withProgress = (asset: AssetRow): EmployeeAsset[] => {
    const accessibleAsset = accessibleById.get(asset.id);
    return accessibleAsset ? [{ ...accessibleAsset, progress: progressByAssetId.get(asset.id) }] : [];
  };

  return {
    course,
    enrollment,
    modules,
    currentModule,
    assets: assets.flatMap(withProgress),
    courseAssets: courseAssets.flatMap(withProgress),
    exams: (examData ?? []) as ExamRow[],
    courseExams: (courseExamData ?? []) as ExamRow[],
    previousModule: modules[currentIndex - 1] ?? null,
    nextModule: modules[currentIndex + 1] ?? null,
  };
}

export async function getEmployeeExam(viewer: Viewer, examId: string): Promise<EmployeeExam | null> {
  const supabase = await createClient();
  const { data: examData } = await supabase
    .from("exams")
    .select("id, course_id, module_id, title, description, passing_score, max_attempts, cooldown_minutes, time_limit_minutes, shuffle_questions, shuffle_options, show_correct_answers, blocks_progress")
    .eq("id", examId)
    .eq("is_active", true)
    .maybeSingle();
  const exam = examData as ExamRow | null;
  if (!exam) return null;

  const courseId = exam.course_id ?? (await supabase.from("modules").select("course_id").eq("id", exam.module_id!).maybeSingle()).data?.course_id;
  if (!courseId) return null;
  const { data: enrollment } = await supabase.from("enrollments").select("id").eq("user_id", viewer.id).eq("course_id", courseId).maybeSingle();
  if (!enrollment) return null;

  const admin = createAdminClient();
  const { data: questionData } = await admin.from("questions").select("id, prompt, explanation, points, order_index").eq("exam_id", exam.id).order("order_index");
  const questions = (questionData ?? []) as QuestionRow[];
  if (!questions.length) return { ...exam, showCorrectAnswersAfterSubmission: exam.show_correct_answers, questions: [] };
  const { data: optionData } = await admin.from("options").select("id, question_id, label, order_index").in("question_id", questions.map((question) => question.id)).order("order_index");
  const optionsByQuestionId = new Map<string, OptionRow[]>();
  for (const option of (optionData ?? []) as OptionRow[]) {
    optionsByQuestionId.set(option.question_id, [...(optionsByQuestionId.get(option.question_id) ?? []), option]);
  }
  const orderedQuestions = exam.shuffle_questions ? shuffle(questions) : questions;

  return {
    ...exam,
    showCorrectAnswersAfterSubmission: exam.show_correct_answers,
    questions: orderedQuestions.map((question) => ({
      ...question,
      options: exam.shuffle_options ? shuffle(optionsByQuestionId.get(question.id) ?? []) : optionsByQuestionId.get(question.id) ?? [],
    })),
  };
}

export async function getEmployeeProgress(viewer: Viewer): Promise<EmployeeProgress[]> {
  const [courses, supabase] = await Promise.all([getEmployeeCourses(viewer), createClient()]);
  if (!courses.length) return [];
  const { data: attemptData } = await supabase
    .from("exam_attempts")
    .select("exam_id, score, finished_at")
    .eq("user_id", viewer.id)
    .not("finished_at", "is", null);
  const attempts = (attemptData ?? []) as Array<{ exam_id: string; score: number | null; finished_at: string | null }>;
  const courseIds = courses.map((course) => course.id);
  const [{ data: examData }, { data: moduleData }] = await Promise.all([
    attempts.length ? supabase.from("exams").select("id, course_id, module_id").in("id", attempts.map((attempt) => attempt.exam_id)) : Promise.resolve({ data: [] }),
    supabase.from("modules").select("id, course_id").in("course_id", courseIds),
  ]);
  const examsById = new Map(((examData ?? []) as Array<{ id: string; course_id: string | null; module_id: string | null }>).map((exam) => [exam.id, exam]));
  const courseByModuleId = new Map(((moduleData ?? []) as Array<{ id: string; course_id: string }>).map((courseModule) => [courseModule.id, courseModule.course_id]));

  return courses.map((course) => {
    const courseAttempts = attempts.filter((attempt) => {
      const exam = examsById.get(attempt.exam_id);
      const relatedCourseId = exam?.course_id ?? (exam?.module_id ? courseByModuleId.get(exam.module_id) : null);
      return relatedCourseId === course.id;
    });
    const scores = courseAttempts.map((attempt) => attempt.score).filter((score): score is number => typeof score === "number");
    const completedDates = courseAttempts.map((attempt) => attempt.finished_at).filter((date): date is string => Boolean(date)).sort().reverse();
    return { ...course, averageScore: scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null, latestAttemptAt: completedDates[0] ?? null };
  });
}