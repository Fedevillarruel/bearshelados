import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { databaseUuid } from "@/lib/validations/ids";

const payloadSchema = z.object({ assetId: databaseUuid });

function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return json({ error: "Origen de solicitud no permitido." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Progreso de contenido inválido." }, 400);
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Progreso de contenido inválido." }, 400);

  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sesión requerida." }, 401);
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("assets")
    .select("id, course_id, module_id, type")
    .eq("id", parsed.data.assetId)
    .neq("type", "video")
    .maybeSingle();
  if (!asset) return json({ error: "No tenés acceso a este contenido." }, 403);

  const courseId = asset.course_id ?? (asset.module_id ? (await supabase.from("modules").select("course_id").eq("id", asset.module_id).maybeSingle()).data?.course_id : null);
  if (!courseId) return json({ error: "El contenido no pertenece a un curso válido." }, 400);
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", viewer.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!enrollment) return json({ error: "No estás inscripto en este curso." }, 403);

  const { error } = await supabase.from("resource_progress").upsert({
    user_id: viewer.id,
    asset_id: asset.id,
    viewed_at: new Date().toISOString(),
  }, { onConflict: "user_id,asset_id" });
  if (error) return json({ error: "No pudimos guardar el progreso del contenido." }, 500);

  return json({ completed: true });
}