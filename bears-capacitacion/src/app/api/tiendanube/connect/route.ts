import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTiendanubeConfig } from "@/lib/tiendanube/config";
import { createTiendanubeAuthorizationUrl, createTiendanubeOAuthState, hashTiendanubeOAuthState } from "@/lib/tiendanube/oauth";

export const runtime = "nodejs";

function json(body: Record<string, string>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sesión requerida." }, 401);
  if (viewer.role !== "admin" || !viewer.isSuperAdmin) return json({ error: "No tenés permiso para conectar Tiendanube." }, 403);

  let config;
  try {
    config = getTiendanubeConfig();
  } catch {
    return json({ error: "La conexión de Tiendanube todavía no está configurada." }, 503);
  }

  if (request.headers.get("origin") !== config.siteUrl) return json({ error: "Origen de solicitud no permitido." }, 403);

  const state = createTiendanubeOAuthState();
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

  try {
    const admin = createAdminClient();
    await admin.from("tiendanube_oauth_states").delete().eq("user_id", viewer.id).is("consumed_at", null);
    const { error } = await admin.from("tiendanube_oauth_states").insert({
      state_hash: hashTiendanubeOAuthState(state),
      user_id: viewer.id,
      expires_at: expiresAt,
    });
    if (error) return json({ error: "No pudimos preparar la autorización de Tiendanube." }, 500);
  } catch {
    return json({ error: "No pudimos preparar la autorización de Tiendanube." }, 500);
  }

  const response = NextResponse.redirect(createTiendanubeAuthorizationUrl(config, state), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}