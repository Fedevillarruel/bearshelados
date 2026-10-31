import { createHash } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIError, aiFailure, aiJson, checkDB } from "@/lib/ai/http";
import { getConnection, validSignature } from "@/lib/ai/meta";
import { incomingText, safeSocialUrl, webhookSchema } from "@/lib/ai/webhook";
import { processAIJobs } from "@/lib/ai/worker";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (!process.env.META_WEBHOOK_VERIFY_TOKEN || query.get("hub.mode") !== "subscribe" || query.get("hub.verify_token") !== process.env.META_WEBHOOK_VERIFY_TOKEN || !query.get("hub.challenge")) {
    return aiJson({ error: "Verificación no válida." }, 403);
  }
  return new Response(query.get("hub.challenge"), { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    if (!process.env.META_APP_SECRET) throw new AIError("Meta no está configurado.", 503);
    if (Number(request.headers.get("content-length")) > 1_000_000) throw new AIError("Notificación demasiado grande.", 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1_000_000) throw new AIError("Notificación demasiado grande.", 413);
    if (!validSignature(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) throw new AIError("Firma de Meta no válida.", 403);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new AIError("Notificación inválida.", 400); }
    const parsed = webhookSchema.safeParse(body);
    if (!parsed.success) throw new AIError("La notificación de Meta no cumple el formato esperado.", 400);
    const connection = await getConnection();
    if (!connection) return aiJson({ received: true });
    const db = createAdminClient();
    for (const entry of parsed.data.entry) {
      const channel = parsed.data.object === "instagram" ? "instagram" : parsed.data.object === "page" ? "messenger" : null;
      const account = channel === "instagram" ? connection.instagram_id : connection.page_id;
      if (!channel || !account || entry.id !== account) continue;
      for (const event of entry.messaging ?? []) {
        const message = event.message;
        if (!message?.mid || message.is_deleted || message.is_self) continue;
        if (message.is_echo || event.sender.id === account) {
          const existing = await db.from("ai_messages").select("id").eq("external_id", message.mid).maybeSingle();
          checkDB(existing.error);
          if (existing.data) continue;
          const conversation = await db.from("ai_conversations").select("id").eq("channel", channel).eq("account_id", account).eq("participant_id", event.recipient.id).maybeSingle();
          checkDB(conversation.error);
          if (!conversation.data) continue;
          // Meta may echo a send before our request has persisted its external ID.
          const pending = await db.from("ai_messages").select("id").eq("conversation_id", conversation.data.id).eq("status", "pending")
            .eq("content", message.text ?? "").gte("created_at", new Date(Date.now() - 180_000).toISOString()).limit(1).maybeSingle();
          checkDB(pending.error);
          if (pending.data) continue;
          checkDB((await db.from("ai_conversations").update({ status: "human", updated_at: new Date().toISOString() }).eq("id", conversation.data.id)).error);
          checkDB((await db.from("ai_messages").upsert({
            conversation_id: conversation.data.id, external_id: message.mid, role: "human",
            content: incomingText(message) || "[Mensaje enviado desde Meta]", status: "sent",
          }, { onConflict: "external_id", ignoreDuplicates: true })).error);
          continue;
        }
        if (event.recipient.id !== account || event.sender.id === account) continue;
        const content = incomingText(message);
        if (!content) continue;
        const timestamp = event.timestamp ?? (entry.time ? entry.time * 1000 : Number.NaN);
        if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > Date.now() + 300_000) throw new AIError("La fecha del mensaje de Meta no es válida.", 400);
        checkDB((await db.rpc("ai_record_incoming", {
          p_channel: channel, p_account: account, p_sender: event.sender.id,
          p_external: message.mid, p_content: content, p_time: new Date(timestamp).toISOString(),
        })).error);
        for (const [index, attachment] of (message.attachments ?? []).entries()) {
          if (attachment.type !== "story_mention") continue;
          checkDB((await db.from("ai_social_assets").upsert({
            id: `story:${message.mid}:${index}`, kind: "mencion_historia",
            text: message.text ?? "Bears fue mencionado en una historia.", url: safeSocialUrl(attachment.payload?.url),
            occurred_at: new Date(timestamp).toISOString(),
          }, { onConflict: "id", ignoreDuplicates: true })).error);
        }
      }
      for (const change of entry.changes ?? []) {
        if (!["mentions", "comments", "story_insights"].includes(change.field)) continue;
        const value = change.value;
        const hash = createHash("sha256").update(JSON.stringify(change)).digest("hex");
        checkDB((await db.from("ai_social_assets").upsert({
          id: `${change.field}:${hash}`, kind: change.field,
          text: typeof value.text === "string" ? value.text.slice(0, 4000) : `Actividad de ${change.field}: ${JSON.stringify(value).slice(0, 3000)}`,
          url: safeSocialUrl(value.permalink), occurred_at: new Date((entry.time ?? Date.now() / 1000) * 1000).toISOString(),
        }, { onConflict: "id", ignoreDuplicates: true })).error);
      }
    }
    after(async () => {
      try { await processAIJobs(1); } catch {
        console.error("AI worker: no pudimos procesar la cola después del webhook; revisar Supabase y el cron de IA.");
      }
    });
    return aiJson({ received: true });
  } catch (error) { return aiFailure(error); }
}
