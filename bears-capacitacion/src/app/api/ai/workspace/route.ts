import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeKnowledge, getBotContext } from "@/lib/ai/data";
import { AIError, aiFailure, aiJson, checkDB, readBody, requireAIAdmin } from "@/lib/ai/http";
import { getConnection, metaReady } from "@/lib/ai/meta";
import { knowledgeSchema, settingsSchema } from "@/lib/ai/validation";
import type { AIWorkspaceData } from "@/lib/ai/types";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireAIAdmin(request);
    const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
    if (![7, 30, 90].includes(days)) throw new AIError("Seleccioná un período de 7, 30 o 90 días.", 400);
    const db = createAdminClient();
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const [context, connection, conversations, assets, metrics] = await Promise.all([
      getBotContext(), getConnection(),
      db.from("ai_conversations").select("*").gte("updated_at", since).order("updated_at", { ascending: false }).limit(100),
      db.from("ai_social_assets").select("*").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(100),
      db.rpc("ai_metrics", { p_since: since }),
    ]);
    for (const result of [conversations, assets, metrics]) checkDB(result.error);
    const output: AIWorkspaceData = {
      ...context, connection: connection ? {
        pageName: connection.page_name, pageId: connection.page_id, instagramId: connection.instagram_id, connectedAt: connection.connected_at,
      } : null,
      readiness: { openai: Boolean(process.env.OPENAI_API_KEY), meta: metaReady() },
      conversations: conversations.data ?? [], assets: assets.data ?? [], metrics: metrics.data, period: days,
    };
    return aiJson(output);
  } catch (error) { return aiFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    await requireAIAdmin(request, true);
    const parsed = z.object({ settings: settingsSchema }).strict().safeParse(await readBody(request));
    if (!parsed.success) throw new AIError(parsed.error.issues[0]?.message ?? "Configuración inválida.", 400);
    if (parsed.data.settings.enabled) {
      if (!process.env.OPENAI_API_KEY || !metaReady() || !await getConnection()) throw new AIError("Configurá OpenAI y conectá Meta antes de activar el bot.", 422);
      if (!activeKnowledge((await getBotContext()).knowledge).length) throw new AIError("Cargá información vigente antes de activar el bot.", 422);
    }
    checkDB((await createAdminClient().from("ai_settings").upsert({ id: true, settings: parsed.data.settings, updated_at: new Date().toISOString() })).error);
    return aiJson({ ok: true });
  } catch (error) { return aiFailure(error); }
}
export async function POST(request: Request) {
  try {
    await requireAIAdmin(request, true);
    const parsed = z.object({ entry: knowledgeSchema }).strict().safeParse(await readBody(request));
    if (!parsed.success) throw new AIError(parsed.error.issues[0]?.message ?? "Ficha inválida.", 400);
    const entry = parsed.data.entry;
    const context = await getBotContext();
    if (entry.franchiseId && !context.franchises.some((local) => local.id === entry.franchiseId)) throw new AIError("El local seleccionado no existe.", 422);
    const existing = context.knowledge.find((item) => item.id === entry.id);
    if (entry.id && !existing) throw new AIError("La ficha ya no existe. Actualizá el panel.", 404);
    if (!existing && context.knowledge.length >= 100) throw new AIError("Se admiten hasta 100 fichas. Editá una existente o eliminá las que no uses.", 422);
    const next = [...context.knowledge.filter((item) => item.id !== entry.id), entry];
    if (JSON.stringify(next).length > 100_000) throw new AIError("La base admite hasta 100.000 caracteres incluyendo títulos y enlaces.", 422);
    const db = createAdminClient();
    const values = {
      title: entry.title, content: entry.content, category: entry.category, franchise_id: entry.franchiseId,
      url: entry.url, enabled: entry.enabled, valid_from: entry.validFrom, valid_until: entry.validUntil, updated_at: new Date().toISOString(),
    };
    const result = entry.id ? await db.from("ai_knowledge").update(values).eq("id", entry.id) : await db.from("ai_knowledge").insert(values);
    checkDB(result.error);
    return aiJson({ ok: true });
  } catch (error) { return aiFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    await requireAIAdmin(request, true);
    const parsed = z.object({ id: z.string().uuid() }).strict().safeParse(await readBody(request));
    if (!parsed.success) throw new AIError("Identificador de ficha inválido.", 400);
    checkDB((await createAdminClient().from("ai_knowledge").delete().eq("id", parsed.data.id)).error);
    return aiJson({ ok: true });
  } catch (error) { return aiFailure(error); }
}
