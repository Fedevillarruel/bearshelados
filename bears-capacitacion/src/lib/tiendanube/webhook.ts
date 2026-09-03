import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type PrivacyRequest = {
  customerId: string | null;
  externalRequestId: string;
  orderIds: string[];
  type: "store_redact" | "customers_redact" | "customers_data_request";
};

export type TiendanubeWebhook = {
  event: string;
  payloadHash: string;
  privacyRequest: PrivacyRequest | null;
  resourceId: string | null;
  sanitizedPayload: Record<string, string | string[]>;
  storeId: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function identifier(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,160}$/.test(normalized) ? normalized : null;
}

function identifierList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(identifier).filter((item): item is string => Boolean(item)))].slice(0, 1_000);
}

function privacyRequest(event: string, payload: Record<string, unknown>, payloadHash: string): PrivacyRequest | null {
  if (event === "store/redact") {
    return { type: "store_redact", customerId: null, externalRequestId: payloadHash, orderIds: [] };
  }
  if (event !== "customers/redact" && event !== "customers/data_request") return null;

  const customer = record(payload.customer);
  const dataRequest = record(payload.data_request);
  const orderIds = identifierList(event === "customers/redact" ? payload.orders_to_redact : payload.orders_requested);
  const customerId = identifier(customer?.id);
  const providerRequestId = identifier(dataRequest?.id);
  const requestKey = providerRequestId ?? createHash("sha256")
    .update(`${event}:${customerId ?? "unknown"}:${orderIds.sort().join(",")}`, "utf8")
    .digest("hex");

  return {
    type: event === "customers/redact" ? "customers_redact" : "customers_data_request",
    customerId,
    externalRequestId: requestKey,
    orderIds,
  };
}

export function verifyTiendanubeWebhookSignature(rawBody: string, signature: string | null, clientSecret: string) {
  if (!signature || !clientSecret) return false;
  const normalizedSignature = signature.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedSignature)) return false;

  const expectedSignature = createHmac("sha256", clientSecret).update(rawBody, "utf8").digest();
  const receivedSignature = Buffer.from(normalizedSignature, "hex");
  return receivedSignature.length === expectedSignature.length && timingSafeEqual(receivedSignature, expectedSignature);
}

export function parseTiendanubeWebhook(rawBody: string): TiendanubeWebhook | null {
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const payload = record(rawPayload);
  if (!payload) return null;

  const storeId = identifier(payload.store_id);
  const event = typeof payload.event === "string" ? payload.event.trim() : "";
  if (!storeId || !/^[0-9]+$/.test(storeId) || !/^[a-z_]+\/[a-z_]+$/.test(event)) return null;

  const resourceId = identifier(payload.id) ?? identifier(payload.order_id) ?? identifier(payload.fulfillment_id);
  const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const sanitizedPayload: Record<string, string | string[]> = { event, store_id: storeId };
  if (resourceId) sanitizedPayload.resource_id = resourceId;

  const request = privacyRequest(event, payload, payloadHash);
  if (request?.customerId) sanitizedPayload.customer_id = request.customerId;
  if (request?.orderIds.length) sanitizedPayload.order_ids = request.orderIds;
  if (request?.externalRequestId) sanitizedPayload.request_id = request.externalRequestId;

  return { event, payloadHash, privacyRequest: request, resourceId, sanitizedPayload, storeId };
}