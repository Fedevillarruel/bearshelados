import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIError, aiFailure, aiJson, checkDB, requireAIAdmin } from "@/lib/ai/http";
import { connectionToken, graph, hashState, metaConfig } from "@/lib/ai/meta";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const viewer = await requireAIAdmin(request, true);
    const config = metaConfig();
    const state = randomBytes(32).toString("base64url");
    const db = createAdminClient();
    const now = new Date().toISOString();
    checkDB((await db.from("ai_oauth_states").delete().lt("expires_at", now)).error);
    checkDB((await db.from("ai_oauth_pending").delete().lt("expires_at", now)).error);
    checkDB((await db.from("ai_oauth_states").delete().eq("user_id", viewer.id)).error);
    const result = await db.from("ai_oauth_states").insert({
      state_hash: hashState(state), user_id: viewer.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    checkDB(result.error);
    const url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
    url.search = new URLSearchParams({
      client_id: config.appId, redirect_uri: config.callback, state, response_type: "code",
      scope: "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging,instagram_basic,instagram_manage_messages,instagram_manage_comments",
    }).toString();
    const response = NextResponse.redirect(url, 303);
    response.cookies.set("bears_meta_state", state, { httpOnly: true, secure: process.env.NODE_ENV !== "development", sameSite: "lax", path: "/api/meta", maxAge: 600 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return aiFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    await requireAIAdmin(request, true);
    const db = createAdminClient();
    let remoteFailure = false;
    try {
      const { connection, token } = await connectionToken();
      await graph(`${connection.page_id}/subscribed_apps`, token, {}, "DELETE");
    } catch {
      remoteFailure = true;
    }
    checkDB((await db.rpc("ai_disconnect")).error);
    if (remoteFailure) throw new AIError("Bot apagado y tokens locales eliminados, pero Meta no confirmó la desuscripción. Revocá la app desde Meta y actualizá este panel.", 502);
    return aiJson({ ok: true });
  } catch (error) { return aiFailure(error); }
}
