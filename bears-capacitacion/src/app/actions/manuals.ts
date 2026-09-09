"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { databaseUuid } from "@/lib/validations/ids";

const identifier = databaseUuid;
const manualRoles = z.enum(["admin", "franquiciado"]);
const supportedFileTypes = z.enum([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const manualSchema = z.object({
  id: identifier.optional(),
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres.").max(180),
  description: z.string().trim().max(2_000).nullable(),
  categoryId: identifier.nullable(),
  visibleTo: z.array(manualRoles).min(1, "Elegí al menos un rol con acceso."),
  fileUrl: z.string().trim().max(2_000),
  storagePath: z.string().trim().max(512).nullable(),
  fileType: z.string().trim().max(160).nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  version: z.number().int().positive().max(10_000),
}).superRefine((value, context) => {
  if (!value.storagePath && !z.string().url().safeParse(value.fileUrl).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["fileUrl"], message: "Subí un archivo o ingresá una URL HTTPS válida." });
  }
  if (!value.storagePath && value.fileUrl && !value.fileUrl.startsWith("https://")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["fileUrl"], message: "La URL externa debe usar HTTPS." });
  }
});

const manualUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  contentType: supportedFileTypes,
  fileSize: z.number().int().positive(),
});

function refreshManualPaths() {
  revalidatePath("/admin/manuales");
  revalidatePath("/franquicia/manuales");
}

export async function createManualUploadUrl(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = manualUploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "El archivo seleccionado no es válido." };
  const fileName = parsed.data.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `manuals/${viewer.id}/${crypto.randomUUID()}-${fileName}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("manuals").createSignedUploadUrl(path);
  if (error || !data) return { error: "No pudimos preparar la subida del manual." };
  return { data: { path: data.path, token: data.token } };
}

export async function saveManual(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const manual = parsed.data;
  const supabase = await createClient();
  let previousStoragePath: string | null = null;
  if (manual.storagePath) {
    const belongsToNewUpload = manual.storagePath.startsWith(`manuals/${viewer.id}/`);
    if (!manual.id && !belongsToNewUpload) return { error: "El archivo no pertenece a esta cuenta administradora." };
    if (manual.id && !belongsToNewUpload) {
      const { data: existingManual } = await supabase.from("manuals").select("storage_path").eq("id", manual.id).maybeSingle();
      if (!existingManual || existingManual.storage_path !== manual.storagePath) {
        return { error: "El archivo privado no corresponde al manual seleccionado." };
      }
      previousStoragePath = existingManual.storage_path;
    }
    if (manual.id && belongsToNewUpload) {
      const { data: existingManual } = await supabase.from("manuals").select("storage_path").eq("id", manual.id).maybeSingle();
      previousStoragePath = existingManual?.storage_path ?? null;
    }
  }
  const payload = {
    title: manual.title,
    description: manual.description,
    category_id: manual.categoryId,
    visible_to: manual.visibleTo,
    file_url: manual.storagePath ?? manual.fileUrl,
    storage_path: manual.storagePath,
    file_type: manual.fileType,
    size_bytes: manual.sizeBytes,
    version: manual.version,
  };
  const request = manual.id
    ? supabase.from("manuals").update(payload).eq("id", manual.id).select("id").single()
    : supabase.from("manuals").insert({ ...payload, created_by: viewer.id }).select("id").single();
  const { data, error } = await request;
  if (error || !data) return { error: error?.message ?? "No pudimos guardar el manual." };
  if (previousStoragePath && previousStoragePath !== manual.storagePath) {
    await supabase.storage.from("manuals").remove([previousStoragePath]);
  }
  refreshManualPaths();
  return { data: { id: data.id } };
}

export async function deleteManual(manualId: string) {
  await requireRole(["admin"]);
  const parsed = identifier.safeParse(manualId);
  if (!parsed.success) return { error: "El manual seleccionado no es válido." };
  const supabase = await createClient();
  const { data: manual } = await supabase.from("manuals").select("storage_path").eq("id", parsed.data).maybeSingle();
  if (manual?.storage_path) {
    const { error: storageError } = await supabase.storage.from("manuals").remove([manual.storage_path]);
    if (storageError) return { error: "No pudimos eliminar el archivo privado." };
  }
  const { error } = await supabase.from("manuals").delete().eq("id", parsed.data);
  if (error) return { error: "No pudimos eliminar el manual." };
  refreshManualPaths();
  return { data: { id: parsed.data } };
}

export async function saveManualCategory(input: unknown) {
  await requireRole(["admin"]);
  const parsed = z.object({ id: identifier.optional(), name: z.string().trim().min(2, "La categoría necesita un nombre.").max(100), orderIndex: z.number().int().min(0).max(10_000) }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const category = parsed.data;
  const supabase = await createClient();
  const request = category.id
    ? supabase.from("manual_categories").update({ name: category.name, order_index: category.orderIndex }).eq("id", category.id).select("id").single()
    : supabase.from("manual_categories").insert({ name: category.name, order_index: category.orderIndex }).select("id").single();
  const { data, error } = await request;
  if (error || !data) return { error: error?.message ?? "No pudimos guardar la categoría." };
  refreshManualPaths();
  return { data: { id: data.id } };
}

export async function deleteManualCategory(categoryId: string) {
  await requireRole(["admin"]);
  const parsed = identifier.safeParse(categoryId);
  if (!parsed.success) return { error: "La categoría seleccionada no es válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("manual_categories").delete().eq("id", parsed.data);
  if (error) return { error: "No pudimos eliminar la categoría." };
  refreshManualPaths();
  return { data: { id: parsed.data } };
}