import "server-only";

import { getConfiguredSiteUrl } from "@/lib/site-url";

const appIdPattern = /^\d+$/;
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type TiendanubeConfig = {
  appId: string;
  appUserAgent: string;
  clientSecret: string;
  siteUrl: string;
  tokenEncryptionKey: Buffer;
};

function decodeEncryptionKey(value: string) {
  if (!base64Pattern.test(value)) throw new Error("TIENDANUBE_TOKEN_ENCRYPTION_KEY debe estar codificada en base64.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("TIENDANUBE_TOKEN_ENCRYPTION_KEY debe decodificar a 32 bytes.");
  return key;
}

export function getTiendanubeConfig(): TiendanubeConfig {
  const appId = process.env.TIENDANUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.TIENDANUBE_CLIENT_SECRET?.trim();
  const appUserAgent = process.env.TIENDANUBE_APP_USER_AGENT?.trim();
  const encryptionKey = process.env.TIENDANUBE_TOKEN_ENCRYPTION_KEY?.trim();
  const siteUrl = getConfiguredSiteUrl();

  if (!appId || !appIdPattern.test(appId)) throw new Error("TIENDANUBE_CLIENT_ID no está configurada correctamente.");
  if (!clientSecret) throw new Error("TIENDANUBE_CLIENT_SECRET no está configurada.");
  if (!appUserAgent) throw new Error("TIENDANUBE_APP_USER_AGENT no está configurada.");
  if (!encryptionKey) throw new Error("TIENDANUBE_TOKEN_ENCRYPTION_KEY no está configurada.");
  if (!siteUrl) throw new Error("SITE_URL no está configurada correctamente.");

  return { appId, appUserAgent, clientSecret, siteUrl, tokenEncryptionKey: decodeEncryptionKey(encryptionKey) };
}

export function getTiendanubeWebhookSecret() {
  const clientSecret = process.env.TIENDANUBE_CLIENT_SECRET?.trim();
  if (!clientSecret) throw new Error("TIENDANUBE_CLIENT_SECRET no está configurada.");
  return clientSecret;
}

export function getCronSecret() {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || cronSecret.length < 32) throw new Error("CRON_SECRET debe tener al menos 32 caracteres.");
  return cronSecret;
}

export function isTiendanubeConfigured() {
  try {
    getTiendanubeConfig();
    return true;
  } catch {
    return false;
  }
}