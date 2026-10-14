"use client";

import { useEffect, useRef } from "react";
import { mergeRanges, type WatchedRange, watchedSeconds } from "@/lib/video-ranges";
import { saveVideoProgress, startVideoProgress } from "@/lib/video-progress-client";

type VideoTrackingOptions = {
  assetId: string;
  durationSeconds: number;
  initialPosition?: number;
  initialRanges?: WatchedRange[];
  initiallyCompleted?: boolean;
  readOnly?: boolean;
  onCompleted?: () => void;
};

export function useVideoTracking({
  assetId,
  durationSeconds,
  initialPosition = 0,
  initialRanges = [],
  initiallyCompleted = false,
  readOnly = false,
  onCompleted,
}: VideoTrackingOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rangesRef = useRef<WatchedRange[]>(initialRanges);
  const lastObservedRef = useRef(initialPosition);
  const playingRef = useRef(false);
  const pendingRef = useRef(false);
  const completionReportedRef = useRef(initiallyCompleted);
  const onCompletedRef = useRef(onCompleted);
  const resumeRef = useRef({ initialPosition, initiallyCompleted });
  resumeRef.current = { initialPosition, initiallyCompleted };

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let startRequest: Promise<boolean> | null = null;
    let flushRequested = false;
    const ensureStarted = () => {
      if (readOnly) return Promise.resolve(false);
      startRequest ??= startVideoProgress(assetId).then((started) => {
        if (!started) startRequest = null;
        return started;
      });
      return startRequest;
    };

    const onLoadedMetadata = () => {
      const { initialPosition, initiallyCompleted } = resumeRef.current;
      const position = initiallyCompleted || initialPosition >= video.duration
        ? 0
        : initialPosition;
      video.currentTime = position;
      lastObservedRef.current = position;
    };
    const recordProgress = () => {
      if (readOnly || !playingRef.current || document.visibilityState !== "visible") return;
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
      if (readOnly || rangesRef.current.length === 0) return;
      if (pendingRef.current) {
        flushRequested = true;
        return;
      }
      pendingRef.current = true;
      try {
        if (!await ensureStarted()) return;
        do {
          flushRequested = false;
          const completed = await saveVideoProgress({
            assetId,
            lastPosition: Math.floor(video.currentTime),
            watchedRanges: rangesRef.current,
          });
          if (completed && !completionReportedRef.current) {
            completionReportedRef.current = true;
            onCompletedRef.current?.();
          }
        } while (flushRequested);
      } finally {
        pendingRef.current = false;
      }
    };

    const startTracking = () => {
      void ensureStarted();
    };

    const onPlay = () => {
      playingRef.current = true;
      lastObservedRef.current = video.currentTime;
      startTracking();
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
      playingRef.current = false;
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") onPause();
      else {
        lastObservedRef.current = video.currentTime;
        playingRef.current = !video.paused && !video.ended;
      }
    };

    const heartbeat = window.setInterval(() => {
      recordProgress();
      void flush();
    }, 15_000);

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    if (video.readyState >= 1) onLoadedMetadata();
    video.addEventListener("play", onPlay);
    video.addEventListener("timeupdate", recordProgress);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(heartbeat);
      recordProgress();
      void flush();
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("timeupdate", recordProgress);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [assetId, durationSeconds, readOnly]);

  return {
    videoRef,
    getProgressPercent: () => Math.min(100, (watchedSeconds(rangesRef.current) / durationSeconds) * 100),
  };
}