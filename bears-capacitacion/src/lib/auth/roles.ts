import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "franquiciado" | "empleado";

export type Viewer = {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
  franchiseId: string | null;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
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