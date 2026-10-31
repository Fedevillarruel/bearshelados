import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIError, aiFailure, aiJson, checkDB, readBody, requireAIAdmin } from "@/lib/ai/http";
import { sendMetaMessage } from "@/lib/ai/meta";

export const runtime = "nodejs";
async function findConversation(id: string) {
  const result = await createAdminClient().from("ai_conversations").select("*").eq("id", id).maybeSingle();
  checkDB(result.error);
  if (!result.data) throw new AIError("La conversación no existe.", 404);
  return result.data;
}
export async function GET(request: Request) {
  try {
    await requireAIAdmin(request);
    const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) throw new AIError("Conversación inválida.", 400);
    const conversation = await findConversation(id.data);
    const result = await createAdminClient().from("ai_messages").select("id,role,content,status,created_at").eq("conversation_id", id.data).order("created_at", { ascending: false }).limit(100);
    checkDB(result.error);
    return aiJson({ conversation, messages: (result.data ?? []).reverse() });
  } catch (error) { return aiFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    await requireAIAdmin(request, true);
    const parsed = z.object({ id: z.string().uuid(), status: z.enum(["bot", "human"]) }).strict().safeParse(await readBody(request));
    if (!parsed.success) throw new AIError("Estado inválido.", 400);
    await findConversation(parsed.data.id);
    checkDB((await createAdminClient().from("ai_conversations").update({ status: parsed.data.status }).eq("id", parsed.data.id)).error);
    return aiJson({ ok: true });
  } catch (error) { return aiFailure(error); }
}
export async function POST(request: Request) {
  try {
    await requireAIAdmin(request, true);
    const parsed = z.object({ id: z.string().uuid(), message: z.string().trim().min(1).max(1800) }).strict().safeParse(await readBody(request));
    if (!parsed.success) throw new AIError("Mensaje inválido; máximo 1.800 caracteres.", 400);
    const conversation = await findConversation(parsed.data.id);
    if (conversation.status !== "human") throw new AIError("Tomá el control de la conversación antes de responder.", 409);
    const db = createAdminClient();
    const last = await db.from("ai_messages").select("created_at").eq("conversation_id", conversation.id).eq("role", "user").order("created_at", { ascending: false }).limit(1).maybeSingle();
    checkDB(last.error);
    if (!last.data || Date.now() - Date.parse(last.data.created_at) >= 24 * 3600_000) throw new AIError("La ventana de respuesta de 24 horas de Meta cerró. Esperá un nuevo mensaje del cliente.", 422);
    const inserted = await db.from("ai_messages").insert({ conversation_id: conversation.id, role: "human", content: parsed.data.message, status: "pending" }).select("id").single();
    checkDB(inserted.error);
    try {
      const externalId = await sendMetaMessage(conversation.channel, conversation.account_id, conversation.participant_id, parsed.data.message);
      checkDB((await db.from("ai_messages").update({ status: "sent", external_id: externalId }).eq("id", inserted.data!.id)).error);
    } catch (error) {
      checkDB((await db.from("ai_messages").update({ status: "failed" }).eq("id", inserted.data!.id)).error);
      throw error;
    }
    checkDB((await db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id)).error);
    return aiJson({ ok: true });
  } catch (error) { return aiFailure(error); }
}
