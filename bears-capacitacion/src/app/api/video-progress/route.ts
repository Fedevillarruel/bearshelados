import { NextResponse } from "next/server";
import { z } from "zod";
import { mergeRanges, watchedSeconds } from "@/lib/video-ranges";
import { createClient } from "@/lib/supabase/server";

const payloadSchema = z.object({
  assetId: z.string().uuid(),
  lastPosition: z.number().int().nonnegative(),
  watchedRanges: z.array(z.tuple([z.number().nonnegative(), z.number().nonnegative()])).max(500),
});

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Progreso de video inválido." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const { data: asset } = await supabase.from("assets")
    .select("id, duration_seconds, type")
    .eq("id", parsed.data.assetId)
    .eq("type", "video")
    .single();
  if (!asset) return NextResponse.json({ error: "No tenés acceso a este video." }, { status: 403 });

  const duration = asset.duration_seconds;
  const safeClientRanges = parsed.data.watchedRanges.map(([start, end]) => [
    Math.min(start, duration), Math.min(end, duration),
  ] as [number, number]);
  const { data: current } = await supabase.from("video_progress")
    .select("watched_ranges")
    .eq("asset_id", asset.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const storedRanges = Array.isArray(current?.watched_ranges) ? current.watched_ranges as [number, number][] : [];
  const ranges = mergeRanges([...storedRanges, ...safeClientRanges]);
  const secondsWatched = watchedSeconds(ranges);
  const completed = secondsWatched >= duration * 0.9;
  const { error } = await supabase.from("video_progress").upsert({
    user_id: user.id,
    asset_id: asset.id,
    watched_ranges: ranges,
    seconds_watched: secondsWatched,
    last_position: Math.min(parsed.data.lastPosition, duration),
    total_seconds: duration,
    completed,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,asset_id" });

  if (error) return NextResponse.json({ error: "No pudimos guardar el progreso." }, { status: 500 });
  return NextResponse.json({ secondsWatched, completed });
}