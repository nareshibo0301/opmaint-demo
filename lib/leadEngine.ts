import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { checkWorkEmail } from "./workEmail";
import { enrichFromEmail } from "./enrich";
import type { VisitMeta } from "./metadata";

export const TRACKED_FIELDS = ["email", "name", "phone", "description"] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number];

export interface LeadUpdateInput {
  sessionId: string;
  fields: Partial<Record<TrackedField, string>>;
  /** Client-reported lead status at submit time ("submitted"), else null. */
  submit?: boolean;
  source?: string;
  /** Visitor allowed third-party enrichment (consent banner). */
  consent?: boolean;
  meta: VisitMeta;
}

export interface LeadUpdateResult {
  ok: boolean;
  leadId: string;
  status: string;
  rejectReason: string | null;
  emailAccepted: boolean;
  changed: TrackedField[];
}

/**
 * Apply an incoming update (autosave, beacon flush, or final submit).
 *
 * Core rule: the current value lives on Lead, but EVERY change is also appended
 * to LeadEvent. So "type A -> erase -> type B" produces three log rows and
 * nothing is ever overwritten.
 */
export async function applyLeadUpdate(input: LeadUpdateInput): Promise<LeadUpdateResult> {
  const { sessionId, fields, meta, submit = false, consent = false } = input;
  const source = input.source || (submit ? "submit" : "autosave");

  // 1. Visit should already exist (created on page load). Create a fallback if not.
  const visit = await prisma.visit.upsert({
    where: { sessionId },
    update: { lastSeenAt: new Date(), ...(consent ? { consentGiven: true } : {}) },
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

  // 2. Find or create the lead for this session.
  let lead = await prisma.lead.findUnique({ where: { sessionId } });
  if (!lead) {
    lead = await prisma.lead.create({
      data: { sessionId, visitId: visit.id, status: "draft" },
    });
  }

  const changed: TrackedField[] = [];
  const events: {
    field: TrackedField;
    oldValue: string | null;
    newValue: string;
    changeType: string;
  }[] = [];

  // 3. Diff each incoming field against the stored value; log only real changes.
  for (const field of TRACKED_FIELDS) {
    if (!(field in fields)) continue;
    const next = (fields[field] ?? "").trim();
    const prev = (lead[field] ?? "") as string | null;
    if (next === (prev ?? "")) continue;

    changed.push(field);
    events.push({
      field,
      oldValue: prev,
      newValue: next,
      changeType: next === "" ? "erase" : prev ? "update" : "create",
    });
  }

  // 4. Work-email gate runs on whatever the email currently is.
  const effectiveEmail = ("email" in fields ? (fields.email ?? "").trim() : lead.email) || "";
  let status = lead.status;
  let rejectReason = lead.rejectReason;
  let isWorkEmail = lead.isWorkEmail;
  let emailAccepted = false;

  if (effectiveEmail) {
    const check = checkWorkEmail(effectiveEmail);
    emailAccepted = check.ok;
    isWorkEmail = check.ok;
    if (!check.ok && !submit) {
      // Autosave with a personal/disposable address -> mark rejected for the admin.
      if (status === "draft") {
        status = "rejected";
        rejectReason = check.reason;
      }
    } else if (check.ok && status === "rejected") {
      // Fixed it -> back to a normal draft.
      status = "draft";
      rejectReason = null;
    }
  }

  if (submit) {
    status = "submitted";
    rejectReason = null;
  }

  // 5. Persist the new snapshot.
  const updateData: Prisma.LeadUpdateInput = { lastActivityAt: new Date() };
  for (const f of changed) updateData[f] = (fields[f] ?? "").trim();
  updateData.status = status;
  updateData.rejectReason = rejectReason;
  if (isWorkEmail !== undefined) updateData.isWorkEmail = isWorkEmail;
  if (submit) updateData.submittedAt = new Date();

  lead = await prisma.lead.update({ where: { id: lead.id }, data: updateData });

  // 6. Append the log rows.
  if (events.length) {
    await prisma.leadEvent.createMany({
      data: events.map((e) => ({
        leadId: lead!.id,
        visitId: visit.id,
        field: e.field,
        oldValue: e.oldValue,
        newValue: e.newValue,
        changeType: e.changeType,
        status,
        source,
        ip: meta.ip,
        userAgent: meta.userAgent,
      })),
    });
  }
  // 7. Record the submit itself as an explicit event.
  if (submit) {
    await prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        visitId: visit.id,
        field: "status",
        oldValue: "draft",
        newValue: "submitted",
        changeType: "submit",
        status: "submitted",
        source: "submit",
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  }

  // 8. Enrichment — only for accepted work emails, with consent, once per lead.
  if (consent && emailAccepted && effectiveEmail) {
    const existing = await prisma.enrichment.findUnique({ where: { leadId: lead.id } });
    if (!existing) {
      const check = checkWorkEmail(effectiveEmail);
      const result = await enrichFromEmail(effectiveEmail, check.domain);
      await prisma.enrichment.create({
        data: {
          leadId: lead.id,
          provider: result.provider,
          fullName: result.fullName,
          title: result.title,
          linkedinUrl: result.linkedinUrl,
          company: result.company,
          companyDomain: result.companyDomain,
          companyLinkedinUrl: result.companyLinkedinUrl,
          raw: result.raw ? JSON.stringify(result.raw) : null,
          error: result.error ?? null,
        },
      });
    }
  }

  return {
    ok: true,
    leadId: lead.id,
    status,
    rejectReason,
    emailAccepted,
    changed,
  };
}
