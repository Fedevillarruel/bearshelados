"use server";

import { redirect } from "next/navigation";
import { defaultRouteForRole, getViewer, requireRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import { createUserSchema, signInSchema } from "@/lib/validations/auth";
import { z } from "zod";

export type ActionState = { error?: string; success?: string };

const managedProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().email("Ingresá un correo válido."),
  fullName: z.string().trim().min(2, "Ingresá el nombre completo."),
  role: z.enum(["admin", "franquiciado", "empleado"]),
  franchiseId: z.string().uuid().nullable(),
  position: z.string().trim().max(100).nullable(),
  phone: z.string().trim().max(30).nullable(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
}).superRefine((value, context) => {
  if (value.role !== "admin" && !value.franchiseId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["franchiseId"], message: "La franquicia es obligatoria para empleados y franquiciados." });
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
      role: profile.role,
      franchise_id: profile.franchiseId ?? "",
    },
  });
  if (error || !result.user) return { error: error?.message ?? "No se pudo crear el usuario." };

  const { error: profileError } = await admin.from("profiles").update({
    full_name: profile.fullName,
    role: profile.role,
    franchise_id: profile.franchiseId,
    position: profile.position,
    phone: profile.phone,
    must_change_password: profile.mustChangePassword,
  }).eq("id", result.user.id);
  if (profileError) return { error: "El usuario fue creado, pero no se pudo completar su perfil." };

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
  await requireRole(["admin"]);
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  return createManagedUser(parsed.data);
}

export async function updateUser(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = managedProfileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const profile = parsed.data;
  if (viewer.id === profile.id && !profile.isActive) return { error: "No podés desactivar tu propia cuenta." };

  const admin = createAdminClient();
  const { data: existingProfile } = await admin.from("profiles").select("is_super_admin").eq("id", profile.id).maybeSingle();
  if (!existingProfile) return { error: "El perfil seleccionado no existe." };
  if (existingProfile.is_super_admin && !viewer.isSuperAdmin) return { error: "No tenés permiso para modificar una cuenta con acceso comercial." };
  if (existingProfile.is_super_admin && profile.role !== "admin") return { error: "Primero revocá el acceso comercial antes de cambiar el rol de esta cuenta." };

  const { error: authError } = await admin.auth.admin.updateUserById(profile.id, {
    email: profile.email,
    user_metadata: { full_name: profile.fullName, role: profile.role, franchise_id: profile.franchiseId ?? "" },
  });
  if (authError) return { error: "No pudimos actualizar el correo de la cuenta." };

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
  return { data: { id: profile.id } };
}

export async function resetUserPassword(input: unknown) {
  const viewer = await requireRole(["admin"]);
  const parsed = z.object({ userId: z.string().uuid(), password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres.") }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const { data: existingProfile } = await admin.from("profiles").select("is_super_admin").eq("id", parsed.data.userId).maybeSingle();
  if (!existingProfile) return { error: "El perfil seleccionado no existe." };
  if (existingProfile.is_super_admin && !viewer.isSuperAdmin) return { error: "No tenés permiso para restablecer una cuenta con acceso comercial." };

  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password: parsed.data.password });
  if (error) return { error: "No pudimos restablecer la contraseña." };

  const { error: profileError } = await admin.from("profiles").update({ must_change_password: true }).eq("id", parsed.data.userId);
  if (profileError) return { error: "La contraseña cambió, pero no pudimos activar el cambio obligatorio." };
  return { data: { id: parsed.data.userId } };
}

export async function createUsersFromCsv(input: unknown) {
  await requireRole(["admin"]);
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
    const result = await createManagedUser(parsed.data);
    results.push({ row: index + 1, email: parsed.data.email, error: result.error });
  }

  return { data: results };
}