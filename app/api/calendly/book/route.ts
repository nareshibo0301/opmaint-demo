import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionId } from "@/lib/session";
import { calendlyErrorResponse, calendlyRequest, getCalendlyConfig } from "@/lib/calendly";
import { checkWorkEmail, REASON_MESSAGE } from "@/lib/workEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingBody = {
  startTime?: unknown;
  timezone?: unknown;
};

type InviteeResponse = {
  resource: {
    event?: string;
  };
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export async function POST(req: NextRequest) {
  const sessionId = readSessionId(req);
  if (!sessionId) {
    return NextResponse.json({ error: "Your session expired. Reload the page and try again." }, { status: 400 });
  }

  let body: BookingBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid booking request." }, { status: 400 });
  }

  const startTime = isString(body.startTime) ? new Date(body.startTime) : null;
  const timezone = isString(body.timezone) ? body.timezone.trim() : "";

  if (!startTime || !Number.isFinite(startTime.getTime()) || startTime.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Choose an available future time." }, { status: 400 });
  }
  if (!timezone) return NextResponse.json({ error: "Your time zone could not be detected." }, { status: 400 });
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return NextResponse.json({ error: "The selected time zone is invalid. Refresh the page and try again." }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { sessionId } });
  if (!lead || lead.status !== "submitted") {
    return NextResponse.json({ error: "Submit your demo details before choosing a time." }, { status: 400 });
  }

  const email = lead.email?.trim() ?? "";
  const firstName = lead.firstName?.trim() ?? "";
  const lastName = lead.lastName?.trim() ?? "";
  const phone = lead.phone?.trim() ?? "";
  const companyName = lead.companyName?.trim() ?? "";
  const source = lead.source?.trim() ?? "";
  if (!email || !firstName || !lastName || !companyName || !validPhone(phone)) {
    return NextResponse.json({ error: "Complete the required form fields before booking." }, { status: 400 });
  }
  const emailCheck = checkWorkEmail(email);
  if (!emailCheck.ok) {
    return NextResponse.json(
      { error: REASON_MESSAGE[emailCheck.reason] || "Please check your email." },
      { status: 400 },
    );
  }

  try {
    const { token, eventTypeUri, phoneQuestion, companyQuestion, sourceQuestion } = getCalendlyConfig();

    // Dynamically match custom questions configured on the Calendly event
    const questionsAndAnswers: Array<{ question: string; answer: string; position: number }> = [];
    try {
      const eventTypeUuid = eventTypeUri.replace(/^.*\/event_types\//, "");
      const eventTypeData = await calendlyRequest<{
        resource: { custom_questions?: Array<{ name: string; position: number; enabled?: boolean }> };
      }>(`/event_types/${eventTypeUuid}`, token);

      const customQuestions = (eventTypeData.resource?.custom_questions ?? []).filter(
        (q) => q.enabled !== false,
      );

      for (const cq of customQuestions) {
        const qName = cq.name.toLowerCase();
        let answer = "";
        if (qName.includes("phone")) {
          answer = phone;
        } else if (qName.includes("company")) {
          answer = companyName;
        } else if (qName.includes("source") || qName.includes("find us") || qName.includes("hear")) {
          answer = source;
        } else if (
          qName.includes("prepare") ||
          qName.includes("help") ||
          qName.includes("share") ||
          qName.includes("anything")
        ) {
          const notes = [
            `Company: ${companyName}`,
            `Phone: ${phone}`,
            source ? `Source: ${source}` : "",
            lead.description ? `Note: ${lead.description}` : "",
          ].filter(Boolean).join(" | ");
          answer = notes;
        } else if (cq.name === phoneQuestion) {
          answer = phone;
        } else if (cq.name === companyQuestion) {
          answer = companyName;
        } else if (cq.name === sourceQuestion) {
          answer = source;
        }

        if (answer) {
          questionsAndAnswers.push({
            question: cq.name,
            answer,
            position: cq.position,
          });
        }
      }
    } catch (err) {
      console.warn("Could not query event custom questions, skipping custom questions:", err);
    }

    const result = await calendlyRequest<InviteeResponse>("/invitees", token, {
      method: "POST",
      body: JSON.stringify({
        event_type: eventTypeUri,
        start_time: startTime.toISOString(),
        invitee: {
          first_name: firstName,
          last_name: lastName,
          email,
          timezone,
        },
        ...(questionsAndAnswers.length > 0 ? { questions_and_answers: questionsAndAnswers } : {}),
      }),
    });

    try {
      const latestLead = await prisma.lead.findUnique({ where: { sessionId } });
      const alreadyRecorded =
        latestLead?.status === "scheduled" &&
        latestLead.calendlyEventUri === result.resource.event;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: "scheduled",
          calendlyEventUri: result.resource.event ?? lead.calendlyEventUri,
          scheduledAt: startTime,
        },
      });
      if (!alreadyRecorded) {
        await prisma.leadEvent.create({
          data: {
            leadId: lead.id,
            field: "status",
            oldValue: latestLead?.status ?? lead.status,
            newValue: "scheduled",
            changeType: "update",
            status: "scheduled",
            source: "calendly_api",
          },
        });
      }
    } catch (error) {
      console.error("Calendly booking was created but the lead record could not be updated:", error);
      return NextResponse.json({
        ok: true,
        warning: "Your time is booked. We could not update our local record, but you do not need to book again.",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = calendlyErrorResponse(error);
    if (response.status >= 500) console.error("Calendly booking error:", error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
