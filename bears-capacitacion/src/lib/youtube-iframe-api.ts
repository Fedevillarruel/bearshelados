"use client";

export type YouTubePlayer = {
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getPlaybackRate: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
};

export type YouTubeApi = {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    host: string;
    width: string;
    height: string;
    playerVars: Record<string, number | string>;
    events: {
      onReady: () => void;
      onStateChange?: (event: { data: number }) => void;
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

export function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youTubeApiPromise) return youTubeApiPromise;

  youTubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube no pudo iniciar el reproductor."));
    };
    const existingScript = document.getElementById("youtube-iframe-api");
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
