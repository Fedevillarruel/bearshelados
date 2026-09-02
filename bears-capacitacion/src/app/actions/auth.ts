"use server";

import { redirect } from "next/navigation";
import { defaultRouteForRole, getViewer, requireRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createUserSchema, signInSchema } from "@/lib/validations/auth";
import { z } from "zod";

export type ActionState = { error?: string };

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

export async function createUser(input: unknown) {
  await requireRole(["admin"]);
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const profile = parsed.data;
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