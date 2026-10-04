"use client";

import { useEffect, useRef, useState } from "react";
import { mergeRanges, type WatchedRange } from "@/lib/video-ranges";
import { saveVideoProgress, startVideoProgress } from "@/lib/video-progress-client";

type YouTubePlayer = {
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  getPlaybackRate: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
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
      onError: (event: { data: number }) => void;
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
    document.getElementById("youtube-iframe-api")?.remove();
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
  const replayRef = useRef<(() => void) | null>(null);
  const onCompletedRef = useRef(onCompleted);
  const initialProgressRef = useRef({ initialPosition, initialRanges, initiallyCompleted });
  initialProgressRef.current = { initialPosition, initialRanges, initiallyCompleted };
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    let player: YouTubePlayer | null = null;
    let playerReady = false;
    let disposed = false;
    const { initialPosition, initialRanges, initiallyCompleted } = initialProgressRef.current;
    let ranges = initialRanges;
    let lastObserved = initialPosition;
    let lastObservedAt = Date.now();
    let playing = false;
    let pending = false;
    let completionReported = initiallyCompleted;
    const container = playerElementRef.current;
    if (!container) return;
    // YouTube replaces its target with an iframe; React must retain ownership of the container.
    const target = document.createElement("div");
    container.appendChild(target);
    setIsReady(false);
    setError(null);
    replayRef.current = () => {
      player?.seekTo(0, true);
      lastObserved = 0;
      lastObservedAt = Date.now();
      player?.playVideo();
    };

    const currentPosition = () => {
      if (!playerReady) return null;
      const position = player?.getCurrentTime();
      return typeof position === "number" && Number.isFinite(position) ? position : null;
    };
    const recordProgress = () => {
      if (!playing || document.visibilityState !== "visible") return;
      const position = currentPosition();
      if (position === null) return;
      const elapsed = position - lastObserved;
      const now = Date.now();
      const maxElapsed = Math.min(20, ((now - lastObservedAt) / 1000) * (player?.getPlaybackRate() ?? 1) + 1);
      if (elapsed > 0 && elapsed <= maxElapsed) {
        ranges = mergeRanges([...ranges, [lastObserved, position]]);
      }
      lastObserved = position;
      lastObservedAt = now;
    };
    const flush = async () => {
      if (pending || ranges.length === 0) return;
      pending = true;
      try {
        const completed = await saveVideoProgress({
          assetId,
          lastPosition: Math.floor(currentPosition() ?? lastObserved),
          watchedRanges: ranges,
        });
        if (completed && !completionReported && !disposed) {
          completionReported = true;
          onCompletedRef.current?.();
        }
      } finally {
        pending = false;
      }
    };
    const pauseTracking = () => {
      recordProgress();
      playing = false;
      void flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") pauseTracking();
      else {
        const position = currentPosition();
        if (position !== null) lastObserved = position;
        lastObservedAt = Date.now();
        playing = playerReady && player?.getPlayerState() === 1;
      }
    };
    const sampling = window.setInterval(recordProgress, 1_000);
    const heartbeat = window.setInterval(() => { void flush(); }, 15_000);
    const unavailableTimeout = window.setTimeout(() => {
      if (!disposed) setError("YouTube está tardando en cargar. Revisá tu conexión o si el navegador bloquea YouTube.");
    }, 20_000);

    document.addEventListener("visibilitychange", onVisibilityChange);
    void loadYouTubeIframeApi().then((api) => {
      if (disposed) return;
      player = new api.Player(target, {
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
            if (disposed) return;
            playerReady = true;
            window.clearTimeout(unavailableTimeout);
            setIsReady(true);
            setError(null);
            const iframe = player?.getIframe();
            iframe?.setAttribute("title", "Video de YouTube");
            iframe?.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
            iframe?.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
            iframe?.setAttribute("allowfullscreen", "");
            if (initialPosition > 0 && !initiallyCompleted) player?.seekTo(initialPosition, true);
          },
          onStateChange: (event) => {
            if (disposed) return;
            if (event.data === 1) {
              playing = true;
              const position = currentPosition();
              if (position !== null) lastObserved = position;
              lastObservedAt = Date.now();
              void startVideoProgress(assetId);
            } else pauseTracking();
          },
          onError: (event) => {
            if (disposed) return;
            window.clearTimeout(unavailableTimeout);
            pauseTracking();
            replayRef.current = null;
            setError(event.data === 100
              ? "El video fue eliminado o es privado. Configuralo como No listado en YouTube."
              : [101, 150].includes(event.data)
                ? "Este video no permite reproducción integrada. Habilitá Permitir inserción en YouTube."
                : "No pudimos reproducir este video de YouTube. Revisá el enlace, los permisos y las restricciones del video.");
          },
        },
      });
    }).catch((error: unknown) => {
      if (disposed) return;
      window.clearTimeout(unavailableTimeout);
      setError(error instanceof Error ? error.message : "No pudimos cargar el reproductor de YouTube.");
    });

    return () => {
      disposed = true;
      replayRef.current = null;
      window.clearInterval(sampling);
      window.clearInterval(heartbeat);
      window.clearTimeout(unavailableTimeout);
      recordProgress();
      void flush();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      player?.destroy();
      container.replaceChildren();
    };
  }, [assetId, durationSeconds, videoId]);

  return { playerElementRef, isReady, error, replayVideo: () => replayRef.current?.() };
}