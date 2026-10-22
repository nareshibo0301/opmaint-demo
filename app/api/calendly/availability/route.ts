import { NextRequest, NextResponse } from "next/server";
import { calendlyErrorResponse, calendlyRequest, getCalendlyConfig } from "@/lib/calendly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AvailabilityResponse = {
  collection: Array<{ start_time: string; status: string }>;
};

export async function GET(req: NextRequest) {
  const startTime = req.nextUrl.searchParams.get("startTime");
  const endTime = req.nextUrl.searchParams.get("endTime");
  const start = startTime ? new Date(startTime) : null;
  const end = endTime ? new Date(endTime) : null;
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000;

  if (
    !start ||
    !end ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start.getTime() < Date.now() ||
    end <= start ||
    end.getTime() - start.getTime() > maxRangeMs
  ) {
    return NextResponse.json(
      { error: "Choose a future availability range of 31 days or less." },
      { status: 400 },
    );
  }

  try {
    const { token, eventTypeUri } = getCalendlyConfig();
    const query = new URLSearchParams({
      event_type: eventTypeUri,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    });
    const result = await calendlyRequest<AvailabilityResponse>(
      `/event_type_available_times?${query.toString()}`,
      token,
    );

    return NextResponse.json({
      slots: result.collection
        .filter((slot) => slot.status === "available")
        .map((slot) => ({ startTime: slot.start_time })),
    });
  } catch (error) {
    const response = calendlyErrorResponse(error);
    if (response.status >= 500) console.error("Calendly availability error:", error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
