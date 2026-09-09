const youtubeHosts = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
]);

const youtubeVideoId = /^[A-Za-z0-9_-]{11}$/;

function getYouTubeHostname(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return hostname === "youtu.be" || youtubeHosts.has(hostname) ? { url, hostname } : null;
}

function getYouTubeVideoIdFromUrl(url: URL, hostname: string, depth = 0): string | null {
  let candidate: string | null = null;

  if (hostname === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v") ?? url.searchParams.get("vi");
  } else if (url.pathname === "/attribution_link" && depth === 0) {
    const target = url.searchParams.get("u") ?? url.searchParams.get("q");
    if (target) {
      const nestedUrl = target.startsWith("/") ? `https://www.youtube.com${target}` : target;
      const nested = getYouTubeHostname(nestedUrl);
      if (nested) return getYouTubeVideoIdFromUrl(nested.url, nested.hostname, depth + 1);
    }
  } else {
    const [kind, videoId] = url.pathname.split("/").filter(Boolean);
    if (["e", "embed", "live", "shorts", "v", "watch"].includes(kind?.toLowerCase() ?? "")) candidate = videoId ?? null;
  }

  return candidate && youtubeVideoId.test(candidate) ? candidate : null;
}

export function isYouTubeUrl(value: string) {
  return Boolean(getYouTubeHostname(value));
}

export function getYouTubeVideoId(value: string) {
  const youtubeUrl = getYouTubeHostname(value);
  if (!youtubeUrl) return null;

  return getYouTubeVideoIdFromUrl(youtubeUrl.url, youtubeUrl.hostname);
}

export function getYouTubeEmbedUrl(videoId: string) {
  if (!youtubeVideoId.test(videoId)) return null;
  const parameters = new URLSearchParams({
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${parameters}`;
}