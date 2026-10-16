import type { NextRequest } from "next/server";

export interface VisitMeta {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  userAgent: string | null;
  device: string;
  os: string;
  browser: string;
  language: string | null;
  referrer: string | null;
  landingUrl: string | null;
}

/** Best-effort client IP. Vercel sets x-forwarded-for / x-real-ip. */
export function getIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

function parseUserAgent(ua: string | null): { device: string; os: string; browser: string } {
  if (!ua) return { device: "unknown", os: "unknown", browser: "unknown" };
  const u = ua.toLowerCase();

  const device = /mobile|iphone|android(?!.*tablet)/.test(u)
    ? "mobile"
    : /ipad|tablet/.test(u)
      ? "tablet"
      : "desktop";

  const os = /windows/.test(u)
    ? "Windows"
    : /mac os|macintosh/.test(u)
      ? "macOS"
      : /android/.test(u)
        ? "Android"
        : /iphone|ipad|ios/.test(u)
          ? "iOS"
          : /linux/.test(u)
            ? "Linux"
            : "unknown";

  const browser = /edg\//.test(u)
    ? "Edge"
    : /opr\/|opera/.test(u)
      ? "Opera"
      : /chrome\//.test(u)
        ? "Chrome"
        : /safari\//.test(u) && !/chrome/.test(u)
          ? "Safari"
          : /firefox\//.test(u)
            ? "Firefox"
            : "unknown";

  return { device, os, browser };
}

/**
 * Pull whatever metadata we can WITHOUT any user interaction.
 * Geo headers are populated by Vercel in production; locally they are null.
 */
export function getMeta(req: NextRequest): VisitMeta {
  const ua = req.headers.get("user-agent");
  const { device, os, browser } = parseUserAgent(ua);
  const url = req.nextUrl;

  return {
    ip: getIp(req),
    city: req.headers.get("x-vercel-ip-city"),
    region: req.headers.get("x-vercel-ip-country-region"),
    country: req.headers.get("x-vercel-ip-country"),
    userAgent: ua,
    device,
    os,
    browser,
    language: req.headers.get("accept-language")?.split(",")[0] ?? null,
    referrer: req.headers.get("referer"),
    landingUrl: url ? url.pathname + (url.search || "") : null,
  };
}
