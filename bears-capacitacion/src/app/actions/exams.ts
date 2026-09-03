"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { databaseUuid } from "@/lib/validations/ids";

const submissionSchema = z.object({
  attemptId: databaseUuid,
  examId: databaseUuid,
  answers: z.array(z.object({ questionId: databaseUuid, optionId: databaseUuid.nullable() })),
});

export type ExamSubmissionResult = {
  score: number;
  passed: boolean;
  expired: boolean;
  requiredScore: number;
  attemptsRemaining: number | null;
  review: Array<{ questionId: string; selectedOptionId: string | null; correctOptionId: string; explanation: string | null }>;
};

type ExamRecord = {
  id: string;
  course_id: string | null;
  module_id: string | null;
  passing_score: number;
  max_attempts: number | null;
  cooldown_minutes: number;
  time_limit_minutes: number | null;
  show_correct_answers: boolean;
};

async function getEnrolledExam(examId: string, userId: string) {
  const admin = createAdminClient();
  const { data: examData } = await admin.from("exams")
    .select("id, course_id, module_id, passing_score, max_attempts, cooldown_minutes, time_limit_minutes, show_correct_answers")
    .eq("id", examId)
    .eq("is_active", true)
    .maybeSingle();
  const exam = examData as ExamRecord | null;
  if (!exam) return { error: "El examen no está disponible." } as const;

  const courseId = exam.course_id ?? (await admin.from("modules").select("course_id").eq("id", exam.module_id!).maybeSingle()).data?.course_id;
  if (!courseId) return { error: "El examen no está asociado a un curso válido." } as const;
  const { data: enrollment } = await admin.from("enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!enrollment) return { error: "No estás inscripto en este curso." } as const;

  return { admin, exam } as const;
}

export async function startExam(examId: string) {
  const parsedExamId = databaseUuid.safeParse(examId);
  if (!parsedExamId.success) return { error: "El examen seleccionado no es válido." };

  const viewer = await requireRole(["empleado"]);
  const enrolledExam = await getEnrolledExam(parsedExamId.data, viewer.id);
  if ("error" in enrolledExam) return enrolledExam;
  const { admin, exam } = enrolledExam;

  const { data: activeAttempt } = await admin.from("exam_attempts")
    .select("id, started_at")
    .eq("exam_id", exam.id)
    .eq("user_id", viewer.id)
    .is("finished_at", null)
    .maybeSingle();
  if (activeAttempt) {
    const expiresAt = exam.time_limit_minutes ? new Date(new Date(activeAttempt.started_at).getTime() + exam.time_limit_minutes * 60_000) : null;
    if (!expiresAt || expiresAt > new Date()) return { data: { attemptId: activeAttempt.id, startedAt: activeAttempt.started_at, expiresAt: expiresAt?.toISOString() ?? null } };
    await admin.from("exam_attempts").update({ score: 0, correct_count: 0, total_questions: 0, passed: false, finished_at: new Date().toISOString(), duration_seconds: (exam.time_limit_minutes ?? 0) * 60 }).eq("id", activeAttempt.id);
  }

  const { data: previousAttempts } = await admin.from("exam_attempts")
    .select("attempt_number, finished_at")
    .eq("exam_id", exam.id)
    .eq("user_id", viewer.id)
    .not("finished_at", "is", null)
    .order("attempt_number", { ascending: false });
  const latestAttempt = previousAttempts?.[0];
  if (exam.max_attempts && (previousAttempts?.length ?? 0) >= exam.max_attempts) return { error: "Alcanzaste la cantidad máxima de intentos." };
  if (latestAttempt?.finished_at && exam.cooldown_minutes > 0) {
    const availableAt = new Date(new Date(latestAttempt.finished_at).getTime() + exam.cooldown_minutes * 60_000);
    if (availableAt > new Date()) return { error: `Podés reintentar el ${availableAt.toLocaleString("es-AR")}.` };
  }

  const startedAt = new Date().toISOString();
  const { data: attempt, error } = await admin.from("exam_attempts").insert({
    exam_id: exam.id,
    user_id: viewer.id,
    attempt_number: (latestAttempt?.attempt_number ?? 0) + 1,
    started_at: startedAt,
  }).select("id").single();
  if (error || !attempt) return { error: "No pudimos iniciar el examen. Intentá nuevamente." };

  return { data: { attemptId: attempt.id, startedAt, expiresAt: exam.time_limit_minutes ? new Date(Date.now() + exam.time_limit_minutes * 60_000).toISOString() : null } };
}

export async function submitExam(input: unknown) {
  const viewer = await requireRole(["empleado"]);
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { error: "Las respuestas enviadas no son válidas." };

  const enrolledExam = await getEnrolledExam(parsed.data.examId, viewer.id);
  if ("error" in enrolledExam) return enrolledExam;
  const { admin, exam } = enrolledExam;

  const { data: previousAttempts } = await admin.from("exam_attempts")
    .select("attempt_number, finished_at")
    .eq("exam_id", exam.id)
    .eq("user_id", viewer.id)
    .order("attempt_number", { ascending: false });
  const { data: attempt } = await admin.from("exam_attempts")
    .select("id, started_at")
    .eq("id", parsed.data.attemptId)
    .eq("exam_id", exam.id)
    .eq("user_id", viewer.id)
    .is("finished_at", null)
    .maybeSingle();
  if (!attempt) return { error: "Este intento ya fue entregado o venció. Iniciá un nuevo intento." };

  const { data: questions } = await admin.from("questions")
    .select("id, points, options(id, is_correct)")
    .eq("exam_id", exam.id);
  if (!questions?.length) return { error: "Este examen todavía no tiene preguntas." };

  const answerMap = new Map(parsed.data.answers.map((answer) => [answer.questionId, answer.optionId]));
  const totalPoints = questions.reduce((total, question) => total + Number(question.points), 0);
  const correctAnswers = questions.filter((question) => {
    const chosenOption = answerMap.get(question.id);
    return question.options.some((option) => option.id === chosenOption && option.is_correct);
  });
  const earnedPoints = correctAnswers.reduce((total, question) => total + Number(question.points), 0);
  const durationSeconds = Math.max(0, Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1_000));
  const expired = Boolean(exam.time_limit_minutes && durationSeconds > exam.time_limit_minutes * 60);
  const score = expired ? 0 : Number(((earnedPoints / totalPoints) * 100).toFixed(2));
  const passed = !expired && score >= Number(exam.passing_score);

  const { error: attemptError } = await admin.from("exam_attempts").update({
    score,
    correct_count: expired ? 0 : correctAnswers.length,
    total_questions: questions.length,
    passed,
    finished_at: new Date().toISOString(),
    duration_seconds: durationSeconds,
  }).eq("id", attempt.id);
  if (attemptError) return { error: "No pudimos registrar el intento." };

  await admin.from("exam_answers").insert(questions.map((question) => ({
    attempt_id: attempt.id,
    question_id: question.id,
    option_id: answerMap.get(question.id) ?? null,
    is_correct: correctAnswers.some((correctQuestion) => correctQuestion.id === question.id),
  })));

  const review = exam.show_correct_answers ? questions.map((question) => ({
    questionId: question.id,
    selectedOptionId: answerMap.get(question.id) ?? null,
    correctOptionId: question.options.find((option) => option.is_correct)?.id ?? "",
    explanation: null,
  })) : [];

  return {
    data: {
      score,
      passed,
      expired,
      requiredScore: Number(exam.passing_score),
      attemptsRemaining: exam.max_attempts ? exam.max_attempts - (previousAttempts?.length ?? 0) - 1 : null,
      review,
    } satisfies ExamSubmissionResult,
  };
}