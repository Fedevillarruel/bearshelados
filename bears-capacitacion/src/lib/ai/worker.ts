import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBotContext } from "./data";
import { AIError, checkDB } from "./http";
import { sendMetaMessage } from "./meta";
import { generateReply } from "./openai";

export async function processAIJobs(limit = 10) {
  const db = createAdminClient();
  const started = Date.now();
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < limit; index++) {
    if (Date.now() - started > 180_000) break;
    const claimed = await db.rpc("ai_claim_job");
    checkDB(claimed.error);
    const job = claimed.data?.[0];
    if (!job) break;
    let outgoingId: string | null = null;
    let replyPersisted = false;
    try {
      const [conversation, incoming, context] = await Promise.all([
        db.from("ai_conversations").select("*").eq("id", job.conversation_id).single(),
        db.from("ai_messages").select("*").eq("id", job.message_id).single(),
        getBotContext(),
      ]);
      checkDB(conversation.error); checkDB(incoming.error);
      const chat = conversation.data!;
      const message = incoming.data!;
      if (!context.settings.enabled || chat.status === "human" || Date.now() - Date.parse(message.created_at) >= 24 * 3600_000) {
        checkDB((await db.from("ai_jobs").update({ status: "done", locked_until: null }).eq("id", job.id)).error);
        processed++;
        continue;
      }
      // A reclaimed job must never send a second time after an ambiguous timeout.
      const prior = await db.from("ai_messages").select("id,status").eq("job_id", job.id).maybeSingle();
      checkDB(prior.error);
      if (prior.data?.status === "sent") {
        checkDB((await db.from("ai_jobs").update({ status: "done", locked_until: null }).eq("id", job.id)).error);
        processed++;
        continue;
      }
      if (prior.data) throw new AIError("Envío previo sin confirmación; revisar en Meta antes de responder manualmente.", 409);
      const history = await db.from("ai_messages").select("role,content,created_at,status").eq("conversation_id", chat.id)
        .or(`role.neq.user,created_at.lt.${message.created_at}`).order("created_at", { ascending: false }).limit(20);
      checkDB(history.error);
      const messages = (history.data ?? []).filter((item) => item.role === "user" || item.status === "sent").reverse()
        .map((item) => ({ role: item.role === "user" ? "user" as const : "assistant" as const, content: item.content.slice(0, 4000) }));
      const disclose = !(history.data ?? []).some((item) => item.status === "sent" && Date.parse(item.created_at) > Date.now() - 24 * 3600_000);
      const answer = message.content.includes("[Adjunto recibido:")
        ? { reply: `${disclose ? "Soy el asistente virtual de Bears. " : ""}${context.settings.handoffMessage}`, handoff: true, topic: "otro" }
        : await generateReply(message.content, messages, disclose);
      const latest = await db.from("ai_conversations").select("status").eq("id", chat.id).single();
      checkDB(latest.error);
      const fresh = await getBotContext();
      if (latest.data!.status !== "bot" || !fresh.settings.enabled) {
        checkDB((await db.from("ai_jobs").update({ status: "done", locked_until: null }).eq("id", job.id)).error);
        processed++;
        continue;
      }
      const inserted = await db.from("ai_messages").insert({
        conversation_id: chat.id, job_id: job.id, role: "assistant",
        content: answer.reply, topic: answer.topic, status: "pending",
      }).select("id").single();
      checkDB(inserted.error);
      outgoingId = inserted.data!.id;
      const externalId = await sendMetaMessage(chat.channel, chat.account_id, chat.participant_id, answer.reply);
      checkDB((await db.from("ai_messages").update({ external_id: externalId, status: "sent" }).eq("id", outgoingId)).error);
      replyPersisted = true;
      checkDB((await db.from("ai_conversations").update({ ...(answer.handoff ? { status: "human" } : {}), updated_at: new Date().toISOString() }).eq("id", chat.id)).error);
      checkDB((await db.from("ai_jobs").update({ status: "done", locked_until: null, error: null }).eq("id", job.id)).error);
      processed++;
    } catch (error) {
      if (outgoingId && !replyPersisted) checkDB((await db.from("ai_messages").update({ status: "failed" }).eq("id", outgoingId)).error);
      const reason = error instanceof AIError ? error.message : "Falló el procesamiento del mensaje. Revisá configuración y servicios.";
      if (!outgoingId) {
        const prior = await db.from("ai_messages").select("id").eq("job_id", job.id).maybeSingle();
        checkDB(prior.error);
        if (!prior.data) checkDB((await db.from("ai_messages").insert({
          conversation_id: job.conversation_id, job_id: job.id, role: "assistant", content: reason, status: "failed",
        })).error);
      }
      checkDB((await db.from("ai_jobs").update({ status: "failed", locked_until: null, error: reason }).eq("id", job.id)).error);
      checkDB((await db.from("ai_conversations").update({ status: "human" }).eq("id", job.conversation_id)).error);
      failed++;
    }
  }
  return { processed, failed };
}
