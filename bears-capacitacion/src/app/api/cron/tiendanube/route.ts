import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCronSecret } from "@/lib/tiendanube/config";
import { processTiendanubeWork } from "@/lib/tiendanube/sync";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  let cronSecret: string;
  try {
    cronSecret = getCronSecret();
  } catch {
    return false;
  }

  const authorization = request.headers.get("authorization");
  const suppliedSecret = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!suppliedSecret) return false;

  const expected = Buffer.from(cronSecret, "utf8");
  const actual = Buffer.from(suppliedSecret, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const summary = await processTiendanubeWork();
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo ejecutar la sincronización comercial." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}