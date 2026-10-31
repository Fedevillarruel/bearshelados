import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIError, aiFailure, aiJson, checkDB, readBody, requireAIAdmin } from "@/lib/ai/http";
import { generateReply } from "@/lib/ai/openai";
import { historySchema } from "@/lib/ai/validation";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const viewer = await requireAIAdmin(request, true);
    const parsed = z.object({ message: z.string().trim().min(1).max(4000), history: historySchema }).strict().safeParse(await readBody(request));
    if (!parsed.success) throw new AIError("Mensaje inválido. Usá hasta 4.000 caracteres y 20 mensajes de historial.", 400);
    const reserved = await createAdminClient().rpc("ai_reserve_preview", { p_user: viewer.id });
    checkDB(reserved.error);
    if (!reserved.data) throw new AIError("Alcanzaste las 30 pruebas por hora. Reintentá más tarde.", 429);
    return aiJson(await generateReply(parsed.data.message, parsed.data.history, !parsed.data.history.length));
  } catch (error) { return aiFailure(error); }
}
