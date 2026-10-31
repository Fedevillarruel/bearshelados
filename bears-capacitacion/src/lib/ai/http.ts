import "server-only";
import { NextResponse } from "next/server";
import { getViewer, hasAdminPreview } from "@/lib/auth/roles";
import { getConfiguredSiteUrl } from "@/lib/site-url";

export class AIError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
export function aiJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export function aiFailure(error: unknown) {
  return aiJson({ error: error instanceof AIError ? error.message : "No pudimos completar la operación. Revisá la configuración y reintentá." }, error instanceof AIError ? error.status : 500);
}
export async function requireAIAdmin(request: Request, mutation = false) {
  const viewer = await getViewer();
  if (!viewer) throw new AIError("Sesión requerida.", 401);
  if (viewer.role !== "admin" || viewer.mustChangePassword || await hasAdminPreview()) throw new AIError("Esta función es exclusiva del administrador, fuera de la vista de usuarios.", 403);
  if (mutation && request.headers.get("origin") !== (getConfiguredSiteUrl() ?? new URL(request.url).origin)) throw new AIError("Origen no permitido.", 403);
  return viewer;
}
export async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 150_000) throw new AIError("La solicitud es demasiado grande.", 413);
  const text = await request.text();
  if (text.length > 150_000) throw new AIError("La solicitud es demasiado grande.", 413);
  try { return JSON.parse(text); } catch { throw new AIError("El formato de la solicitud no es válido.", 400); }
}
export function checkDB(error: { message: string } | null) {
  if (error) throw new AIError("No pudimos acceder a los datos de IA. Verificá la migración 022 y los permisos de Supabase.", 503);
}
