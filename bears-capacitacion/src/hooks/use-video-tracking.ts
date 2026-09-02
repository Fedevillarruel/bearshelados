"use client";

import { useEffect, useRef } from "react";
import { mergeRanges, type WatchedRange, watchedSeconds } from "@/lib/video-ranges";

type VideoTrackingOptions = {
  assetId: string;
  durationSeconds: number;
  initialPosition?: number;
  initialRanges?: WatchedRange[];
};

export function useVideoTracking({
  assetId,
  durationSeconds,
  initialPosition = 0,
  initialRanges = [],
}: VideoTrackingOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rangesRef = useRef<WatchedRange[]>(initialRanges);
  const lastObservedRef = useRef(initialPosition);
  const playingRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const recordProgress = () => {
      if (!playingRef.current || document.visibilityState !== "visible") return;
      const currentPosition = video.currentTime;
      const previousPosition = lastObservedRef.current;
      const elapsed = currentPosition - previousPosition;

      // A normal heartbeat is roughly 15 seconds. Larger jumps come from seeking.
      if (elapsed > 0 && elapsed <= 20) {
        rangesRef.current = mergeRanges([...rangesRef.current, [previousPosition, currentPosition]]);
      }
      lastObservedRef.current = currentPosition;
    };

    const flush = async () => {
      if (pendingRef.current || rangesRef.current.length === 0) return;
      pendingRef.current = true;
      try {
        await fetch("/api/video-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId,
            lastPosition: Math.floor(video.currentTime),
            watchedRanges: rangesRef.current,
          }),
          keepalive: true,
        });
      } finally {
        pendingRef.current = false;
      }
    };

    const onPlay = () => {
      playingRef.current = true;
      lastObservedRef.current = video.currentTime;
    };
    const onPause = () => {
      recordProgress();
      playingRef.current = false;
      void flush();
    };
    const onSeeking = () => {
      lastObservedRef.current = video.currentTime;
    };
    const onEnded = () => {
      recordProgress();
      rangesRef.current = mergeRanges([...rangesRef.current, [Math.max(0, durationSeconds - 1), durationSeconds]]);
      playingRef.current = false;
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") onPause();
      else lastObservedRef.current = video.currentTime;
    };

    const heartbeat = window.setInterval(() => {
      recordProgress();
      void flush();
    }, 15_000);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(heartbeat);
      recordProgress();
      void flush();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [assetId, durationSeconds]);

  return {
    videoRef,
    getProgressPercent: () => Math.min(100, (watchedSeconds(rangesRef.current) / durationSeconds) * 100),
  };
}