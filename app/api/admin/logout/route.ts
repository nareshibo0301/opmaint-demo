import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: ADMIN_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
