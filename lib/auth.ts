import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "opm_admin";

/** Token stored in the admin cookie — derived from password + secret. */
export function expectedAdminToken(): string {
  const secret = process.env.ADMIN_SECRET || "dev-secret";
  const password = process.env.ADMIN_PASSWORD || "admin";
  return createHmac("sha256", secret).update(password).digest("hex");
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || input.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(input), Buffer.from(expected));
}

export function isAdminAuthed(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const expected = expectedAdminToken();
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
