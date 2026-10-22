import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMeta } from "@/lib/metadata";
import { readSessionId, newSessionId, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called once on page load, before any interaction.
 * Creates (or refreshes) an anonymous Visit row holding whatever metadata we
 * can read without the user doing anything: IP, geo, device, referrer…
 */
export async function POST(req: NextRequest) {
  const meta = getMeta(req);
  let sessionId = readSessionId(req);
  if (!sessionId) sessionId = newSessionId();

  try {
    await prisma.visit.upsert({
      where: { sessionId },
      update: { lastSeenAt: new Date() },
      create: {
        sessionId,
        ip: meta.ip,
        city: meta.city,
        region: meta.region,
        country: meta.country,
        userAgent: meta.userAgent,
        device: meta.device,
        os: meta.os,
        browser: meta.browser,
        language: meta.language,
        referrer: meta.referrer,
        landingUrl: meta.landingUrl,
      },
    });

    const res = NextResponse.json({ ok: true, sessionId, meta });
    if (req.cookies.get(SESSION_COOKIE)?.value !== sessionId) {
      res.cookies.set({ ...sessionCookieOptions(), value: sessionId });
    }
    return res;
  } catch (error) {
    console.error("Visit error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Database connection error" },
      { status: 500 }
    );
  }
}
