import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSubscriptionForOrganization } from "@ruleradar/db";
import { loadConfig } from "@ruleradar/shared";
import { requireApiUser } from "../../../auth";
import { isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const config = loadConfig();
  if (!config.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const subscription = await getSubscriptionForOrganization(auth.session?.organizationId);
  if (!subscription?.stripeCustomerId) {
    return NextResponse.json({ error: "This workspace does not have a Stripe customer yet." }, { status: 409 });
  }

  const stripe = new Stripe(config.STRIPE_SECRET_KEY);
  const portal = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${config.APP_URL}/app/settings?billing=portal_return`
  });

  return NextResponse.redirect(portal.url, { status: 303 });
}
