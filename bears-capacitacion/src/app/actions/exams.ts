"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

const submissionSchema = z.object({
  examId: z.string().uuid(),
  startedAt: z.string().datetime(),
  answers: z.array(z.object({ questionId: z.string().uuid(), optionId: z.string().uuid().nullable() })),
});

export async function submitExam(input: unknown) {
  const viewer = await requireRole(["empleado"]);
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { error: "Las respuestas enviadas no son válidas." };

  const admin = createAdminClient();
  const { data: exam } = await admin.from("exams")
    .select("id, course_id, module_id, passing_score, max_attempts, cooldown_minutes, time_limit_minutes")
    .eq("id", parsed.data.examId)
    .eq("is_active", true)
    .single();
  if (!exam) return { error: "El examen no está disponible." };

  const courseId = exam.course_id ?? (await admin.from("modules").select("course_id").eq("id", exam.module_id!).single()).data?.course_id;
  const { data: enrollment } = await admin.from("enrollments")
    .select("id")
    .eq("user_id", viewer.id)
    .eq("course_id", courseId!)
    .maybeSingle();
  if (!enrollment) return { error: "No estás inscripto en este curso." };

  const { data: previousAttempts } = await admin.from("exam_attempts")
    .select("attempt_number, finished_at")
    .eq("exam_id", exam.id)
    .eq("user_id", viewer.id)
    .order("attempt_number", { ascending: false });
  const latestAttempt = previousAttempts?.[0];
  if (exam.max_attempts && (previousAttempts?.length ?? 0) >= exam.max_attempts) return { error: "Alcanzaste la cantidad máxima de intentos." };
  if (latestAttempt?.finished_at && exam.cooldown_minutes > 0) {
    const availableAt = new Date(new Date(latestAttempt.finished_at).getTime() + exam.cooldown_minutes * 60_000);
    if (availableAt > new Date()) return { error: `Podés reintentar el ${availableAt.toLocaleString("es-AR")}.` };
  }

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
  const score = Number(((earnedPoints / totalPoints) * 100).toFixed(2));
  const durationSeconds = Math.max(0, Math.floor((Date.now() - new Date(parsed.data.startedAt).getTime()) / 1_000));
  if (exam.time_limit_minutes && durationSeconds > exam.time_limit_minutes * 60) return { error: "El tiempo límite del examen venció." };

  const { data: attempt, error: attemptError } = await admin.from("exam_attempts").insert({
    exam_id: exam.id,
    user_id: viewer.id,
    attempt_number: (latestAttempt?.attempt_number ?? 0) + 1,
    score,
    correct_count: correctAnswers.length,
    total_questions: questions.length,
    passed: score >= Number(exam.passing_score),
    started_at: parsed.data.startedAt,
    finished_at: new Date().toISOString(),
    duration_seconds: durationSeconds,
  }).select("id").single();
  if (attemptError || !attempt) return { error: "No pudimos registrar el intento." };

  await admin.from("exam_answers").insert(questions.map((question) => ({
    attempt_id: attempt.id,
    question_id: question.id,
    option_id: answerMap.get(question.id) ?? null,
    is_correct: correctAnswers.some((correctQuestion) => correctQuestion.id === question.id),
  })));

  return {
    data: {
      score,
      passed: score >= Number(exam.passing_score),
      requiredScore: Number(exam.passing_score),
      attemptsRemaining: exam.max_attempts ? exam.max_attempts - (previousAttempts?.length ?? 0) - 1 : null,
    },
  };
}