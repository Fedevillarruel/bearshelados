"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, RotateCcw } from "lucide-react";
import { useVideoTracking } from "@/hooks/use-video-tracking";
import type { EmployeeAsset } from "@/lib/platform/employee";

export function NativeVideo({ asset, onCompleted }: {
  asset: EmployeeAsset;
  onCompleted?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { videoRef } = useVideoTracking({
    assetId: asset.id,
    durationSeconds: asset.duration_seconds,
    initialPosition: asset.progress?.last_position ?? 0,
    initialRanges: asset.progress?.watched_ranges ?? [],
    initiallyCompleted: asset.isCompleted,
    onCompleted,
  });

  async function replay() {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    try {
      video.currentTime = 0;
      await video.play();
    } catch {
      setError("No pudimos iniciar el video. Probá con el control de reproducción o recargá el video.");
    }
  }

  return (
    <section className="overflow-hidden bg-ink">
      <video
        ref={videoRef}
        src={asset.url}
        className="aspect-video w-full"
        controls
        preload="metadata"
        poster={asset.video_poster_url ?? undefined}
        onError={() => setError("No pudimos cargar el video. El enlace puede haber vencido o el archivo no estar disponible.")}
        onLoadedData={() => setError(null)}
      >
        Tu navegador no puede reproducir este video.
      </video>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/15 px-4 py-3 text-sm text-white/80">
        <span className="flex min-w-0 items-center gap-2"><PlayCircle className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{asset.title}</span></span>
        <span className="font-tabular">{asset.isCompleted ? "Completado" : `${Math.max(1, Math.ceil(asset.duration_seconds / 60))} min`}</span>
        <button className="inline-flex items-center gap-2 text-white hover:underline" type="button" onClick={replay}><RotateCcw className="size-4" aria-hidden="true" />Volver a ver</button>
      </div>
      {error ? <div className="border-t border-white/15 px-4 py-3 text-sm text-white" role="alert"><p>{error}</p><button className="mt-2 underline" type="button" onClick={() => { router.refresh(); videoRef.current?.load(); }}>Recargar video</button></div> : null}
    </section>
  );
}
