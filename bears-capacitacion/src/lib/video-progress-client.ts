"use client";

import type { WatchedRange } from "@/lib/video-ranges";

type VideoProgressInput = {
  assetId: string;
  lastPosition: number;
  watchedRanges: WatchedRange[];
};

export async function startVideoProgress(assetId: string) {
  try {
    const response = await fetch("/api/video-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "start", assetId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function saveVideoProgress({ assetId, lastPosition, watchedRanges }: VideoProgressInput) {
  try {
    const response = await fetch("/api/video-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "progress",
        assetId,
        lastPosition,
        watchedRanges,
      }),
      keepalive: true,
    });
    const result = await response.json().catch(() => null) as { completed?: boolean } | null;
    return response.ok && Boolean(result?.completed);
  } catch {
    return false;
  }
}