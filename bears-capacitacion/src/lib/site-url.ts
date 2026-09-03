import "server-only";

export function getConfiguredSiteUrl() {
  const configuredUrl = process.env.SITE_URL;
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    const allowsHttp = process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !allowsHttp) return null;
    return url.origin;
  } catch {
    return null;
  }
}