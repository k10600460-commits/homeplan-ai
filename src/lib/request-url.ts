export function requestOriginFromHeaders(headers: Headers, fallbackUrl?: string): string {
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim();
  if (host) {
    const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  if (fallbackUrl) return new URL(fallbackUrl).origin;
  return "https://splanai.com";
}

export function requestOrigin(req: Request): string {
  return requestOriginFromHeaders(req.headers, req.url);
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/$/, "")}/`).toString();
}
