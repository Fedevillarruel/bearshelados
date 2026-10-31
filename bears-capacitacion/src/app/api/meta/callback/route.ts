import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIError, aiFailure, checkDB, requireAIAdmin } from "@/lib/ai/http";
import { encryptMetaToken, hashState, metaConfig } from "@/lib/ai/meta";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const viewer = await requireAIAdmin(request);
    const config = metaConfig();
    const state = request.nextUrl.searchParams.get("state");
    if (!state || request.cookies.get("bears_meta_state")?.value !== state) throw new AIError("La autorización de Meta no es válida o venció.", 400);
    const db = createAdminClient();
    const consumed = await db.from("ai_oauth_states").delete().eq("state_hash", hashState(state)).eq("user_id", viewer.id)
      .gt("expires_at", new Date().toISOString()).select("state_hash");
    checkDB(consumed.error);
    if (!consumed.data?.length) throw new AIError("La autorización de Meta venció. Iniciá la conexión nuevamente.", 400);
    if (request.nextUrl.searchParams.has("error")) throw new AIError("No se otorgaron los permisos de Meta.", 400);
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new AIError("Meta no devolvió el código de autorización.", 400);
    const exchange = async (params: Record<string, string>) => {
      const response = await fetch(`https://graph.facebook.com/${config.version}/oauth/access_token`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.appId, client_secret: config.secret, ...params }),
        signal: AbortSignal.timeout(20_000), cache: "no-store",
      });
      if (!response.ok) throw new AIError("Meta no pudo validar la autorización. Iniciá nuevamente la conexión.", 502);
      const result = await response.json();
      if (typeof result.access_token !== "string") throw new AIError("Meta no devolvió un token válido.", 502);
      return result.access_token as string;
    };
    const short = await exchange({ code, redirect_uri: config.callback });
    const token = await exchange({ grant_type: "fb_exchange_token", fb_exchange_token: short });
    checkDB((await db.from("ai_oauth_pending").upsert({
      user_id: viewer.id, encrypted_token: encryptMetaToken(token), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })).error);
    const response = NextResponse.redirect(new URL("/admin/ia?meta=select", config.callback), 303);
    response.cookies.delete({ name: "bears_meta_state", path: "/api/meta" });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return aiFailure(error); }
}
