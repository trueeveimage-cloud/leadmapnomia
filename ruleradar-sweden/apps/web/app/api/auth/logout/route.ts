import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "../../../auth";
import { appUrl, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const response = NextResponse.redirect(appUrl("/login"), { status: 303 });
  clearSessionCookie(response);
  return response;
}
