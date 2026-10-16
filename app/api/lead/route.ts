import { NextRequest, NextResponse } from "next/server";
import { getMeta } from "@/lib/metadata";
import { readSessionId } from "@/lib/session";
import { applyLeadUpdate, TRACKED_FIELDS, type TrackedField } from "@/lib/leadEngine";
import { checkWorkEmail, REASON_MESSAGE } from "@/lib/workEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validPhone(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length >= 7 && d.length <= 15;
}

/**
 * Single endpoint for every lead write:
 *  - autosave while typing  -> { fields: { email: "..." } }
 *  - beacon flush on unload -> { fields: { email, name, phone, description } }
 *  - final submit           -> { fields: {...}, submit: true }
 */
export async function POST(req: NextRequest) {
  const meta = getMeta(req);

  // SendBeacon may post as text/plain, so read raw text then parse.
  let body: any = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionId: string | undefined = body.sessionId || readSessionId(req) || undefined;
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session. Reload the page." }, { status: 400 });
  }

  // Normalise into a { field: value } map.
  const fields: Partial<Record<TrackedField, string>> = {};
  if (body.fields && typeof body.fields === "object") {
    for (const f of TRACKED_FIELDS) {
      if (typeof body.fields[f] === "string") fields[f] = body.fields[f];
    }
  }
  if (typeof body.field === "string" && typeof body.value === "string") {
    if ((TRACKED_FIELDS as readonly string[]).includes(body.field)) {
      fields[body.field as TrackedField] = body.value;
    }
  }

  const submit = body.submit === true;

  // Server-side validation on real submit.
  if (submit) {
    const email = (fields.email ?? "").trim();
    const name = (fields.name ?? "").trim();
    const phone = (fields.phone ?? "").trim();
    const check = checkWorkEmail(email);
    if (!check.ok) {
      return NextResponse.json(
        { error: REASON_MESSAGE[check.reason] || "Please check your email.", field: "email" },
        { status: 400 },
      );
    }
    if (!name) return NextResponse.json({ error: "Please enter your name.", field: "name" }, { status: 400 });
    if (!validPhone(phone)) {
      return NextResponse.json({ error: "Please enter a valid phone number.", field: "phone" }, { status: 400 });
    }
  }

  const result = await applyLeadUpdate({
    sessionId,
    fields,
    submit,
    consent: body.consent === true,
    source: submit ? "submit" : body.source === "beacon" ? "beacon" : "autosave",
    meta,
  });

  return NextResponse.json({
    ...result,
    message:
      submit && result.status === "submitted"
        ? "Your demo request is saved."
        : result.emailAccepted
          ? "Saved. You can keep editing before you submit."
          : result.rejectReason
            ? REASON_MESSAGE[result.rejectReason] || "Please check your email."
            : "Saving your details…",
  });
}
