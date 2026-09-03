import { NextResponse } from "next/server";
import { z } from "zod";
import { mergeRanges, watchedSeconds } from "@/lib/video-ranges";
import { getViewer } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { databaseUuid } from "@/lib/validations/ids";

const assetIdSchema = z.object({ assetId: databaseUuid });
const progressSchema = assetIdSchema.extend({
  event: z.literal("progress"),
  lastPosition: z.number().int().nonnegative(),
  watchedRanges: z.array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]).refine(([start, end]) => end >= start, "Un rango no puede terminar antes de empezar.")).max(120),
});
const payloadSchema = z.discriminatedUnion("event", [assetIdSchema.extend({ event: z.literal("start") }), progressSchema]);

function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return json({ error: "Origen de solicitud no permitido." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Progreso de video inválido." }, 400);
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Progreso de video inválido." }, 400);

  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sesión requerida." }, 401);
  const supabase = await createClient();
  const { data: asset } = await supabase.from("assets")
    .select("id, duration_seconds, type")
    .eq("id", parsed.data.assetId)
    .eq("type", "video")
    .single();
  if (!asset) return json({ error: "No tenés acceso a este video." }, 403);

  const duration = asset.duration_seconds;
  if (parsed.data.event === "start") {
    const { error } = await supabase.from("video_progress").upsert({
      user_id: viewer.id,
      asset_id: asset.id,
      total_seconds: duration,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,asset_id", ignoreDuplicates: true });
    if (error) return json({ error: "No pudimos iniciar el seguimiento del video." }, 500);
    return json({ started: true });
  }

  const safeClientRanges = parsed.data.watchedRanges.map(([start, end]) => [
    Math.min(start, duration), Math.min(end, duration),
  ] as [number, number]);
  const { data: current } = await supabase.from("video_progress")
    .select("watched_ranges, updated_at")
    .eq("asset_id", asset.id)
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (!current) return json({ error: "Iniciá la reproducción antes de guardar el avance." }, 409);

  const storedRanges = Array.isArray(current?.watched_ranges) ? current.watched_ranges as [number, number][] : [];
  const ranges = mergeRanges([...storedRanges, ...safeClientRanges]);
  const storedSeconds = watchedSeconds(storedRanges);
  const secondsWatched = watchedSeconds(ranges);
  const elapsedSeconds = Math.max(0, (Date.now() - new Date(current.updated_at).getTime()) / 1_000);
  const allowedAdvance = Math.min(45, Math.max(5, elapsedSeconds + 5));
  if (secondsWatched - storedSeconds > allowedAdvance) {
    return json({ error: "El avance informado no coincide con el tiempo de reproducción." }, 422);
  }
  const completed = secondsWatched >= duration * 0.9;
  const highestWatchedPosition = ranges.at(-1)?.[1] ?? 0;
  const { error } = await supabase.from("video_progress").upsert({
    user_id: viewer.id,
    asset_id: asset.id,
    watched_ranges: ranges,
    seconds_watched: secondsWatched,
    last_position: Math.min(parsed.data.lastPosition, highestWatchedPosition, duration),
    total_seconds: duration,
    completed,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,asset_id" });

  if (error) return json({ error: "No pudimos guardar el progreso." }, 500);
  return json({ secondsWatched, completed });
}