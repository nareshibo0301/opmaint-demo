import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const event = body.event;
    const payload = body.payload;

    if (event === "invitee.created") {
      const email = payload.email;
      const eventUri = payload.event;
      const scheduledAt = payload.scheduled_event?.start_time
        ? new Date(payload.scheduled_event.start_time)
        : null;

      // Find the most recent lead with this email
      const lead = await prisma.lead.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
      });

      if (lead) {
        const alreadyRecorded = lead.status === "scheduled" && lead.calendlyEventUri === eventUri;
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: "scheduled",
            calendlyEventUri: eventUri,
            scheduledAt: scheduledAt ?? lead.scheduledAt ?? new Date(payload.created_at),
          },
        });

        if (!alreadyRecorded) {
          await prisma.leadEvent.create({
            data: {
              leadId: lead.id,
              field: "status",
              oldValue: lead.status,
              newValue: "scheduled",
              changeType: "update",
              source: "calendly_webhook",
            },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Calendly Webhook Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
