"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultRouteForRole, getViewer } from "@/lib/auth/roles";
import { ADMIN_PREVIEW_COOKIE, isPreviewRole } from "@/lib/auth/preview";
import { createClient } from "@/lib/supabase/server";
import { databaseUuid } from "@/lib/validations/ids";

export async function selectPortalView(targetId: string | null) {
  const admin = await getViewer();
  if (!admin || admin.role !== "admin" || admin.mustChangePassword) {
    return { error: "Solo el administrador puede cambiar la vista." };
  }
  const cookieStore = await cookies();
  if (targetId === null) {
    cookieStore.delete(ADMIN_PREVIEW_COOKIE);
    revalidatePath("/", "layout");
    redirect("/admin/dashboard");
  }
  if (!databaseUuid.safeParse(targetId).success) return { error: "El usuario seleccionado no es válido." };
  const { data: target, error } = await (await createClient())
    .from("profiles").select("id, role, is_active").eq("id", targetId).maybeSingle();
  if (error) return { error: "No pudimos verificar el usuario seleccionado." };
  if (!target?.is_active || !isPreviewRole(target.role)) {
    return { error: "Elegí un empleado o franquiciado activo." };
  }
  cookieStore.set(ADMIN_PREVIEW_COOKIE, target.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  revalidatePath("/", "layout");
  redirect(defaultRouteForRole(target.role));
}
