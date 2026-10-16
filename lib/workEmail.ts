// Work-email gate: block personal/free mailbox providers and throwaway domains.
// Kept as plain lists so they are easy to extend without touching logic.

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk",
  "ymail.com", "hotmail.com", "hotmail.co.uk", "outlook.com", "outlook.in",
  "live.com", "live.in", "msn.com", "aol.com", "icloud.com", "me.com",
  "mac.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net",
  "mail.com", "zoho.com", "yandex.com", "yandex.ru", "rediffmail.com",
  "inbox.com", "fastmail.com", "tutanota.com", "tuta.io", "qq.com",
  "163.com", "126.com", "naver.com", "daum.net", "hanmail.net",
]);

const DISPOSABLE_HINTS = [
  "mailinator", "tempmail", "10minutemail", "guerrillamail", "throwaway",
  "trashmail", "yopmail", "sharklasers", "getnada", "dispostable",
  "fakeinbox", "maildrop", "temp-mail", "mohmal", "emailondeck",
];

export type EmailCheck =
  | { ok: true; domain: string }
  | { ok: false; reason: "invalid" | "free_email" | "disposable"; domain: string };

export function checkWorkEmail(email: string): EmailCheck {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return { ok: false, reason: "invalid", domain: "" };

  const domain = value.slice(at + 1);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { ok: false, reason: "invalid", domain };
  }
  if (DISPOSABLE_HINTS.some((h) => domain.includes(h))) {
    return { ok: false, reason: "disposable", domain };
  }
  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return { ok: false, reason: "free_email", domain };
  }
  return { ok: true, domain };
}

export function isWorkEmail(email: string): boolean {
  return checkWorkEmail(email).ok;
}

export const REASON_MESSAGE: Record<string, string> = {
  invalid: "Please enter a valid email address.",
  free_email: "Please use your work email (Gmail, Yahoo, Outlook… aren't accepted).",
  disposable: "Disposable email addresses aren't accepted. Please use your work email.",
};
