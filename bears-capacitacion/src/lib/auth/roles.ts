import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ADMIN_PREVIEW_COOKIE, isPreviewRole } from "@/lib/auth/preview";
import { databaseUuid } from "@/lib/validations/ids";

export type AppRole = "admin" | "franquiciado" | "empleado";

export type Viewer = {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
  franchiseId: string | null;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
  previewAdminId?: string;
};

export async function getViewer(): Promise<Viewer | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, franchise_id, is_active, must_change_password, is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.role || !profile.is_active) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as AppRole,
    franchiseId: profile.franchise_id,
    mustChangePassword: profile.must_change_password ?? false,
    isSuperAdmin: profile.is_super_admin ?? false,
  };
}

export async function requireRole(allowedRoles: AppRole[]) {
  const viewer = await getViewer();

  if (!viewer) redirect("/login");
  if (!allowedRoles.includes(viewer.role)) redirect(defaultRouteForRole(viewer.role));

  return viewer;
}

export async function getPortalViewer(): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin" || viewer.mustChangePassword) return viewer;
  const targetId = (await cookies()).get(ADMIN_PREVIEW_COOKIE)?.value;
  if (!targetId || !databaseUuid.safeParse(targetId).success) return viewer;
  const { data: profile, error } = await (await createClient())
    .from("profiles")
    .select("id, email, full_name, role, franchise_id, is_active")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw new Error("No pudimos cargar la vista del usuario seleccionado.");
  if (!profile?.is_active || !isPreviewRole(profile.role)) return viewer;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    franchiseId: profile.franchise_id,
    mustChangePassword: false,
    isSuperAdmin: false,
    previewAdminId: viewer.id,
  };
}

export async function requirePortalRole(allowedRoles: AppRole[]) {
  const viewer = await getPortalViewer();
  if (!viewer) redirect("/login");
  if (!allowedRoles.includes(viewer.role)) redirect(defaultRouteForRole(viewer.role));
  return viewer;
}

export async function hasAdminPreview() {
  return Boolean((await getPortalViewer())?.previewAdminId);
}

export async function requireSuperAdmin() {
  const viewer = await requireRole(["admin"]);
  if (!viewer.isSuperAdmin) redirect("/admin/dashboard");
  return viewer;
}

export function defaultRouteForRole(role: AppRole) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "franquiciado") return "/franquicia/dashboard";
  return "/cursos/mis-cursos";
}