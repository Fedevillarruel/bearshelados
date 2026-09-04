"use server";

import { redirect } from "next/navigation";
import { defaultRouteForRole, getViewer, requireRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import { createUserSchema, signInSchema } from "@/lib/validations/auth";
import { databaseUuid } from "@/lib/validations/ids";
import { z } from "zod";

export type ActionState = { error?: string; success?: string };

type AuthAdminError = { status?: number; code?: string; message?: string };

const nullableFranchiseId = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || null : value ?? null,
  databaseUuid.nullable(),
);

function isMissingAuthIdentity(error: AuthAdminError | null) {
  if (!error) return false;
  if (error.status === 404 || error.code === "user_not_found") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("user not found") || message.includes("user does not exist");
}

function isAuthUserLoadFailure(error: AuthAdminError | null) {
  return error?.status === 500 && error.message?.toLowerCase().includes("database error loading user");
}

function logAuthDeletionFailure(error: AuthAdminError) {
  const message = error.message
    ?.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[correo oculto]")
    .replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi, "[id oculto]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
  console.error("No se pudo eliminar una cuenta de Supabase Auth.", {
    status: typeof error.status === "number" ? error.status : null,
    code: typeof error.code === "string" ? error.code.slice(0, 100) : null,
    message: message || null,
  });
}

const managedProfileSchema = z.object({
  id: databaseUuid,
  email: z.string().trim().email("Ingresá un correo válido."),
  fullName: z.string().trim().min(2, "Ingresá el nombre completo."),
  role: z.enum(["admin", "franquiciado", "empleado"]),
  franchiseId: nullableFranchiseId,
  position: z.string().trim().max(100).nullable(),
  phone: z.string().trim().max(30).nullable(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
}).superRefine((value, context) => {
  if (value.role === "franquiciado" && !value.franchiseId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["franchiseId"], message: "La franquicia es obligatoria para franquiciados." });
  }
});

async function createManagedUser(profile: z.infer<typeof createUserSchema>) {
  const admin = createAdminClient();
  const { data: result, error } = await admin.auth.admin.createUser({
    email: profile.email,
    password: profile.password,
    email_confirm: true,
    user_metadata: {
      full_name: profile.fullName,
    },
  });
  if (error || !result.user) return { error: error?.message ?? "No se pudo crear el usuario." };

  const { error: profileError } = await admin.from("profiles").upsert({
    id: result.user.id,
    email: profile.email,
    full_name: profile.fullName,
    role: profile.role,
    franchise_id: profile.franchiseId,
    position: profile.position,
    phone: profile.phone,
    must_change_password: profile.mustChangePassword,
  }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(result.user.id);
    return { error: "No pudimos completar el perfil del usuario." };
  }

  return { data: { id: result.user.id } };
}

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "No pudimos iniciar sesión. Revisá tu correo y contraseña." };

  const viewer = await getViewer();
  if (!viewer) return { error: "Tu usuario no tiene un perfil activo en la plataforma." };
  redirect(defaultRouteForRole(viewer.role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const password = z.string().min(12, "La contraseña debe tener al menos 12 caracteres.").safeParse(formData.get("password"));
  if (!password.success) return { error: password.error.issues[0]?.message };

  const viewer = await getViewer();
  if (!viewer) return { error: "Tu sesión venció. Volvé a ingresar." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "No pudimos actualizar la contraseña. Intentá de nuevo." };

  await supabase.from("profiles").update({ must_change_password: false }).eq("id", viewer.id);
  redirect(defaultRouteForRole(viewer.role));
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.string().trim().email("Ingresá un correo válido.").safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.issues[0]?.message };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { error: "El acceso todavía no está configurado." };
  }

  const siteUrl = getConfiguredSiteUrl();
  if (!siteUrl) return { error: "La recuperación de contraseña todavía no está configurada." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: new URL("/auth/callback?next=/cambiar-contrasena", siteUrl).toString(),
  });
  if (error) return { error: "No pudimos enviar el enlace de recuperación. Intentá nuevamente." };

  return { success: "Si el correo está registrado, vas a recibir un enlace para restablecer tu contraseña." };
}

export async function createUser(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!viewer.isSuperAdmin && parsed.data.role === "admin") return { error: "Solo la superadministración puede crear cuentas administradoras." };

  return createManagedUser(parsed.data);
}

export async function updateUser(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = managedProfileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const profile = parsed.data;
  if (viewer.id === profile.id && !profile.isActive) return { error: "No podés desactivar tu propia cuenta." };

  const admin = createAdminClient();
  const { data: existingProfile } = await admin.from("profiles").select("email, full_name, role, is_super_admin").eq("id", profile.id).maybeSingle();
  if (!existingProfile) return { error: "El perfil seleccionado no existe." };
  if (existingProfile.is_super_admin && !viewer.isSuperAdmin) return { error: "No tenés permiso para modificar una cuenta con acceso comercial." };
  if (!viewer.isSuperAdmin && (existingProfile.role === "admin" || profile.role === "admin")) return { error: "Solo la superadministración puede administrar cuentas administradoras." };
  if (existingProfile.is_super_admin && profile.role !== "admin") return { error: "Primero revocá el acceso comercial antes de cambiar el rol de esta cuenta." };
  if (viewer.id === profile.id && profile.role !== "admin") return { error: "No podés quitarte tu propio rol administrador." };

  if (existingProfile.email !== profile.email || existingProfile.full_name !== profile.fullName) {
    const { error: authError } = await admin.auth.admin.updateUserById(profile.id, {
      email: profile.email,
      user_metadata: { full_name: profile.fullName },
    });
    if (authError) return { error: "No pudimos actualizar los datos de acceso de la cuenta." };
  }

  const { error: profileError } = await admin.from("profiles").update({
    email: profile.email,
    full_name: profile.fullName,
    role: profile.role,
    franchise_id: profile.franchiseId,
    position: profile.position,
    phone: profile.phone,
    must_change_password: profile.mustChangePassword,
    is_active: profile.isActive,
  }).eq("id", profile.id);

  if (profileError) return { error: "No pudimos actualizar el perfil." };
  if (!profile.isActive) await admin.auth.admin.signOut(profile.id, "global");
  return { data: { id: profile.id } };
}

export async function setUserActiveStatus(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = z.object({ userId: databaseUuid, isActive: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (viewer.id === parsed.data.userId && !parsed.data.isActive) return { error: "No podés desactivar tu propia cuenta." };

  const admin = createAdminClient();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (!existingProfile) return { error: "El perfil seleccionado no existe." };
  if (existingProfile.is_super_admin && !viewer.isSuperAdmin) return { error: "No tenés permiso para modificar una cuenta con acceso comercial." };
  if (!viewer.isSuperAdmin && existingProfile.role === "admin") return { error: "Solo la superadministración puede administrar cuentas administradoras." };

  const { error } = await admin
    .from("profiles")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.userId);
  if (error) return { error: "No pudimos actualizar el acceso de la cuenta." };
  if (!parsed.data.isActive) await admin.auth.admin.signOut(parsed.data.userId, "global");
  return { data: { id: parsed.data.userId } };
}

export async function deleteUser(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = z.object({ userId: databaseUuid }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (viewer.id === parsed.data.userId) return { error: "No podés eliminar tu propia cuenta." };

  const admin = createAdminClient();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (!existingProfile) return { error: "El perfil seleccionado no existe." };
  if (existingProfile.is_super_admin && !viewer.isSuperAdmin) return { error: "No tenés permiso para eliminar una cuenta con acceso comercial." };
  if (!viewer.isSuperAdmin && existingProfile.role === "admin") return { error: "Solo la superadministración puede eliminar cuentas administradoras." };

  const cleanupResults = await Promise.all([
    admin.from("courses").update({ created_by: null }).eq("created_by", parsed.data.userId),
    admin.from("enrollments").update({ assigned_by: null }).eq("assigned_by", parsed.data.userId),
    admin.from("manuals").update({ created_by: null }).eq("created_by", parsed.data.userId),
  ]);
  if (cleanupResults.some(({ error }) => error)) return { error: "No pudimos preparar los registros vinculados para eliminar la cuenta." };

  const { error: authError } = await admin.auth.admin.deleteUser(parsed.data.userId, false);
  if (isAuthUserLoadFailure(authError)) {
    const { data: deletedByRecovery, error: recoveryError } = await admin.rpc("delete_auth_user_for_service_role", {
      target_user_id: parsed.data.userId,
    });
    if (recoveryError || typeof deletedByRecovery !== "boolean") {
      if (recoveryError) logAuthDeletionFailure(recoveryError);
      return { error: "La identidad de acceso requiere reparación en Supabase. El perfil se conservó." };
    }
    if (deletedByRecovery) return { data: { id: parsed.data.userId } };

    const { error: profileError } = await admin.from("profiles").delete().eq("id", parsed.data.userId);
    if (profileError) return { error: "No pudimos eliminar el perfil de la cuenta." };
    return { data: { id: parsed.data.userId } };
  }
  if (authError && !isMissingAuthIdentity(authError)) {
    logAuthDeletionFailure(authError);
    return { error: "No pudimos eliminar la cuenta de acceso. El perfil se conservó." };
  }

  if (authError) {
    const { error: profileError } = await admin.from("profiles").delete().eq("id", parsed.data.userId);
    if (profileError) return { error: "No pudimos eliminar el perfil de la cuenta." };
  }

  return { data: { id: parsed.data.userId } };
}

export async function resetUserPassword(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = z.object({ userId: databaseUuid, password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres.") }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const { data: existingProfile } = await admin.from("profiles").select("role, is_super_admin").eq("id", parsed.data.userId).maybeSingle();
  if (!existingProfile) return { error: "El perfil seleccionado no existe." };
  if (existingProfile.is_super_admin && !viewer.isSuperAdmin) return { error: "No tenés permiso para restablecer una cuenta con acceso comercial." };
  if (!viewer.isSuperAdmin && existingProfile.role === "admin") return { error: "Solo la superadministración puede restablecer cuentas administradoras." };

  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password: parsed.data.password });
  if (error) return { error: "No pudimos restablecer la contraseña." };

  const { error: profileError } = await admin.from("profiles").update({ must_change_password: true }).eq("id", parsed.data.userId);
  if (profileError) return { error: "La contraseña cambió, pero no pudimos activar el cambio obligatorio." };
  await admin.auth.admin.signOut(parsed.data.userId, "global");
  return { data: { id: parsed.data.userId } };
}

export async function setUserCommercialAccess(input: unknown) {
  const viewer = await requireRole(["admin"]);
  if (!viewer.isSuperAdmin) return { error: "Solo la superadministración puede cambiar el acceso comercial." };

  const parsed = z.object({ userId: databaseUuid, isSuperAdmin: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (viewer.id === parsed.data.userId && !parsed.data.isSuperAdmin) return { error: "No podés revocar tu propio acceso comercial." };

  const admin = createAdminClient();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("role, is_active, is_super_admin")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (!existingProfile) return { error: "El perfil seleccionado no existe." };
  if (parsed.data.isSuperAdmin && (existingProfile.role !== "admin" || !existingProfile.is_active)) {
    return { error: "El acceso comercial sólo puede asignarse a una cuenta administradora activa." };
  }
  if (existingProfile.is_super_admin === parsed.data.isSuperAdmin) return { data: { id: parsed.data.userId } };

  const { error } = await admin
    .from("profiles")
    .update({ is_super_admin: parsed.data.isSuperAdmin })
    .eq("id", parsed.data.userId);
  if (error) return { error: "No pudimos actualizar el acceso comercial." };
  if (!parsed.data.isSuperAdmin) await admin.auth.admin.signOut(parsed.data.userId, "global");
  return { data: { id: parsed.data.userId } };
}

export async function createUsersFromCsv(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const rows = z.array(z.unknown()).max(500, "El archivo puede tener hasta 500 filas.").safeParse(input);
  if (!rows.success) return { error: rows.error.issues[0]?.message };

  const results: Array<{ row: number; email: string; error?: string }> = [];
  for (const [index, row] of rows.data.entries()) {
    const parsed = createUserSchema.safeParse(row);
    const email = typeof (row as { email?: unknown })?.email === "string" ? (row as { email: string }).email : "sin correo";
    if (!parsed.success) {
      results.push({ row: index + 1, email, error: parsed.error.issues[0]?.message });
      continue;
    }
    if (!viewer.isSuperAdmin && parsed.data.role === "admin") {
      results.push({ row: index + 1, email: parsed.data.email, error: "Solo la superadministración puede crear cuentas administradoras." });
      continue;
    }
    const result = await createManagedUser(parsed.data);
    results.push({ row: index + 1, email: parsed.data.email, error: result.error });
  }

  return { data: results };
}