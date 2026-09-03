"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const identifier = z.string().uuid();
const nullableText = z.string().trim().nullable();
const assetTypes = ["video", "pdf", "image", "spreadsheet", "document", "text", "link"] as const;
const uploadContentTypes = [
  "video/mp4",
  "video/webm",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

const courseSchema = z.object({
  id: identifier.optional(),
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres.").max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usá minúsculas, números y guiones.").max(180),
  description: nullableText,
  summary: nullableText,
  coverUrl: z.string().trim().url("Ingresá una URL de portada válida.").nullable().or(z.literal("")),
  category: nullableText,
  estimatedMinutes: z.number().int().min(0).max(10_000),
  isPublished: z.boolean(),
  orderIndex: z.number().int().min(0).max(10_000),
});

const moduleSchema = z.object({
  id: identifier.optional(),
  courseId: identifier,
  title: z.string().trim().min(2, "El módulo necesita un título.").max(160),
  description: nullableText,
  orderIndex: z.number().int().min(0).max(10_000),
  isPublished: z.boolean(),
});

const assetSchema = z.object({
  id: identifier.optional(),
  courseId: identifier.nullable(),
  moduleId: identifier.nullable(),
  type: z.enum(assetTypes),
  isPrimary: z.boolean().default(false),
  title: z.string().trim().min(2, "El contenido necesita un título.").max(160),
  description: nullableText,
  url: z.string().trim().max(5_000),
  storagePath: nullableText,
  durationSeconds: z.number().int().min(0).max(86_400),
  sizeBytes: z.number().int().nonnegative().max(300 * 1024 * 1024).nullable().optional(),
  orderIndex: z.number().int().min(0).max(10_000),
}).superRefine((value, context) => {
  if ((value.courseId && value.moduleId) || (!value.courseId && !value.moduleId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["moduleId"], message: "El contenido debe pertenecer a un curso o a un módulo." });
  }
  if (value.type === "video" && value.durationSeconds <= 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["durationSeconds"], message: "El video debe informar una duración válida." });
  }
  if (value.type === "text" && !value.url) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Ingresá el contenido de texto." });
  }
  if (!value.storagePath && ["video", "pdf", "image", "spreadsheet", "document", "link"].includes(value.type) && !z.string().url().safeParse(value.url).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Ingresá una URL válida para este tipo de contenido." });
  }
  if (value.storagePath && !["video", "pdf", "image", "spreadsheet", "document"].includes(value.type)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["storagePath"], message: "Solo podés subir archivos para videos, PDFs, imágenes, planillas y documentos." });
  }
  if (value.isPrimary && (value.type !== "video" || !value.moduleId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["isPrimary"], message: "El video principal debe pertenecer a un módulo." });
  }
});

const uploadUrlSchema = z.object({
  courseId: identifier,
  fileName: z.string().trim().min(1).max(240),
  contentType: z.enum(uploadContentTypes, "El tipo de archivo no está permitido."),
  fileSize: z.number().int().positive().max(300 * 1024 * 1024, "El archivo no puede superar 300 MB.").optional(),
});

const assignmentSchema = z.object({
  courseId: identifier,
  userIds: z.array(identifier).min(1, "Seleccioná al menos una persona.").max(500),
  dueDate: z.string().date().nullable(),
});

const unassignmentSchema = z.object({
  courseId: identifier,
  userId: identifier,
});

const examSchema = z.object({
  id: identifier.optional(),
  courseId: identifier.nullable(),
  moduleId: identifier.nullable(),
  title: z.string().trim().min(3, "El examen necesita un título.").max(160),
  description: nullableText,
  passingScore: z.number().min(0).max(100),
  maxAttempts: z.number().int().min(1).max(100).nullable(),
  cooldownMinutes: z.number().int().min(0).max(100_800),
  timeLimitMinutes: z.number().int().min(1).max(1_440).nullable(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  showCorrectAnswers: z.boolean(),
  blocksProgress: z.boolean(),
  isActive: z.boolean(),
  questions: z.array(z.object({
    prompt: z.string().trim().min(5, "La pregunta debe tener al menos 5 caracteres.").max(1_000),
    explanation: nullableText,
    points: z.number().positive().max(100),
    options: z.array(z.object({ label: z.string().trim().min(1, "Cada opción necesita texto.").max(500), isCorrect: z.boolean() })).min(2, "Cada pregunta necesita al menos dos opciones.").max(10),
  })).min(1, "Agregá al menos una pregunta.").max(100),
}).superRefine((value, context) => {
  if ((value.courseId && value.moduleId) || (!value.courseId && !value.moduleId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["moduleId"], message: "El examen debe pertenecer a un curso o a un módulo." });
  }
  value.questions.forEach((question, index) => {
    if (question.options.filter((option) => option.isCorrect).length !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", index, "options"], message: "Cada pregunta debe tener una única respuesta correcta." });
    }
  });
});

function refreshCoursePaths(courseId?: string) {
  revalidatePath("/admin/cursos");
  revalidatePath("/admin/dashboard");
  revalidatePath("/cursos/mis-cursos");
  if (courseId) revalidatePath(`/admin/cursos/${courseId}`);
}

export async function saveCourse(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const course = parsed.data;
  const supabase = await createClient();
  const payload = {
    title: course.title,
    slug: course.slug,
    description: course.description,
    summary: course.summary,
    cover_url: course.coverUrl || null,
    category: course.category,
    estimated_minutes: course.estimatedMinutes,
    is_published: course.isPublished,
    order_index: course.orderIndex,
  };
  const request = course.id
    ? supabase.from("courses").update(payload).eq("id", course.id).select("id").single()
    : supabase.from("courses").insert({ ...payload, created_by: viewer.id }).select("id").single();
  const { data, error } = await request;
  if (error || !data) return { error: error?.message ?? "No pudimos guardar el curso." };
  refreshCoursePaths(data.id);
  return { data: { id: data.id } };
}

export async function deleteCourse(courseId: string) {
  await requireRole(["admin"]);
  const parsed = identifier.safeParse(courseId);
  if (!parsed.success) return { error: "El curso seleccionado no es válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("courses").delete().eq("id", parsed.data);
  if (error) return { error: "No pudimos eliminar el curso." };
  refreshCoursePaths();
  return { data: { id: parsed.data } };
}

export async function saveModule(input: unknown) {
  await requireRole(["admin"]);
  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const courseModule = parsed.data;
  const supabase = await createClient();
  const payload = { course_id: courseModule.courseId, title: courseModule.title, description: courseModule.description, order_index: courseModule.orderIndex, is_published: courseModule.isPublished };
  const request = courseModule.id
    ? supabase.from("modules").update(payload).eq("id", courseModule.id).select("id").single()
    : supabase.from("modules").insert(payload).select("id").single();
  const { data, error } = await request;
  if (error || !data) return { error: error?.message ?? "No pudimos guardar el módulo." };
  refreshCoursePaths(courseModule.courseId);
  return { data: { id: data.id } };
}

export async function reorderModules(input: unknown) {
  await requireRole(["admin"]);
  const parsed = z.object({ courseId: identifier, moduleIds: z.array(identifier).min(1) }).safeParse(input);
  if (!parsed.success) return { error: "El orden de módulos no es válido." };
  const supabase = await createClient();
  const updates = parsed.data.moduleIds.map((moduleId, index) => supabase.from("modules").update({ order_index: index + 1 }).eq("id", moduleId).eq("course_id", parsed.data.courseId));
  const results = await Promise.all(updates);
  if (results.some((result) => result.error)) return { error: "No pudimos actualizar el orden de los módulos." };
  refreshCoursePaths(parsed.data.courseId);
  return { data: { courseId: parsed.data.courseId } };
}

export async function deleteModule(moduleId: string) {
  await requireRole(["admin"]);
  const parsed = identifier.safeParse(moduleId);
  if (!parsed.success) return { error: "El módulo seleccionado no es válido." };
  const supabase = await createClient();
  const { data: courseModule } = await supabase.from("modules").select("course_id").eq("id", parsed.data).maybeSingle();
  const { error } = await supabase.from("modules").delete().eq("id", parsed.data);
  if (error) return { error: "No pudimos eliminar el módulo." };
  refreshCoursePaths(courseModule?.course_id);
  return { data: { id: parsed.data } };
}

export async function createCourseAssetUploadUrl(input: unknown) {
  await requireRole(["admin"]);
  const parsed = uploadUrlSchema.safeParse(input);
  if (!parsed.success) return { error: "El archivo seleccionado no es válido." };
  const fileName = parsed.data.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `courses/${parsed.data.courseId}/${crypto.randomUUID()}-${fileName}`;
  const supabase = await createClient();
  const { data: course } = await supabase.from("courses").select("id").eq("id", parsed.data.courseId).maybeSingle();
  if (!course) return { error: "El curso seleccionado no existe." };
  const { data, error } = await supabase.storage.from("course-media").createSignedUploadUrl(path);
  if (error || !data) return { error: "No pudimos preparar la subida del archivo." };
  return { data: { path: data.path, token: data.token } };
}

export async function saveAsset(input: unknown) {
  await requireRole(["admin"]);
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const asset = parsed.data;
  const supabase = await createClient();
  const parentCourseId = asset.courseId ?? (await supabase.from("modules").select("course_id").eq("id", asset.moduleId!).maybeSingle()).data?.course_id;
  if (!parentCourseId) return { error: "El módulo seleccionado no existe." };
  if (asset.storagePath && !asset.storagePath.startsWith(`courses/${parentCourseId}/`)) {
    return { error: "El archivo no pertenece a este curso." };
  }
  const storedUrl = asset.storagePath ?? asset.url;
  const payload = {
    course_id: asset.courseId,
    module_id: asset.moduleId,
    type: asset.type,
    is_primary: asset.isPrimary,
    title: asset.title,
    description: asset.description,
    url: storedUrl,
    storage_path: asset.storagePath,
    duration_seconds: asset.durationSeconds,
    size_bytes: asset.sizeBytes ?? null,
    order_index: asset.orderIndex,
  };
  const request = asset.id
    ? supabase.from("assets").update(payload).eq("id", asset.id).select("id").single()
    : supabase.from("assets").insert(payload).select("id").single();
  const { data, error } = await request;
  if (error || !data) return { error: error?.message ?? "No pudimos guardar el contenido." };
  refreshCoursePaths(parentCourseId);
  return { data: { id: data.id } };
}

export async function deleteAsset(assetId: string) {
  await requireRole(["admin"]);
  const parsed = identifier.safeParse(assetId);
  if (!parsed.success) return { error: "El contenido seleccionado no es válido." };
  const supabase = await createClient();
  const { data: asset } = await supabase.from("assets").select("course_id, module_id, storage_path").eq("id", parsed.data).maybeSingle();
  const parentCourseId = asset?.course_id ?? (asset?.module_id ? (await supabase.from("modules").select("course_id").eq("id", asset.module_id).maybeSingle()).data?.course_id : null);
  if (asset?.storage_path) await supabase.storage.from("course-media").remove([asset.storage_path]);
  const { error } = await supabase.from("assets").delete().eq("id", parsed.data);
  if (error) return { error: "No pudimos eliminar el contenido." };
  refreshCoursePaths(parentCourseId ?? undefined);
  return { data: { id: parsed.data } };
}

export async function assignCourse(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const assignment = parsed.data;
  const supabase = await createClient();
  const { data: employees } = await supabase.from("profiles").select("id").in("id", assignment.userIds).eq("role", "empleado").eq("is_active", true);
  if ((employees?.length ?? 0) !== assignment.userIds.length) return { error: "Solo podés asignar cursos a empleados activos." };
  const { error } = await supabase.from("enrollments").upsert(assignment.userIds.map((userId) => ({ user_id: userId, course_id: assignment.courseId, assigned_by: viewer.id, due_date: assignment.dueDate })), { onConflict: "user_id,course_id" });
  if (error) return { error: "No pudimos asignar el curso." };
  refreshCoursePaths(assignment.courseId);
  return { data: { assigned: assignment.userIds.length } };
}

export async function unassignCourse(input: unknown) {
  await requireRole(["admin"]);
  const parsed = unassignmentSchema.safeParse(input);
  if (!parsed.success) return { error: "La asignación seleccionada no es válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("enrollments").delete().eq("course_id", parsed.data.courseId).eq("user_id", parsed.data.userId);
  if (error) return { error: "No pudimos quitar la asignación." };
  refreshCoursePaths(parsed.data.courseId);
  return { data: parsed.data };
}

export async function saveExam(input: unknown) {
  await requireRole(["admin"]);
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const exam = parsed.data;
  const supabase = await createClient();
  const payload = {
    course_id: exam.courseId,
    module_id: exam.moduleId,
    title: exam.title,
    description: exam.description,
    passing_score: exam.passingScore,
    max_attempts: exam.maxAttempts,
    cooldown_minutes: exam.cooldownMinutes,
    time_limit_minutes: exam.timeLimitMinutes,
    shuffle_questions: exam.shuffleQuestions,
    shuffle_options: exam.shuffleOptions,
    show_correct_answers: exam.showCorrectAnswers,
    blocks_progress: exam.blocksProgress,
    is_active: exam.isActive,
  };
  const request = exam.id
    ? supabase.from("exams").update(payload).eq("id", exam.id).select("id").single()
    : supabase.from("exams").insert(payload).select("id").single();
  const { data: savedExam, error } = await request;
  if (error || !savedExam) return { error: error?.message ?? "No pudimos guardar el examen." };

  if (exam.id) {
    const { error: deleteError } = await supabase.from("questions").delete().eq("exam_id", savedExam.id);
    if (deleteError) return { error: "El examen se guardó, pero no pudimos actualizar sus preguntas." };
  }
  for (const [index, question] of exam.questions.entries()) {
    const { data: savedQuestion, error: questionError } = await supabase.from("questions").insert({ exam_id: savedExam.id, prompt: question.prompt, explanation: question.explanation, points: question.points, order_index: index + 1 }).select("id").single();
    if (questionError || !savedQuestion) return { error: "El examen se guardó, pero una pregunta no pudo registrarse." };
    const { error: optionError } = await supabase.from("options").insert(question.options.map((option, optionIndex) => ({ question_id: savedQuestion.id, label: option.label, is_correct: option.isCorrect, order_index: optionIndex + 1 })));
    if (optionError) return { error: "El examen se guardó, pero una opción no pudo registrarse." };
  }
  refreshCoursePaths(exam.courseId ?? undefined);
  return { data: { id: savedExam.id } };
}

export async function deleteExam(examId: string) {
  await requireRole(["admin"]);
  const parsed = identifier.safeParse(examId);
  if (!parsed.success) return { error: "El examen seleccionado no es válido." };
  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams").select("course_id").eq("id", parsed.data).maybeSingle();
  const { error } = await supabase.from("exams").delete().eq("id", parsed.data);
  if (error) return { error: "No pudimos eliminar el examen." };
  refreshCoursePaths(exam?.course_id ?? undefined);
  return { data: { id: parsed.data } };
}