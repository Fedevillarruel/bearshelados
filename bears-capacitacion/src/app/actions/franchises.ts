"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { databaseUuid } from "@/lib/validations/ids";

const franchiseSchema = z.object({
  id: databaseUuid.optional(),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120),
  code: z.string().trim().toUpperCase().max(24).nullable(),
  city: z.string().trim().max(120).nullable(),
  isActive: z.boolean(),
});

function refreshFranchisePaths() {
  revalidatePath("/admin/franquicias");
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/dashboard");
  revalidatePath("/franquicia/dashboard");
  revalidatePath("/franquicia/equipo");
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
  const parsed = databaseUuid.safeParse(franchiseId);
  if (!parsed.success) return { error: "La franquicia seleccionada no es válida." };
  const admin = createAdminClient();
  const { data: franchiseManagers, error: managerError } = await admin
    .from("profiles")
    .select("id")
    .eq("franchise_id", parsed.data)
    .eq("role", "franquiciado")
    .limit(1);
  if (managerError) return { error: "No pudimos comprobar los responsables de la franquicia." };

  const { error: mappingsError } = await admin
    .from("tiendanube_sku_branch_mappings")
    .delete()
    .eq("franchise_id", parsed.data);
  if (mappingsError && mappingsError.code !== "42P01") return { error: "No pudimos eliminar las asignaciones comerciales de la franquicia." };

  if (franchiseManagers?.length) {
    const { error: managerUpdateError } = await admin
      .from("profiles")
      .update({ role: "empleado", franchise_id: null })
      .eq("franchise_id", parsed.data)
      .eq("role", "franquiciado");
    if (managerUpdateError) return { error: "No pudimos conservar la cuenta responsable al eliminar la franquicia." };
  }

  const { error } = await admin.from("franchises").delete().eq("id", parsed.data);
  if (error) return { error: "No pudimos eliminar la franquicia." };
  refreshFranchisePaths();
  return { data: { id: parsed.data } };
}