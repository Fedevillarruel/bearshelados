"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const franchiseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120),
  code: z.string().trim().toUpperCase().max(24).nullable(),
  city: z.string().trim().max(120).nullable(),
  isActive: z.boolean(),
});

function refreshFranchisePaths() {
  revalidatePath("/admin/franquicias");
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/dashboard");
}

export async function saveFranchise(input: unknown) {
  await requireRole(["admin"]);
  const parsed = franchiseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const franchise = parsed.data;
  const supabase = await createClient();
  const payload = {
    name: franchise.name,
    code: franchise.code || null,
    city: franchise.city || null,
    is_active: franchise.isActive,
  };
  const request = franchise.id
    ? supabase.from("franchises").update(payload).eq("id", franchise.id).select("id").single()
    : supabase.from("franchises").insert(payload).select("id").single();
  const { data, error } = await request;
  if (error || !data) {
    return { error: error?.code === "23505" ? "Ese código de franquicia ya está en uso." : error?.message ?? "No pudimos guardar la franquicia." };
  }
  refreshFranchisePaths();
  return { data: { id: data.id } };
}

export async function deleteFranchise(franchiseId: string) {
  await requireRole(["admin"]);
  const parsed = z.string().uuid().safeParse(franchiseId);
  if (!parsed.success) return { error: "La franquicia seleccionada no es válida." };
  const supabase = await createClient();
  const { count, error: countError } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("franchise_id", parsed.data);
  if (countError) return { error: "No pudimos comprobar las cuentas asignadas." };
  if (count && count > 0) return { error: "No podés eliminar una franquicia con usuarios asignados. Desasignalos o desactivá la franquicia." };
  const { error } = await supabase.from("franchises").delete().eq("id", parsed.data);
  if (error) return { error: "No pudimos eliminar la franquicia." };
  refreshFranchisePaths();
  return { data: { id: parsed.data } };
}