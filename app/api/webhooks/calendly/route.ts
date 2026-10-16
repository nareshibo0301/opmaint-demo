import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const event = body.event;
    const payload = body.payload;

    if (event === "invitee.created") {
      const email = payload.email;
      const eventUri = payload.event; // The URI of the scheduled event

      // Find the most recent lead with this email
      const lead = await prisma.lead.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
      });

      if (lead) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: "scheduled",
            calendlyEventUri: eventUri,
            scheduledAt: new Date(payload.created_at),
          },
        });

        // Also record a lead event in the timeline
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Calendly Webhook Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
