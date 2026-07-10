import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createConversionEvent } from "@ruleradar/db";
import { isRateLimited, isSameOrigin } from "../../request-guard";

const eventSchema = z.object({
  anonymousId: z.string().min(8).max(80),
  eventName: z.enum(["page_view", "trial_click", "pricing_click", "contact_click", "login_click"]),
  path: z.string().min(1).max(300),
  referrerHost: z.string().max(200).optional(),
  utm: z.record(z.string().max(200)).optional(),
  metadata: z.record(z.string().max(200)).optional()
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request, "events", 120, 60 * 60 * 1000)) return new NextResponse(null, { status: 204 });
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  await createConversionEvent(parsed.data);
  return new NextResponse(null, { status: 204 });
}
