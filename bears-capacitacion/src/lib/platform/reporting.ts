import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  position: string | null;
  franchise_id: string | null;
  last_seen_at: string | null;
};

type EnrollmentRow = {
  user_id: string;
  course_id: string;
  due_date: string | null;
  status: "asignado" | "en_progreso" | "completado";
  progress_percent: number | string;
};

type ExamAttemptRow = {
  id: string;
  user_id: string;
  exam_id: string;
  score: number | string | null;
  passed: boolean | null;
  finished_at: string | null;
};

type VideoProgressRow = {
  user_id: string;
  seconds_watched: number | string;
};

type CourseRow = {
  id: string;
  title: string;
};

type ExamRow = {
  id: string;
  course_id: string | null;
  module_id: string | null;
};

type ModuleRow = {
  id: string;
  course_id: string;
  title: string;
};

type FranchiseRow = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  is_active: boolean;
};

export type ModuleScoreReport = {
  moduleId: string | null;
  label: string;
  averageScore: number;
  examCount: number;
};

export type TeamMemberReport = {
  id: string;
  fullName: string | null;
  email: string;
  position: string | null;
  franchiseId: string | null;
  franchiseName: string | null;
  assignedCourses: number;
  completedCourses: number;
  averageProgress: number;
  averageScore: number | null;
  moduleScores: ModuleScoreReport[];
  watchedMinutes: number;
  lastSeenAt: string | null;
  status: "Al día" | "En progreso" | "Vencido" | "Sin asignaciones";
};

export type CourseReport = {
  id: string;
  title: string;
  enrollmentCount: number;
  completedCount: number;
  completionPercent: number | null;
  averageProgress: number | null;
};

export type FranchiseSummary = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  isActive: boolean;
  employeeCount: number;
  averageProgress: number | null;
  averageScore: number | null;
};

export type TrainingOverview = {
  activeEmployees: number;
  publishedCourses: number;
  completionPercent: number | null;
  averageScore: number | null;
  moduleScores: ModuleScoreReport[];
  watchedMinutes: number;
  failedAttemptsLast30Days: number;
  team: TeamMemberReport[];
  courses: CourseReport[];
  franchises: FranchiseSummary[];
};

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function valueAsNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function statusFor(enrollments: EnrollmentRow[]) {
  if (!enrollments.length) return "Sin asignaciones" as const;
  const today = new Date().toISOString().slice(0, 10);
  if (enrollments.some((enrollment) => enrollment.status !== "completado" && enrollment.due_date && enrollment.due_date < today)) return "Vencido" as const;
  if (enrollments.every((enrollment) => enrollment.status === "completado")) return "Al día" as const;
  return "En progreso" as const;
}

export async function getTrainingOverview({ franchiseId }: { franchiseId?: string | null } = {}): Promise<TrainingOverview> {
  const supabase = await createClient();
  let profilesQuery = supabase
    .from("profiles")
    .select("id, email, full_name, position, franchise_id, last_seen_at")
    .eq("role", "empleado")
    .eq("is_active", true)
    .order("full_name");

  if (franchiseId) profilesQuery = profilesQuery.eq("franchise_id", franchiseId);

  const [{ data: profileData }, { data: courseData }, { data: franchiseData }] = await Promise.all([
    profilesQuery,
    supabase.from("courses").select("id, title").eq("is_published", true).order("order_index"),
    supabase.from("franchises").select("id, name, code, city, is_active").order("name"),
  ]);

  const profiles = (profileData ?? []) as ProfileRow[];
  const courses = (courseData ?? []) as CourseRow[];
  const franchises = (franchiseData ?? []) as FranchiseRow[];
  const employeeIds = profiles.map((profile) => profile.id);
  const admin = createAdminClient();

  const [enrollmentResponse, attemptResponse, videoResponse, moduleResponse] = await Promise.all([
    employeeIds.length
      ? supabase.from("enrollments").select("user_id, course_id, due_date, status, progress_percent").in("user_id", employeeIds)
      : Promise.resolve({ data: [] as EnrollmentRow[] }),
    employeeIds.length
      ? supabase.from("exam_attempts").select("id, user_id, exam_id, score, passed, finished_at").in("user_id", employeeIds).not("finished_at", "is", null).not("score", "is", null)
      : Promise.resolve({ data: [] as ExamAttemptRow[] }),
    employeeIds.length
      ? supabase.from("video_progress").select("user_id, seconds_watched").in("user_id", employeeIds)
      : Promise.resolve({ data: [] as VideoProgressRow[] }),
    courses.length
      ? admin
          .from("modules")
          .select("id, course_id, title")
          .in("course_id", courses.map((course) => course.id))
          .eq("is_published", true)
      : Promise.resolve({ data: [] as ModuleRow[], error: null }),
  ]);
  if (moduleResponse.error) throw new Error("No pudimos consultar los módulos del reporte.");

  const enrollments = (enrollmentResponse.data ?? []) as EnrollmentRow[];
  const attempts = (attemptResponse.data ?? []) as ExamAttemptRow[];
  const videoProgress = (videoResponse.data ?? []) as VideoProgressRow[];
  const modules = (moduleResponse.data ?? []) as ModuleRow[];
  const franchiseNameById = new Map(franchises.map((franchise) => [franchise.id, franchise.name]));
  const enrollmentsByUser = new Map<string, EnrollmentRow[]>();
  const enrollmentsByCourse = new Map<string, EnrollmentRow[]>();
  const watchedSecondsByUser = new Map<string, number>();

  for (const enrollment of enrollments) {
    enrollmentsByUser.set(enrollment.user_id, [...(enrollmentsByUser.get(enrollment.user_id) ?? []), enrollment]);
    enrollmentsByCourse.set(enrollment.course_id, [...(enrollmentsByCourse.get(enrollment.course_id) ?? []), enrollment]);
  }
  for (const progress of videoProgress) {
    watchedSecondsByUser.set(progress.user_id, (watchedSecondsByUser.get(progress.user_id) ?? 0) + valueAsNumber(progress.seconds_watched));
  }

  const latestAttemptByExamAndUser = new Map<string, ExamAttemptRow>();
  for (const attempt of attempts) {
    const key = `${attempt.user_id}:${attempt.exam_id}`;
    const current = latestAttemptByExamAndUser.get(key);
    if (!current || (attempt.finished_at ?? "") > (current.finished_at ?? "")) latestAttemptByExamAndUser.set(key, attempt);
  }

  const attemptedExamIds = [...new Set(
    [...latestAttemptByExamAndUser.values()].map((attempt) => attempt.exam_id),
  )];
  const { data: examData, error: examError } = attemptedExamIds.length
    ? await admin
        .from("exams")
        .select("id, course_id, module_id")
        .in("id", attemptedExamIds)
      : { data: [], error: null };
  if (examError) throw new Error("No pudimos consultar las evaluaciones del reporte.");
  const exams = (examData ?? []) as ExamRow[];
  const examsById = new Map(exams.map((exam) => [exam.id, exam]));
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const groupKeyForExam = (exam: ExamRow) =>
    exam.module_id ?? `course:${exam.course_id ?? "unknown"}`;
  const labelForExam = (exam: ExamRow) => {
    if (exam.module_id) return modulesById.get(exam.module_id)?.title ?? "Módulo";
    const courseTitle = exam.course_id ? coursesById.get(exam.course_id)?.title : null;
    return courseTitle ? `Evaluación general · ${courseTitle}` : "Evaluación general";
  };

  const scoresByUser = new Map<string, number[]>();
  const moduleScoresByUser = new Map<string, Map<string, { moduleId: string | null; label: string; scores: number[] }>>();
  const scoresByModule = new Map<string, { moduleId: string | null; label: string; scores: number[] }>();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let failedAttemptsLast30Days = 0;
  for (const attempt of latestAttemptByExamAndUser.values()) {
    const exam = examsById.get(attempt.exam_id);
    if (attempt.score !== null && exam) {
      const score = valueAsNumber(attempt.score);
      scoresByUser.set(attempt.user_id, [...(scoresByUser.get(attempt.user_id) ?? []), score]);
      const groupKey = groupKeyForExam(exam);
      const label = labelForExam(exam);
      const userGroups = moduleScoresByUser.get(attempt.user_id) ?? new Map();
      const userGroup = userGroups.get(groupKey) ?? { moduleId: exam.module_id, label, scores: [] };
      userGroup.scores.push(score);
      userGroups.set(groupKey, userGroup);
      moduleScoresByUser.set(attempt.user_id, userGroups);

      const reportGroup = scoresByModule.get(groupKey) ?? { moduleId: exam.module_id, label, scores: [] };
      reportGroup.scores.push(score);
      scoresByModule.set(groupKey, reportGroup);
    }
    if (attempt.passed === false && attempt.finished_at && new Date(attempt.finished_at).getTime() >= thirtyDaysAgo) failedAttemptsLast30Days += 1;
  }

  const toModuleScores = (groups: Map<string, { moduleId: string | null; label: string; scores: number[] }> | undefined) =>
    [...(groups ?? new Map()).values()]
      .map((group) => ({
        moduleId: group.moduleId,
        label: group.label,
        averageScore: average(group.scores) ?? 0,
        examCount: group.scores.length,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "es"));

  const team = profiles.map((profile) => {
    const memberEnrollments = enrollmentsByUser.get(profile.id) ?? [];
    const memberScores = scoresByUser.get(profile.id) ?? [];
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      position: profile.position,
      franchiseId: profile.franchise_id,
      franchiseName: profile.franchise_id ? franchiseNameById.get(profile.franchise_id) ?? null : null,
      assignedCourses: memberEnrollments.length,
      completedCourses: memberEnrollments.filter((enrollment) => enrollment.status === "completado").length,
      averageProgress: average(memberEnrollments.map((enrollment) => valueAsNumber(enrollment.progress_percent))) ?? 0,
      averageScore: average(memberScores),
      moduleScores: toModuleScores(moduleScoresByUser.get(profile.id)),
      watchedMinutes: Math.round((watchedSecondsByUser.get(profile.id) ?? 0) / 60),
      lastSeenAt: profile.last_seen_at,
      status: statusFor(memberEnrollments),
    };
  });

  const courseReports = courses.map((course) => {
    const courseEnrollments = enrollmentsByCourse.get(course.id) ?? [];
    const completedCount = courseEnrollments.filter((enrollment) => enrollment.status === "completado").length;
    return {
      id: course.id,
      title: course.title,
      enrollmentCount: courseEnrollments.length,
      completedCount,
      completionPercent: courseEnrollments.length ? (completedCount / courseEnrollments.length) * 100 : null,
      averageProgress: average(courseEnrollments.map((enrollment) => valueAsNumber(enrollment.progress_percent))),
    };
  });
  const scopedCourseReports = franchiseId
    ? courseReports.filter((course) => course.enrollmentCount > 0)
    : courseReports;

  const franchiseSummaries = franchises.map((franchise) => {
    const members = team.filter((member) => member.franchiseId === franchise.id);
    return {
      id: franchise.id,
      name: franchise.name,
      code: franchise.code,
      city: franchise.city,
      isActive: franchise.is_active,
      employeeCount: members.length,
      averageProgress: average(members.map((member) => member.averageProgress)),
      averageScore: average(members.flatMap((member) => member.averageScore === null ? [] : [member.averageScore])),
    };
  });

  const totalEnrollments = enrollments.length;
  const completedEnrollments = enrollments.filter((enrollment) => enrollment.status === "completado").length;
  const allScores = [...scoresByUser.values()].flat();
  const watchedMinutes = Math.round([...watchedSecondsByUser.values()].reduce((total, seconds) => total + seconds, 0) / 60);

  return {
    activeEmployees: profiles.length,
    publishedCourses: scopedCourseReports.length,
    completionPercent: totalEnrollments ? (completedEnrollments / totalEnrollments) * 100 : null,
    averageScore: average(allScores),
    moduleScores: toModuleScores(scoresByModule),
    watchedMinutes,
    failedAttemptsLast30Days,
    team,
    courses: scopedCourseReports,
    franchises: franchiseSummaries,
  };
}