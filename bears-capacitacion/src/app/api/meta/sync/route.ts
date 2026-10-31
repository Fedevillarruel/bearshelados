import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIError, aiFailure, aiJson, checkDB, requireAIAdmin } from "@/lib/ai/http";
import { connectionToken, graph } from "@/lib/ai/meta";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireAIAdmin(request, true);
    const { connection, token } = await connectionToken();
    if (!connection.instagram_id) throw new AIError("La página no tiene Instagram vinculado.", 422);
    const [payload, facebook] = await Promise.all([
      graph(`${connection.instagram_id}/media`, token, { fields: "id,caption,permalink,timestamp,media_type", limit: "50" }),
      graph(`${connection.page_id}/published_posts`, token, { fields: "id,message,permalink_url,created_time", limit: "50" }),
    ]);
    const parsed = z.array(z.object({ id: z.string(), caption: z.string().optional(), permalink: z.string().url(), timestamp: z.string(), media_type: z.string() })).safeParse(payload.data);
    if (!parsed.success) throw new AIError("Meta no devolvió publicaciones válidas.", 502);
    const fbPosts = z.array(z.object({ id: z.string(), message: z.string().optional(), permalink_url: z.string().url(), created_time: z.string() })).safeParse(facebook.data);
    if (!fbPosts.success) throw new AIError("Meta no devolvió publicaciones de Facebook válidas.", 502);
    const posts = [...parsed.data.map((post) => ({
      id: `post:${post.id}`, kind: "publicacion", text: post.caption ?? `Publicación ${post.media_type}`, url: post.permalink, occurred_at: post.timestamp,
    })), ...fbPosts.data.map((post) => ({
      id: `fbpost:${post.id}`, kind: "publicacion_fb", text: post.message ?? "Publicación de Facebook", url: post.permalink_url, occurred_at: post.created_time,
    }))];
    if (posts.length) checkDB((await createAdminClient().from("ai_social_assets").upsert(posts)).error);
    return aiJson({ ok: true, count: posts.length });
  } catch (error) { return aiFailure(error); }
}
