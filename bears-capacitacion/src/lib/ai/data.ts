import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultBotSettings, type KnowledgeEntry } from "./types";
import { settingsSchema } from "./validation";
import { AIError, checkDB } from "./http";

export async function getBotContext() {
  const db = createAdminClient();
  const [settings, knowledge, franchises] = await Promise.all([
    db.from("ai_settings").select("settings").eq("id", true).maybeSingle(),
    db.from("ai_knowledge").select("*").order("title").limit(101),
    db.from("franchises").select("id,name").order("name").limit(1000),
  ]);
  for (const result of [settings, knowledge, franchises]) checkDB(result.error);
  const parsed = settingsSchema.safeParse(settings.data?.settings ?? defaultBotSettings);
  if (!parsed.success) throw new AIError("La configuración guardada de IA no es válida.", 422);
  const entries: KnowledgeEntry[] = (knowledge.data ?? []).map((entry) => ({
    id: entry.id, title: entry.title, content: entry.content, category: entry.category,
    franchiseId: entry.franchise_id, url: entry.url, enabled: entry.enabled,
    validFrom: entry.valid_from, validUntil: entry.valid_until,
  }));
  if (entries.length > 100) throw new AIError("La base admite hasta 100 fichas de conocimiento.", 422);
  return { settings: parsed.data, knowledge: entries, franchises: franchises.data ?? [] };
}
export function activeKnowledge(entries: KnowledgeEntry[], today = new Date().toISOString().slice(0, 10)) {
  return entries.filter((entry) => entry.enabled && (!entry.validFrom || entry.validFrom <= today) && (!entry.validUntil || entry.validUntil >= today));
}
