"use client";

import { ExternalLink, PlayCircle } from "lucide-react";
import { useYouTubeVideoTracking } from "@/hooks/use-youtube-video-tracking";
import type { EmployeeAsset } from "@/lib/platform/employee";

export function YouTubeVideo({ asset, videoId, onCompleted }: {
  asset: EmployeeAsset;
  videoId: string;
  onCompleted?: () => void;
}) {
  const { playerElementRef, isReady, error } = useYouTubeVideoTracking({
    assetId: asset.id,
    videoId,
    durationSeconds: asset.duration_seconds,
    initialPosition: asset.progress?.last_position ?? 0,
    initialRanges: asset.progress?.watched_ranges ?? [],
    initiallyCompleted: asset.isCompleted,
    onCompleted,
  });

  return (
    <section className="overflow-hidden bg-ink">
      <div className="relative aspect-video w-full">
        <div ref={playerElementRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
        {!isReady || error ? (
          <div className="absolute inset-0 grid place-items-center bg-ink px-5 text-center text-sm text-white/80" role={error ? "alert" : "status"}>
            {error ?? "Preparando video de YouTube..."}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-white/15 px-4 py-3 text-sm text-white/80">
        <span className="flex min-w-0 items-center gap-2"><PlayCircle className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{asset.title}</span></span>
        <span className="font-tabular shrink-0">{asset.isCompleted ? "Completado" : `${Math.max(1, Math.ceil(asset.duration_seconds / 60))} min`}</span>
      </div>
      {error ? (
        <div className="border-t border-white/15 px-4 py-3 text-center text-sm text-white/80">
          <p>Verlo fuera de la plataforma no registra el avance del módulo.</p>
          <a className="mt-2 inline-flex items-center gap-2 font-medium text-white hover:underline" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" aria-hidden="true" />Abrir en YouTube</a>
        </div>
      ) : null}
    </section>
  );
}
