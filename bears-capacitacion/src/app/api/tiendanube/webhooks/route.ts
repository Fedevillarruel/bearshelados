import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTiendanubeWebhookSecret } from "@/lib/tiendanube/config";
import { parseTiendanubeWebhook, verifyTiendanubeWebhookSignature } from "@/lib/tiendanube/webhook";

export const runtime = "nodejs";

function response(status: number, body?: Record<string, boolean>) {
  return NextResponse.json(body ?? { received: true }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let clientSecret: string;
  try {
    clientSecret = getTiendanubeWebhookSecret();
  } catch {
    return response(503, { received: false });
  }

  const rawBody = await request.text();
  if (!verifyTiendanubeWebhookSignature(rawBody, request.headers.get("x-linkedstore-hmac-sha256"), clientSecret)) {
    return response(401, { received: false });
  }

  const webhook = parseTiendanubeWebhook(rawBody);
  if (!webhook) return response(400, { received: false });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return response(503, { received: false });
  }

  const { data: connection, error: connectionError } = await admin
    .from("tiendanube_connections")
    .select("id")
    .eq("store_id", webhook.storeId)
    .maybeSingle();
  if (connectionError) return response(503, { received: false });
  if (!connection) return response(202);

  const { error: eventError } = await admin.from("tiendanube_webhook_events").insert({
    connection_id: connection.id,
    store_id: webhook.storeId,
    event: webhook.event,
    resource_id: webhook.resourceId,
    sanitized_payload: webhook.sanitizedPayload,
    payload_sha256: webhook.payloadHash,
  });
  if (eventError) return response(503, { received: false });

  if (webhook.privacyRequest) {
    const { error: privacyError } = await admin.from("tiendanube_privacy_requests").upsert({
      connection_id: connection.id,
      store_id: webhook.storeId,
      request_type: webhook.privacyRequest.type,
      external_request_id: webhook.privacyRequest.externalRequestId,
      customer_id: webhook.privacyRequest.customerId,
      order_ids: webhook.privacyRequest.orderIds,
    }, { onConflict: "store_id,request_type,external_request_id" });
    if (privacyError) return response(503, { received: false });
  }

  return response(202);
}