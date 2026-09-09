"use client";

import { useEffect, useRef, useState } from "react";
import { mergeRanges, type WatchedRange } from "@/lib/video-ranges";
import { saveVideoProgress, startVideoProgress } from "@/lib/video-progress-client";

type YouTubePlayer = {
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YouTubeApi = {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    host: string;
    width: string;
    height: string;
    playerVars: Record<string, number | string>;
    events: {
      onReady: () => void;
      onStateChange: (event: { data: number }) => void;
      onError: () => void;
    };
  }) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youTubeApiPromise) return youTubeApiPromise;

  youTubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const resolveApi = () => {
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube no pudo iniciar el reproductor."));
    };
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolveApi();
    };

    const existingScript = document.getElementById("youtube-iframe-api") as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("error", () => reject(new Error("YouTube no pudo cargar el reproductor.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTube no pudo cargar el reproductor."));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    youTubeApiPromise = null;
    throw error;
  });

  return youTubeApiPromise;
}

type YouTubeVideoTrackingOptions = {
  assetId: string;
  videoId: string;
  durationSeconds: number;
  initialPosition?: number;
  initialRanges?: WatchedRange[];
  initiallyCompleted?: boolean;
  onCompleted?: () => void;
};

export function useYouTubeVideoTracking({
  assetId,
  videoId,
  durationSeconds,
  initialPosition = 0,
  initialRanges = [],
  initiallyCompleted = false,
  onCompleted,
}: YouTubeVideoTrackingOptions) {
  const playerElementRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const rangesRef = useRef<WatchedRange[]>(initialRanges);
  const lastObservedRef = useRef(initialPosition);
  const playingRef = useRef(false);
  const pendingRef = useRef(false);
  const completionReportedRef = useRef(initiallyCompleted);
  const onCompletedRef = useRef(onCompleted);
  const [isReady, setIsReady] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    let player: YouTubePlayer | null = null;
    let disposed = false;
    setIsReady(false);
    setIsUnavailable(false);

    const currentPosition = () => {
      const position = playerRef.current?.getCurrentTime();
      return typeof position === "number" && Number.isFinite(position) ? position : null;
    };
    const recordProgress = () => {
      if (!playingRef.current || document.visibilityState !== "visible") return;
      const position = currentPosition();
      if (position === null) return;
      const elapsed = position - lastObservedRef.current;
      if (elapsed > 0 && elapsed <= 20) {
        rangesRef.current = mergeRanges([...rangesRef.current, [lastObservedRef.current, position]]);
      }
      lastObservedRef.current = position;
    };
    const flush = async () => {
      if (pendingRef.current || rangesRef.current.length === 0) return;
      pendingRef.current = true;
      try {
        const completed = await saveVideoProgress({
          assetId,
          lastPosition: Math.floor(currentPosition() ?? lastObservedRef.current),
          watchedRanges: rangesRef.current,
        });
        if (completed && !completionReportedRef.current) {
          completionReportedRef.current = true;
          onCompletedRef.current?.();
        }
      } finally {
        pendingRef.current = false;
      }
    };
    const pauseTracking = () => {
      recordProgress();
      playingRef.current = false;
      void flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") pauseTracking();
      else {
        const position = currentPosition();
        if (position !== null) lastObservedRef.current = position;
      }
    };
    const heartbeat = window.setInterval(() => {
      recordProgress();
      void flush();
    }, 15_000);
    const unavailableTimeout = window.setTimeout(() => {
      if (!disposed) setIsUnavailable(true);
    }, 10_000);

    document.addEventListener("visibilitychange", onVisibilityChange);
    void loadYouTubeIframeApi().then((api) => {
      if (disposed || !playerElementRef.current) return;
      player = new api.Player(playerElementRef.current, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 1,
          enablejsapi: 1,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            playerRef.current = player;
            window.clearTimeout(unavailableTimeout);
            setIsReady(true);
            const iframe = player?.getIframe();
            iframe?.setAttribute("title", "Video de YouTube");
            iframe?.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
            iframe?.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
            iframe?.setAttribute("allowfullscreen", "");
            if (initialPosition > 0 && !initiallyCompleted) player?.seekTo(initialPosition, true);
          },
          onStateChange: (event) => {
            if (event.data === 1) {
              playingRef.current = true;
              const position = currentPosition();
              if (position !== null) lastObservedRef.current = position;
              void startVideoProgress(assetId);
            } else if (event.data === 2) {
              pauseTracking();
            } else if (event.data === 0) {
              recordProgress();
              rangesRef.current = mergeRanges([...rangesRef.current, [Math.max(0, durationSeconds - 1), durationSeconds]]);
              playingRef.current = false;
              void flush();
            }
          },
          onError: () => {
            window.clearTimeout(unavailableTimeout);
            playerRef.current = null;
            player?.destroy();
            setIsUnavailable(true);
          },
        },
      });
    }).catch(() => {
      window.clearTimeout(unavailableTimeout);
      setIsUnavailable(true);
    });

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      window.clearTimeout(unavailableTimeout);
      recordProgress();
      void flush();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      playerRef.current = null;
      player?.destroy();
    };
  }, [assetId, durationSeconds, initialPosition, initiallyCompleted, videoId]);

  return { playerElementRef, isReady, isUnavailable };
}