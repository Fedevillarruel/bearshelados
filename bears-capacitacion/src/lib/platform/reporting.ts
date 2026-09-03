import "server-only";

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

type FranchiseRow = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  is_active: boolean;
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

  const [enrollmentResponse, attemptResponse, videoResponse] = await Promise.all([
    employeeIds.length
      ? supabase.from("enrollments").select("user_id, course_id, due_date, status, progress_percent").in("user_id", employeeIds)
      : Promise.resolve({ data: [] as EnrollmentRow[] }),
    employeeIds.length
      ? supabase.from("exam_attempts").select("id, user_id, exam_id, score, passed, finished_at").in("user_id", employeeIds).not("finished_at", "is", null)
      : Promise.resolve({ data: [] as ExamAttemptRow[] }),
    employeeIds.length
      ? supabase.from("video_progress").select("user_id, seconds_watched").in("user_id", employeeIds)
      : Promise.resolve({ data: [] as VideoProgressRow[] }),
  ]);

  const enrollments = (enrollmentResponse.data ?? []) as EnrollmentRow[];
  const attempts = (attemptResponse.data ?? []) as ExamAttemptRow[];
  const videoProgress = (videoResponse.data ?? []) as VideoProgressRow[];
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

  const scoresByUser = new Map<string, number[]>();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let failedAttemptsLast30Days = 0;
  for (const attempt of latestAttemptByExamAndUser.values()) {
    if (attempt.score !== null) scoresByUser.set(attempt.user_id, [...(scoresByUser.get(attempt.user_id) ?? []), valueAsNumber(attempt.score)]);
    if (attempt.passed === false && attempt.finished_at && new Date(attempt.finished_at).getTime() >= thirtyDaysAgo) failedAttemptsLast30Days += 1;
  }

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
    watchedMinutes,
    failedAttemptsLast30Days,
    team,
    courses: scopedCourseReports,
    franchises: franchiseSummaries,
  };
}