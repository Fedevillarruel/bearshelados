import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import { AIError, checkDB } from "./http";

export function metaReady() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.META_TOKEN_ENCRYPTION_KEY && process.env.META_GRAPH_VERSION && getConfiguredSiteUrl());
}
export function metaConfig() {
  if (!metaReady()) throw new AIError("Faltan las variables server-side de Meta o SITE_URL.", 503);
  const version = process.env.META_GRAPH_VERSION!;
  if (!/^v\d+\.\d+$/.test(version)) throw new AIError("META_GRAPH_VERSION no es válida.", 503);
  return {
    appId: process.env.META_APP_ID!, secret: process.env.META_APP_SECRET!,
    callback: `${getConfiguredSiteUrl()}/api/meta/callback`, version,
  };
}
function encryptionKey() {
  const key = Buffer.from(process.env.META_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new AIError("META_TOKEN_ENCRYPTION_KEY debe contener 32 bytes en base64.", 503);
  return key;
}
const aad = Buffer.from("bears:meta-token:v1");
export function encryptMetaToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptMetaToken(token: string) {
  const [version, iv, tag, data] = token.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new AIError("El token de Meta guardado no es válido.", 503);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
export function hashState(state: string) { return createHash("sha256").update(state).digest("hex"); }
export function validSignature(body: string, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const actual = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function graph(path: string, token: string, params: Record<string, string> = {}, method = "GET") {
  const config = metaConfig();
  const url = new URL(`https://graph.facebook.com/${config.version}/${path}`);
  const proof = createHmac("sha256", config.secret).update(token).digest("hex");
  const parameters = new URLSearchParams({ ...params, appsecret_proof: proof });
  if (method === "GET") url.search = parameters.toString();
  let response: Response;
  try {
    response = await fetch(url, {
      method, headers: { Authorization: `Bearer ${token}`, ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: method === "GET" ? undefined : parameters,
      signal: AbortSignal.timeout(20_000), cache: "no-store",
    });
  } catch { throw new AIError("Meta no respondió a tiempo.", 502); }
  if (!response.ok) throw new AIError(`Meta rechazó la operación (${response.status}). Revisá permisos y reconectá la cuenta si el token fue revocado.`, 502);
  return response.json();
}
const pageSchema = z.object({
  id: z.string().regex(/^\d+$/), name: z.string(), access_token: z.string(),
  instagram_business_account: z.object({ id: z.string().regex(/^\d+$/) }).optional(),
});
export async function getAuthorizedPages(token: string) {
  const pages: z.infer<typeof pageSchema>[] = [];
  let after = "";
  for (let batch = 0; batch < 20; batch++) {
    const payload = await graph("me/accounts", token, { fields: "id,name,access_token,instagram_business_account", limit: "100", ...(after ? { after } : {}) });
    const parsed = z.array(pageSchema).safeParse(payload.data);
    if (!parsed.success) throw new AIError("Meta no devolvió una lista válida de páginas.", 502);
    pages.push(...parsed.data);
    if (!payload.paging?.next) return pages;
    after = payload.paging?.cursors?.after;
    if (!after) throw new AIError("No pudimos paginar las páginas de Meta.", 502);
  }
  throw new AIError("La cuenta devuelve demasiadas páginas. Autorizá únicamente la página de Bears.", 422);
}
export async function getConnection() {
  const db = createAdminClient();
  const result = await db.from("ai_meta_connection").select("*").eq("id", true).maybeSingle();
  checkDB(result.error);
  return result.data;
}
export async function connectionToken() {
  const connection = await getConnection();
  if (!connection) throw new AIError("Conectá la página de Bears primero.", 409);
  const result = await createAdminClient().from("ai_meta_secrets").select("encrypted_token").eq("id", true).single();
  checkDB(result.error);
  return { connection, token: decryptMetaToken(result.data!.encrypted_token) };
}
export async function sendMetaMessage(channel: string, accountId: string, recipient: string, text: string) {
  const { connection, token } = await connectionToken();
  const expected = channel === "instagram" ? connection.instagram_id : connection.page_id;
  if (accountId !== expected) throw new AIError("La conversación corresponde a otra cuenta. No se enviará el mensaje.", 409);
  const result = await graph(`${connection.page_id}/messages`, token, {
    recipient: JSON.stringify({ id: recipient }), message: JSON.stringify({ text }),
    messaging_type: "RESPONSE",
  }, "POST");
  if (!result.message_id) throw new AIError("Meta no confirmó el envío del mensaje.", 502);
  return result.message_id as string;
}
