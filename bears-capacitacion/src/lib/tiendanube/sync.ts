import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTiendanubeConfig, type TiendanubeConfig } from "@/lib/tiendanube/config";
import { decryptTiendanubeAccessToken } from "@/lib/tiendanube/token-crypto";

const apiOrigin = "https://api.tiendanube.com";
const apiVersion = "2025-03";
const maxPagesPerSyncRun = 4;
const minimumRequestIntervalMilliseconds = 600;
const requestTimeoutMilliseconds = 10_000;
const maxWebhookAttempts = 8;

const orderFields = "id,number,status,payment_status,shipping_status,storefront,total,currency,created_at,updated_at,paid_at,products";
const productFields = "id,name,variants,updated_at";
const commercialWebhookEvents = [
  "app/uninstalled",
  "app/suspended",
  "app/resumed",
  "order/created",
  "order/updated",
  "order/paid",
  "order/cancelled",
  "product/created",
  "product/updated",
  "product/deleted",
];

type JsonRecord = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient>;

type Connection = {
  id: string;
  lastSyncedAt: string | null;
  status: string;
  storeId: string;
  webhookRegisteredAt: string | null;
};

type ClaimedSyncRun = {
  connectionId: string;
  cursor: unknown;
  id: string;
  kind: "initial" | "incremental" | "privacy" | "webhook";
  metrics: unknown;
};

type ClaimedWebhookEvent = {
  connectionId: string | null;
  event: string;
  id: string;
  processingAttempts: number;
  resourceId: string | null;
};

type ClaimedPrivacyRequest = {
  connectionId: string | null;
  id: string;
  orderIds: string[];
  requestType: "customers_data_request" | "customers_redact" | "store_redact";
};

type InventorySnapshot = {
  connection_id: string;
  external_product_id: string;
  external_variant_id: string;
  location_id: string | null;
  product_name: string | null;
  sku: string | null;
  stock: string | null;
  stock_management: boolean | null;
};

type OrderItem = {
  external_line_item_id: string;
  external_product_id: string | null;
  external_variant_id: string | null;
  line_total: string | null;
  product_name: string | null;
  quantity: string;
  sku: string | null;
  unit_price: string | null;
};

type Order = {
  currency: string | null;
  externalOrderId: string;
  items: OrderItem[] | null;
  orderNumber: string | null;
  paidAt: string | null;
  paymentStatus: string | null;
  shippingStatus: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  status: string | null;
  storefront: string | null;
  total: string | null;
};

type SyncCursor = {
  nextUrl: string | null;
  phase: "orders" | "products";
  updatedAtMin: string | null;
};

type SyncMetrics = {
  orderItems: number;
  orders: number;
  pages: number;
  snapshots: number;
  skipped: number;
};

export type TiendanubeWorkerSummary = {
  privacyRequests: number;
  scheduledSyncRuns: number;
  syncRuns: number;
  webhookEvents: number;
};

class TiendanubeWorkError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly upstreamStatus: number | null = null,
  ) {
    super(message);
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function asRecordList(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => Boolean(item)) : [];
}

function readUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}

function readProviderId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\d{1,30}$/.test(normalized) ? normalized : null;
}

function readExternalKey(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,160}$/.test(normalized) ? normalized : null;
}

function readText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function readDecimal(value: unknown, integerDigits: number, decimalDigits: number, mustBePositive = false) {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : readText(value, integerDigits + decimalDigits + 3);
  if (!normalized) return null;

  const decimalPattern = new RegExp(`^-?\\d{1,${integerDigits}}(?:\\.\\d{1,${decimalDigits}})?$`);
  if (!decimalPattern.test(normalized)) return null;
  if (mustBePositive && Number(normalized) <= 0) return null;
  return normalized;
}

function readTimestamp(value: unknown) {
  const text = readText(value, 80);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function readCurrency(value: unknown) {
  const text = readText(value, 3)?.toUpperCase();
  return text && /^[A-Z]{3}$/.test(text) ? text : null;
}

function readSku(value: unknown) {
  return readText(value, 120)?.toUpperCase() ?? null;
}

function readLocalizedText(value: unknown, maximumLength: number) {
  const direct = readText(value, maximumLength);
  if (direct) return direct;

  const localized = asRecord(value);
  if (!localized) return null;

  for (const language of ["es", "pt", "en"]) {
    const translation = readText(localized[language], maximumLength);
    if (translation) return translation;
  }

  for (const translation of Object.values(localized)) {
    const text = readText(translation, maximumLength);
    if (text) return text;
  }

  return null;
}

function controlledErrorMessage(error: unknown) {
  return error instanceof TiendanubeWorkError ? error.message : "No se pudo completar la operación comercial de Tiendanube.";
}

function canRetry(error: unknown) {
  return error instanceof TiendanubeWorkError && error.retryable;
}

function upstreamStatus(error: unknown) {
  return error instanceof TiendanubeWorkError ? error.upstreamStatus : null;
}

function isApiUrl(url: URL, storeId: string) {
  return url.protocol === "https:" && url.origin === apiOrigin && url.pathname.startsWith(`/${apiVersion}/${storeId}/`);
}

function apiUrl(storeId: string, path: string) {
  return new URL(`/${apiVersion}/${storeId}/${path}`, apiOrigin);
}

function nextPageUrl(linkHeader: string | null, storeId: string) {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(/,(?=\s*<)/)) {
    const match = part.match(/<([^>]+)>[^,]*\brel="?next"?/i);
    if (!match) continue;

    try {
      const url = new URL(match[1]);
      if (!isApiUrl(url, storeId)) throw new TiendanubeWorkError("La paginación de Tiendanube no es válida.");
      return url;
    } catch (error) {
      if (error instanceof TiendanubeWorkError) throw error;
      throw new TiendanubeWorkError("La paginación de Tiendanube no es válida.");
    }
  }

  return null;
}

class TiendanubeApi {
  private lastRequestAt = 0;

  constructor(
    private readonly appUserAgent: string,
    private readonly accessToken: string,
    private readonly storeId: string,
  ) {}

  async get(url: URL) {
    return this.request(url, "GET");
  }

  async post(url: URL, body: JsonRecord) {
    return this.request(url, "POST", body);
  }

  private async request(url: URL, method: "GET" | "POST", body?: JsonRecord) {
    if (!isApiUrl(url, this.storeId)) throw new TiendanubeWorkError("La URL de Tiendanube no es válida.");

    const waitTime = minimumRequestIntervalMilliseconds - (Date.now() - this.lastRequestAt);
    if (waitTime > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
    this.lastRequestAt = Date.now();

    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${this.accessToken}`,
      "User-Agent": this.appUserAgent,
    });
    if (body) headers.set("Content-Type", "application/json");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      throw new TiendanubeWorkError("Tiendanube no respondió a tiempo.", true);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new TiendanubeWorkError("Tiendanube rechazó la sincronización comercial.", retryable, response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new TiendanubeWorkError("Tiendanube devolvió una respuesta no válida.", true);
    }

    return { nextUrl: nextPageUrl(response.headers.get("link"), this.storeId), payload };
  }
}

function parseInventorySnapshots(value: JsonRecord, connectionId: string) {
  const productId = readProviderId(value.id);
  if (!productId) return [];

  const productName = readLocalizedText(value.name, 260);
  const snapshots: InventorySnapshot[] = [];

  for (const variant of asRecordList(value.variants)) {
    const variantId = readProviderId(variant.id);
    if (!variantId) continue;

    const baseSnapshot = {
      connection_id: connectionId,
      external_product_id: productId,
      external_variant_id: variantId,
      product_name: productName,
      sku: readSku(variant.sku),
      stock_management: typeof variant.stock_management === "boolean" ? variant.stock_management : null,
    };
    const inventoryLevels = asRecordList(variant.inventory_levels);

    if (!inventoryLevels.length) {
      snapshots.push({ ...baseSnapshot, location_id: null, stock: readDecimal(variant.stock, 11, 3) });
      continue;
    }

    for (const level of inventoryLevels) {
      snapshots.push({
        ...baseSnapshot,
        location_id: readExternalKey(level.location_id),
        stock: readDecimal(level.stock, 11, 3),
      });
    }
  }

  return snapshots;
}

function calculateLineTotal(quantity: string, unitPrice: string | null) {
  if (!unitPrice) return null;
  const total = Number(quantity) * Number(unitPrice);
  return Number.isFinite(total) && Math.abs(total) < 100_000_000_000_000 ? total.toFixed(2) : null;
}

function parseOrderItem(value: JsonRecord): OrderItem | null {
  const externalLineItemId = readProviderId(value.id);
  const quantity = readDecimal(value.quantity, 9, 3, true);
  if (!externalLineItemId || !quantity) return null;

  const unitPrice = readDecimal(value.price, 14, 2);
  return {
    external_line_item_id: externalLineItemId,
    external_product_id: readProviderId(value.product_id),
    external_variant_id: readProviderId(value.variant_id),
    line_total: calculateLineTotal(quantity, unitPrice),
    product_name: readText(value.name, 300),
    quantity,
    sku: readSku(value.sku),
    unit_price: unitPrice,
  };
}

function parseOrder(value: JsonRecord): Order | null {
  const externalOrderId = readProviderId(value.id);
  if (!externalOrderId) return null;

  const sourceItems = Array.isArray(value.products) ? asRecordList(value.products) : null;
  const itemIds = new Set<string>();
  const items = sourceItems?.flatMap((item) => {
    const parsed = parseOrderItem(item);
    if (!parsed || itemIds.has(parsed.external_line_item_id)) return [];
    itemIds.add(parsed.external_line_item_id);
    return [parsed];
  }) ?? null;

  const orderNumber = readProviderId(value.number) ?? readText(value.number, 80);
  return {
    currency: readCurrency(value.currency),
    externalOrderId,
    items,
    orderNumber,
    paidAt: readTimestamp(value.paid_at),
    paymentStatus: readText(value.payment_status, 80),
    shippingStatus: readText(value.shipping_status, 80),
    sourceCreatedAt: readTimestamp(value.created_at),
    sourceUpdatedAt: readTimestamp(value.updated_at),
    status: readText(value.status, 80),
    storefront: readText(value.storefront, 80),
    total: readDecimal(value.total, 14, 2),
  };
}

async function saveInventorySnapshots(admin: AdminClient, snapshots: InventorySnapshot[]) {
  for (let index = 0; index < snapshots.length; index += 500) {
    const { error } = await admin.from("tiendanube_inventory_snapshots").insert(snapshots.slice(index, index + 500));
    if (error) throw new TiendanubeWorkError("No se pudo guardar el inventario comercial.", true);
  }
}

async function saveOrder(admin: AdminClient, connectionId: string, order: Order) {
  const { data, error } = await admin.from("tiendanube_orders").upsert({
    connection_id: connectionId,
    external_order_id: order.externalOrderId,
    order_number: order.orderNumber,
    status: order.status,
    payment_status: order.paymentStatus,
    shipping_status: order.shippingStatus,
    storefront: order.storefront,
    total: order.total,
    currency: order.currency,
    source_created_at: order.sourceCreatedAt,
    source_updated_at: order.sourceUpdatedAt,
    paid_at: order.paidAt,
    synced_at: new Date().toISOString(),
  }, { onConflict: "connection_id,external_order_id" }).select("id").single();
  const orderId = readUuid(asRecord(data)?.id);
  if (error || !orderId) throw new TiendanubeWorkError("No se pudo guardar una orden comercial.", true);

  if (!order.items) return 0;

  const { error: deleteError } = await admin.from("tiendanube_order_items").delete().eq("order_id", orderId);
  if (deleteError) throw new TiendanubeWorkError("No se pudieron actualizar los artículos de una orden.", true);

  for (let index = 0; index < order.items.length; index += 500) {
    const rows = order.items.slice(index, index + 500).map((item) => ({ ...item, order_id: orderId }));
    const { error: itemError } = await admin.from("tiendanube_order_items").insert(rows);
    if (itemError) throw new TiendanubeWorkError("No se pudieron guardar los artículos de una orden.", true);
  }

  return order.items.length;
}

async function loadConnection(admin: AdminClient, connectionId: string): Promise<Connection> {
  const { data, error } = await admin
    .from("tiendanube_connections")
    .select("id, store_id, status, last_synced_at, webhook_registered_at")
    .eq("id", connectionId)
    .maybeSingle();
  const connection = asRecord(data);
  const id = readUuid(connection?.id);
  const storeId = readProviderId(connection?.store_id);
  const status = readText(connection?.status, 32);
  if (error || !id || !storeId || !status) throw new TiendanubeWorkError("No se pudo leer la conexión de Tiendanube.", true);

  return {
    id,
    lastSyncedAt: readTimestamp(connection?.last_synced_at),
    status,
    storeId,
    webhookRegisteredAt: readTimestamp(connection?.webhook_registered_at),
  };
}

async function loadAccessToken(admin: AdminClient, connectionId: string, config: TiendanubeConfig) {
  const { data, error } = await admin
    .from("tiendanube_connection_secrets")
    .select("encrypted_access_token")
    .eq("connection_id", connectionId)
    .maybeSingle();
  const ciphertext = readText(asRecord(data)?.encrypted_access_token, 8_192);
  if (error || !ciphertext) throw new TiendanubeWorkError("La credencial de Tiendanube no está disponible.");

  try {
    return decryptTiendanubeAccessToken(ciphertext, config.tokenEncryptionKey);
  } catch {
    throw new TiendanubeWorkError("La credencial de Tiendanube no es válida.");
  }
}

function listUrl(storeId: string, resource: "orders" | "products", fields: string, updatedAtMin: string | null) {
  const url = apiUrl(storeId, resource);
  url.searchParams.set("fields", fields);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "100");
  if (updatedAtMin) url.searchParams.set("updated_at_min", updatedAtMin);
  return url;
}

function parseMetrics(value: unknown): SyncMetrics {
  const source = asRecord(value);
  const metric = (name: string) => typeof source?.[name] === "number" && Number.isFinite(source[name]) && source[name] >= 0
    ? Math.floor(source[name])
    : 0;
  return {
    orderItems: metric("order_items"),
    orders: metric("orders"),
    pages: metric("pages"),
    snapshots: metric("snapshots"),
    skipped: metric("skipped"),
  };
}

function serializeMetrics(metrics: SyncMetrics) {
  return {
    order_items: metrics.orderItems,
    orders: metrics.orders,
    pages: metrics.pages,
    snapshots: metrics.snapshots,
    skipped: metrics.skipped,
  };
}

function parseCursor(value: unknown, kind: ClaimedSyncRun["kind"], lastSyncedAt: string | null): SyncCursor {
  const source = asRecord(value);
  const phase = source?.phase === "orders" ? "orders" : "products";
  const nextUrl = readText(source?.next_url, 2_000);
  const storedWatermark = readTimestamp(source?.updated_at_min);
  const fallbackWatermark = lastSyncedAt ? new Date(Date.parse(lastSyncedAt) - 5 * 60_000).toISOString() : null;

  return {
    nextUrl,
    phase,
    updatedAtMin: kind === "initial" ? null : storedWatermark ?? fallbackWatermark,
  };
}

function serializeCursor(cursor: SyncCursor) {
  return {
    phase: cursor.phase,
    next_url: cursor.nextUrl,
    updated_at_min: cursor.updatedAtMin,
  };
}

async function setConnectionSyncState(admin: AdminClient, connectionId: string, state: "failed" | "queued" | "running" | "succeeded", errorMessage: string | null = null) {
  const { error } = await admin.from("tiendanube_connections").update({
    last_sync_status: state,
    last_sync_error: errorMessage,
  }).eq("id", connectionId);
  if (error) throw new TiendanubeWorkError("No se pudo actualizar el estado comercial.", true);
}

async function ensureCommercialWebhooks(admin: AdminClient, api: TiendanubeApi, config: TiendanubeConfig, connection: Connection) {
  const callbackUrl = new URL("/api/tiendanube/webhooks", config.siteUrl).toString();
  const existingUrl = apiUrl(connection.storeId, "webhooks");
  existingUrl.searchParams.set("per_page", "200");
  existingUrl.searchParams.set("url", callbackUrl);
  const { payload } = await api.get(existingUrl);
  if (!Array.isArray(payload)) throw new TiendanubeWorkError("Tiendanube devolvió webhooks no válidos.", true);

  const registeredEvents = new Set(
    asRecordList(payload)
      .filter((webhook) => webhook.url === callbackUrl)
      .map((webhook) => readText(webhook.event, 120))
      .filter((event): event is string => Boolean(event)),
  );

  for (const event of commercialWebhookEvents) {
    if (registeredEvents.has(event)) continue;
    await api.post(apiUrl(connection.storeId, "webhooks"), { event, url: callbackUrl });
  }

  const { error } = await admin.from("tiendanube_connections").update({
    webhook_registered_at: new Date().toISOString(),
  }).eq("id", connection.id);
  if (error) throw new TiendanubeWorkError("No se pudo confirmar los webhooks comerciales.", true);
}

async function finishSyncRun(admin: AdminClient, run: ClaimedSyncRun, connection: Connection, cursor: SyncCursor, metrics: SyncMetrics) {
  const completedAt = new Date().toISOString();
  const { error: runError } = await admin.from("tiendanube_sync_runs").update({
    status: "succeeded",
    cursor: serializeCursor(cursor),
    metrics: serializeMetrics(metrics),
    error_message: null,
    finished_at: completedAt,
  }).eq("id", run.id).eq("status", "running");
  if (runError) throw new TiendanubeWorkError("No se pudo cerrar la sincronización comercial.", true);

  const { error: connectionError } = await admin.from("tiendanube_connections").update({
    last_synced_at: completedAt,
    last_sync_status: "succeeded",
    last_sync_error: null,
  }).eq("id", connection.id);
  if (connectionError) throw new TiendanubeWorkError("No se pudo actualizar el estado comercial.", true);
}

async function continueSyncRun(admin: AdminClient, run: ClaimedSyncRun, connection: Connection, cursor: SyncCursor, metrics: SyncMetrics) {
  const { error: runError } = await admin.from("tiendanube_sync_runs").update({
    status: "queued",
    cursor: serializeCursor(cursor),
    metrics: serializeMetrics(metrics),
    error_message: null,
    finished_at: null,
  }).eq("id", run.id).eq("status", "running");
  if (runError) throw new TiendanubeWorkError("No se pudo continuar la sincronización comercial.", true);

  await setConnectionSyncState(admin, connection.id, "queued");
}

async function failSyncRun(admin: AdminClient, run: ClaimedSyncRun, connectionId: string, error: unknown) {
  const retry = canRetry(error);
  const message = controlledErrorMessage(error);
  const { error: runError } = await admin.from("tiendanube_sync_runs").update({
    status: retry ? "queued" : "failed",
    error_message: message,
    finished_at: retry ? null : new Date().toISOString(),
  }).eq("id", run.id).eq("status", "running");
  if (runError) return;

  const status = upstreamStatus(error);
  const connectionUpdate: JsonRecord = {
    last_sync_status: retry ? "queued" : "failed",
    last_sync_error: message,
  };
  if (status === 401) {
    connectionUpdate.status = "revoked";
    connectionUpdate.revoked_at = new Date().toISOString();
  } else if (status === 402 || status === 403) {
    connectionUpdate.status = "error";
  }

  await admin.from("tiendanube_connections").update(connectionUpdate).eq("id", connectionId);
  if (status === 401) await admin.from("tiendanube_connection_secrets").delete().eq("connection_id", connectionId);
}

async function cancelSyncRun(admin: AdminClient, run: ClaimedSyncRun) {
  await admin.from("tiendanube_sync_runs").update({
    status: "cancelled",
    error_message: "La conexión de Tiendanube ya no está activa.",
    finished_at: new Date().toISOString(),
  }).eq("id", run.id).eq("status", "running");
}

async function processSyncRun(admin: AdminClient, config: TiendanubeConfig, run: ClaimedSyncRun) {
  let connection: Connection | null = null;
  try {
    const activeConnection = await loadConnection(admin, run.connectionId);
    connection = activeConnection;
    if (activeConnection.status !== "connected") {
      await cancelSyncRun(admin, run);
      return false;
    }

    const accessToken = await loadAccessToken(admin, activeConnection.id, config);
    const api = new TiendanubeApi(config.appUserAgent, accessToken, activeConnection.storeId);
    await setConnectionSyncState(admin, activeConnection.id, "running");
    if (!activeConnection.webhookRegisteredAt) await ensureCommercialWebhooks(admin, api, config, activeConnection);

    const cursor = parseCursor(run.cursor, run.kind, activeConnection.lastSyncedAt);
    const metrics = parseMetrics(run.metrics);
    let pagesProcessed = 0;

    while (pagesProcessed < maxPagesPerSyncRun) {
      const fields = cursor.phase === "products" ? productFields : orderFields;
      const url = cursor.nextUrl ? new URL(cursor.nextUrl) : listUrl(activeConnection.storeId, cursor.phase, fields, cursor.updatedAtMin);
      const { nextUrl, payload } = await api.get(url);
      if (!Array.isArray(payload)) throw new TiendanubeWorkError("Tiendanube devolvió una lista comercial no válida.", true);

      const records = asRecordList(payload);
      metrics.pages += 1;
      metrics.skipped += payload.length - records.length;
      pagesProcessed += 1;

      if (cursor.phase === "products") {
        const snapshots = records.flatMap((record) => parseInventorySnapshots(record, activeConnection.id));
        await saveInventorySnapshots(admin, snapshots);
        metrics.snapshots += snapshots.length;
      } else {
        for (const record of records) {
          const order = parseOrder(record);
          if (!order) {
            metrics.skipped += 1;
            continue;
          }
          metrics.orderItems += await saveOrder(admin, activeConnection.id, order);
          metrics.orders += 1;
        }
      }

      if (nextUrl) {
        cursor.nextUrl = nextUrl.toString();
        continue;
      }

      if (cursor.phase === "products") {
        cursor.phase = "orders";
        cursor.nextUrl = null;
        continue;
      }

      await finishSyncRun(admin, run, activeConnection, cursor, metrics);
      return true;
    }

    await continueSyncRun(admin, run, activeConnection, cursor, metrics);
    return true;
  } catch (error) {
    try {
      await failSyncRun(admin, run, connection?.id ?? run.connectionId, error);
    } catch {
      return false;
    }
    return false;
  }
}

async function finishWebhookEvent(admin: AdminClient, eventId: string) {
  const { error } = await admin.from("tiendanube_webhook_events").update({
    status: "processed",
    last_error: null,
    locked_at: null,
    processed_at: new Date().toISOString(),
  }).eq("id", eventId).eq("status", "processing");
  if (error) throw new TiendanubeWorkError("No se pudo cerrar un evento comercial.", true);
}

async function failWebhookEvent(admin: AdminClient, event: ClaimedWebhookEvent, error: unknown) {
  const retry = canRetry(error) && event.processingAttempts < maxWebhookAttempts;
  const { error: updateError } = await admin.from("tiendanube_webhook_events").update({
    status: retry ? "queued" : "failed",
    last_error: controlledErrorMessage(error),
    locked_at: null,
    processed_at: retry ? null : new Date().toISOString(),
  }).eq("id", event.id).eq("status", "processing");
  if (updateError) return;

  if (event.connectionId && upstreamStatus(error) === 401) {
    await admin.from("tiendanube_connections").update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      last_sync_status: "failed",
      last_sync_error: "La credencial de Tiendanube fue rechazada.",
    }).eq("id", event.connectionId);
    await admin.from("tiendanube_connection_secrets").delete().eq("connection_id", event.connectionId);
  }
}

async function revokeConnection(admin: AdminClient, connectionId: string, message: string) {
  const { error: secretError } = await admin.from("tiendanube_connection_secrets").delete().eq("connection_id", connectionId);
  if (secretError) throw new TiendanubeWorkError("No se pudo revocar la credencial comercial.", true);

  const { error: connectionError } = await admin.from("tiendanube_connections").update({
    status: "revoked",
    revoked_at: new Date().toISOString(),
    last_sync_status: "failed",
    last_sync_error: message,
  }).eq("id", connectionId);
  if (connectionError) throw new TiendanubeWorkError("No se pudo revocar la conexión comercial.", true);
}

async function resumeConnection(admin: AdminClient, connectionId: string) {
  const connection = await loadConnection(admin, connectionId);
  if (connection.status === "revoked" || connection.status === "connected") return;

  const { error: connectionError } = await admin.from("tiendanube_connections").update({
    status: "connected",
    last_synced_at: null,
    last_sync_status: "queued",
    last_sync_error: null,
  }).eq("id", connectionId);
  if (connectionError) throw new TiendanubeWorkError("No se pudo reanudar la conexión comercial.", true);

  const { error: queueError } = await admin.rpc("enqueue_tiendanube_incremental_syncs");
  if (queueError) throw new TiendanubeWorkError("No se pudo programar la sincronización comercial.", true);
}

async function processWebhookEvent(admin: AdminClient, config: TiendanubeConfig, event: ClaimedWebhookEvent) {
  try {
    if (!event.connectionId) throw new TiendanubeWorkError("El evento comercial no tiene conexión asociada.");

    if (event.event === "app/uninstalled") {
      await revokeConnection(admin, event.connectionId, "La aplicación fue desinstalada en Tiendanube.");
      await finishWebhookEvent(admin, event.id);
      return true;
    }

    if (event.event === "app/suspended") {
      const connection = await loadConnection(admin, event.connectionId);
      if (connection.status !== "revoked") {
        const { error } = await admin.from("tiendanube_connections").update({
          status: "error",
          last_sync_status: "failed",
          last_sync_error: "Tiendanube suspendió temporalmente el acceso de la aplicación.",
        }).eq("id", event.connectionId);
        if (error) throw new TiendanubeWorkError("No se pudo actualizar el estado comercial.", true);
      }
      await finishWebhookEvent(admin, event.id);
      return true;
    }

    if (event.event === "app/resumed") {
      await resumeConnection(admin, event.connectionId);
      await finishWebhookEvent(admin, event.id);
      return true;
    }

    if (event.event === "store/redact" || event.event === "customers/redact" || event.event === "customers/data_request") {
      await finishWebhookEvent(admin, event.id);
      return true;
    }

    if (!event.resourceId) {
      await finishWebhookEvent(admin, event.id);
      return true;
    }

    const connection = await loadConnection(admin, event.connectionId);
    if (connection.status !== "connected") {
      await finishWebhookEvent(admin, event.id);
      return true;
    }

    if (event.event === "product/deleted") {
      await finishWebhookEvent(admin, event.id);
      return true;
    }

    const accessToken = await loadAccessToken(admin, connection.id, config);
    const api = new TiendanubeApi(config.appUserAgent, accessToken, connection.storeId);

    if (event.event.startsWith("order/") && readProviderId(event.resourceId)) {
      const { payload } = await api.get(apiUrl(connection.storeId, `orders/${event.resourceId}?fields=${encodeURIComponent(orderFields)}`));
      const order = asRecord(payload) && parseOrder(asRecord(payload)!);
      if (!order) throw new TiendanubeWorkError("Tiendanube devolvió una orden no válida.", true);
      await saveOrder(admin, connection.id, order);
    } else if (event.event.startsWith("product/") && readProviderId(event.resourceId)) {
      const { payload } = await api.get(apiUrl(connection.storeId, `products/${event.resourceId}?fields=${encodeURIComponent(productFields)}`));
      const product = asRecord(payload);
      if (!product) throw new TiendanubeWorkError("Tiendanube devolvió un producto no válido.", true);
      await saveInventorySnapshots(admin, parseInventorySnapshots(product, connection.id));
    }

    await finishWebhookEvent(admin, event.id);
    return true;
  } catch (error) {
    if (upstreamStatus(error) === 404) {
      try {
        await finishWebhookEvent(admin, event.id);
        return true;
      } catch {
        return false;
      }
    }

    try {
      await failWebhookEvent(admin, event, error);
    } catch {
      return false;
    }
    return false;
  }
}

async function finishPrivacyRequest(admin: AdminClient, requestId: string) {
  const { error } = await admin.from("tiendanube_privacy_requests").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    customer_id: null,
    order_ids: [],
    error_message: null,
    locked_at: null,
  }).eq("id", requestId).eq("status", "processing");
  if (error) throw new TiendanubeWorkError("No se pudo cerrar una solicitud de privacidad.", true);
}

async function failPrivacyRequest(admin: AdminClient, requestId: string) {
  await admin.from("tiendanube_privacy_requests").update({
    status: "queued",
    error_message: "No se pudo procesar la solicitud de privacidad.",
    locked_at: null,
  }).eq("id", requestId).eq("status", "processing");
}

async function processPrivacyRequest(admin: AdminClient, request: ClaimedPrivacyRequest) {
  try {
    if (!request.connectionId) throw new TiendanubeWorkError("La solicitud de privacidad no tiene conexión asociada.");

    if (request.requestType === "store_redact") {
      const { error } = await admin.from("tiendanube_connections").delete().eq("id", request.connectionId);
      if (error) throw new TiendanubeWorkError("No se pudo eliminar la información comercial de la tienda.", true);
      return true;
    }

    if (request.requestType === "customers_redact" && request.orderIds.length) {
      const { error } = await admin
        .from("tiendanube_orders")
        .delete()
        .eq("connection_id", request.connectionId)
        .in("external_order_id", request.orderIds);
      if (error) throw new TiendanubeWorkError("No se pudo eliminar la información comercial solicitada.", true);
    }

    await finishPrivacyRequest(admin, request.id);
    return true;
  } catch {
    try {
      await failPrivacyRequest(admin, request.id);
    } catch {
      return false;
    }
    return false;
  }
}

function claimedSyncRuns(value: unknown): ClaimedSyncRun[] {
  return asRecordList(value).flatMap((row) => {
    const id = readUuid(row.id);
    const connectionId = readUuid(row.connection_id);
    const kind = row.kind;
    if (!id || !connectionId || (kind !== "initial" && kind !== "incremental" && kind !== "privacy" && kind !== "webhook")) return [];
    return [{ id, connectionId, kind, cursor: row.cursor, metrics: row.metrics }];
  });
}

function claimedWebhookEvents(value: unknown) {
  return asRecordList(value).flatMap((row) => {
    const id = readUuid(row.id);
    const event = readText(row.event, 120);
    const attempts = typeof row.processing_attempts === "number" && Number.isInteger(row.processing_attempts) && row.processing_attempts >= 0
      ? row.processing_attempts
      : null;
    if (!id || !event || attempts === null) return [];
    return [{
      id,
      event,
      processingAttempts: attempts,
      connectionId: readUuid(row.connection_id),
      resourceId: readExternalKey(row.resource_id),
    }];
  });
}

function claimedPrivacyRequests(value: unknown): ClaimedPrivacyRequest[] {
  return asRecordList(value).flatMap((row) => {
    const id = readUuid(row.id);
    const requestType = row.request_type;
    if (!id || (requestType !== "store_redact" && requestType !== "customers_redact" && requestType !== "customers_data_request")) return [];
    return [{
      id,
      requestType,
      connectionId: readUuid(row.connection_id),
      orderIds: Array.isArray(row.order_ids)
        ? row.order_ids.map(readProviderId).filter((orderId): orderId is string => Boolean(orderId)).slice(0, 1_000)
        : [],
    }];
  });
}

function integerResult(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export async function processTiendanubeWork(): Promise<TiendanubeWorkerSummary> {
  const config = getTiendanubeConfig();
  const admin = createAdminClient();
  const summary: TiendanubeWorkerSummary = {
    privacyRequests: 0,
    scheduledSyncRuns: 0,
    syncRuns: 0,
    webhookEvents: 0,
  };

  const { data: scheduled, error: scheduleError } = await admin.rpc("enqueue_tiendanube_incremental_syncs");
  if (scheduleError) throw new TiendanubeWorkError("No se pudo programar la sincronización comercial.", true);
  summary.scheduledSyncRuns = integerResult(scheduled);

  const { data: privacyData, error: privacyError } = await admin.rpc("claim_tiendanube_privacy_requests", { batch_size: 10 });
  if (privacyError) throw new TiendanubeWorkError("No se pudieron reclamar solicitudes de privacidad.", true);
  for (const request of claimedPrivacyRequests(privacyData)) {
    if (await processPrivacyRequest(admin, request)) summary.privacyRequests += 1;
  }

  const { data: webhookData, error: webhookError } = await admin.rpc("claim_tiendanube_webhook_events", { batch_size: 10 });
  if (webhookError) throw new TiendanubeWorkError("No se pudieron reclamar eventos comerciales.", true);
  for (const event of claimedWebhookEvents(webhookData)) {
    if (await processWebhookEvent(admin, config, event)) summary.webhookEvents += 1;
  }

  const { data: syncData, error: syncError } = await admin.rpc("claim_tiendanube_sync_runs", { batch_size: 1 });
  if (syncError) throw new TiendanubeWorkError("No se pudo reclamar una sincronización comercial.", true);
  for (const run of claimedSyncRuns(syncData)) {
    if (await processSyncRun(admin, config, run)) summary.syncRuns += 1;
  }

  return summary;
}