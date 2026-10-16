import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "opm_sid";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function readSessionId(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
