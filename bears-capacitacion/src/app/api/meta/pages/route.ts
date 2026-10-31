import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIError, aiFailure, aiJson, checkDB, readBody, requireAIAdmin } from "@/lib/ai/http";
import { decryptMetaToken, encryptMetaToken, getAuthorizedPages, getConnection, graph } from "@/lib/ai/meta";

export const runtime = "nodejs";
async function pendingToken(userId: string) {
  const result = await createAdminClient().from("ai_oauth_pending").select("encrypted_token").eq("user_id", userId).gt("expires_at", new Date().toISOString()).maybeSingle();
  checkDB(result.error);
  if (!result.data) throw new AIError("La selección de página venció. Volvé a conectar Meta.", 409);
  return decryptMetaToken(result.data.encrypted_token);
}
export async function GET(request: Request) {
  try {
    const viewer = await requireAIAdmin(request);
    const pages = await getAuthorizedPages(await pendingToken(viewer.id));
    return aiJson({ pages: pages.map((page) => ({ id: page.id, name: page.name, instagramId: page.instagram_business_account?.id ?? null })) });
  } catch (error) { return aiFailure(error); }
}
export async function POST(request: Request) {
  try {
    const viewer = await requireAIAdmin(request, true);
    const parsed = z.object({ pageId: z.string().regex(/^\d+$/) }).strict().safeParse(await readBody(request));
    if (!parsed.success) throw new AIError("Seleccioná una página válida.", 400);
    const page = (await getAuthorizedPages(await pendingToken(viewer.id))).find((page) => page.id === parsed.data.pageId);
    if (!page) throw new AIError("No tenés permisos para esa página.", 403);
    if (!page.instagram_business_account) throw new AIError("Vinculá el Instagram Business de Bears a esta página de Facebook primero.", 422);
    const existing = await getConnection();
    if (existing && existing.page_id !== page.id) throw new AIError("Solo se admite una cuenta de Bears. Desconectá la página anterior antes de cambiarla.", 409);
    const result = await graph(`${page.id}/subscribed_apps`, page.access_token, { subscribed_fields: "messages,messaging_postbacks,message_echoes" }, "POST");
    if (result.success !== true) throw new AIError("Meta no confirmó la suscripción de mensajes.", 502);
    const db = createAdminClient();
    checkDB((await db.rpc("ai_complete_connection", {
      p_user: viewer.id, p_page: page.id, p_name: page.name,
      p_instagram: page.instagram_business_account.id, p_token: encryptMetaToken(page.access_token),
    })).error);
    return aiJson({ ok: true });
  } catch (error) { return aiFailure(error); }
}
