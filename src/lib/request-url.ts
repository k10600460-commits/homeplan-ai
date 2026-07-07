// Hosts we trust when deriving an absolute origin from request headers. Anything
// else (a forged Host / x-forwarded-host) falls back to the canonical site URL,
// which prevents host-header poisoning of Stripe return URLs, share links, and
// team-invite emails. Allows the apex, any *.splanai.com subdomain (us/au/nz/ca),
// Vercel preview hosts, and local dev.
const CANONICAL_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com").replace(/\/$/, "");
const ALLOWED_HOST_SUFFIXES = [".splanai.com", ".vercel.app"];

function isAllowedHost(host: string): boolean {
  const bare = host.split(":")[0].trim().toLowerCase();
  if (!bare) return false;
  if (bare === "localhost" || bare === "127.0.0.1") return true;
  if (bare === "splanai.com") return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => bare.endsWith(suffix));
}

export function requestOriginFromHeaders(headers: Headers, fallbackUrl?: string): string {
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim();
  if (host && isAllowedHost(host)) {
    const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : isLocal ? "http" : "https";
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  // Untrusted or missing host: only honor an explicit fallback if it is itself allowed.
  if (fallbackUrl) {
    try {
      const u = new URL(fallbackUrl);
      if (isAllowedHost(u.host)) return u.origin;
    } catch {
      /* malformed fallback — ignore */
    }
  }
  return CANONICAL_ORIGIN;
}

export function requestOrigin(req: Request): string {
  return requestOriginFromHeaders(req.headers, req.url);
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/$/, "")}/`).toString();
}
