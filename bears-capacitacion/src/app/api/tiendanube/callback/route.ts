import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTiendanubeConfig } from "@/lib/tiendanube/config";
import { exchangeTiendanubeAuthorizationCode, hashTiendanubeOAuthState } from "@/lib/tiendanube/oauth";
import { encryptTiendanubeAccessToken } from "@/lib/tiendanube/token-crypto";

export const runtime = "nodejs";

function redirectToTiendanube(config: { siteUrl: string }, result: string) {
  const url = new URL("/admin/tiendanube", config.siteUrl);
  url.searchParams.set("result", result);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  let config;
  try {
    config = getTiendanubeConfig();
  } catch {
    return NextResponse.json({ error: "La conexión de Tiendanube todavía no está configurada." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin" || !viewer.isSuperAdmin) return redirectToTiendanube(config, "unauthorized");

  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  if (!state || !/^[A-Za-z0-9_-]{40,128}$/.test(state) || !code) return redirectToTiendanube(config, "invalid-request");

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return redirectToTiendanube(config, "storage-error");
  }

  const now = new Date().toISOString();
  const { data: claimedState, error: claimError } = await admin
    .from("tiendanube_oauth_states")
    .update({ consumed_at: now })
    .eq("state_hash", hashTiendanubeOAuthState(state))
    .eq("user_id", viewer.id)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("state_hash")
    .maybeSingle();
  if (claimError || !claimedState) return redirectToTiendanube(config, "invalid-state");

  const authorization = await exchangeTiendanubeAuthorizationCode(config, code);
  if (!authorization) return redirectToTiendanube(config, "authorization-failed");

  let encryptedAccessToken: string;
  try {
    encryptedAccessToken = encryptTiendanubeAccessToken(authorization.accessToken, config.tokenEncryptionKey);
  } catch {
    return redirectToTiendanube(config, "storage-error");
  }

  const { data: connectionId, error: connectionError } = await admin.rpc("store_tiendanube_connection", {
    target_store_id: authorization.storeId,
    target_scopes: authorization.scopes,
    target_encrypted_access_token: encryptedAccessToken,
    target_encryption_key_version: 1,
    target_connected_by: viewer.id,
  });
  if (connectionError || typeof connectionId !== "string") return redirectToTiendanube(config, "storage-error");

  const { error: syncError } = await admin.from("tiendanube_sync_runs").insert({
    connection_id: connectionId,
    kind: "initial",
    requested_by: viewer.id,
  });
  if (syncError) {
    await admin.from("tiendanube_connections").update({
      last_sync_status: "failed",
      last_sync_error: "No pudimos programar la sincronización inicial.",
    }).eq("id", connectionId);
    return redirectToTiendanube(config, "connected-without-sync");
  }

  await admin.from("tiendanube_connections").update({
    last_sync_status: "queued",
    last_sync_error: null,
  }).eq("id", connectionId);
  return redirectToTiendanube(config, "connected");
}