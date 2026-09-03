import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { TiendanubeConfig } from "@/lib/tiendanube/config";

const requiredScopes = ["read_orders", "read_products"] as const;
const allowedScopes = new Set<string>(requiredScopes);

type TokenExchangeResult = {
  accessToken: string;
  scopes: string[];
  storeId: string;
};

function parseScopes(value: string) {
  return [...new Set(value.split(",").map((scope) => scope.trim()).filter(Boolean))].sort();
}

export function createTiendanubeOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function hashTiendanubeOAuthState(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function createTiendanubeAuthorizationUrl(config: TiendanubeConfig, state: string) {
  const url = new URL(`https://www.tiendanube.com/apps/${config.appId}/authorize`);
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeTiendanubeAuthorizationCode(config: TiendanubeConfig, code: string): Promise<TokenExchangeResult | null> {
  if (!code || code.length > 4_096) return null;

  let response: Response;
  try {
    response = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": config.appUserAgent,
      },
      body: JSON.stringify({
        client_id: config.appId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  const result = payload as Record<string, unknown>;
  const accessToken = result.access_token;
  const grantedScope = result.scope;
  const storeId = result.user_id;
  if (typeof accessToken !== "string" || !accessToken || typeof grantedScope !== "string") return null;

  const normalizedStoreId = typeof storeId === "string" || typeof storeId === "number" ? String(storeId) : "";
  if (!/^\d+$/.test(normalizedStoreId)) return null;

  const scopes = parseScopes(grantedScope);
  if (scopes.length !== requiredScopes.length || scopes.some((scope) => !allowedScopes.has(scope)) || requiredScopes.some((scope) => !scopes.includes(scope))) {
    return null;
  }

  return { accessToken, scopes, storeId: normalizedStoreId };
}