import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSubscriptionForOrganization, syncStripeSubscription } from "@ruleradar/db";
import { loadConfig } from "@ruleradar/shared";
import { requireApiUser } from "../../../auth";
import { appUrl, isSameOrigin } from "../../../request-guard";
import { subscriptionPeriodEnd } from "../stripe-subscription";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const config = loadConfig();
  if (!config.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const subscription = await getSubscriptionForOrganization(auth.session?.organizationId);
  if (!subscription?.stripeSubscriptionId) {
    return NextResponse.json({ error: "This workspace does not have an active Stripe subscription." }, { status: 409 });
  }

  const stripe = new Stripe(config.STRIPE_SECRET_KEY);
  const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true
  });
  await syncStripeSubscription({
    organizationId: auth.session?.organizationId,
    stripeCustomerId: typeof updated.customer === "string" ? updated.customer : updated.customer.id,
    stripeSubscriptionId: updated.id,
    planId: subscription.planId,
    status: updated.status === "active" || updated.status === "trialing" ? "cancel_at_period_end" : updated.status,
    currentPeriodEnd: subscriptionPeriodEnd(updated)
  });

  return NextResponse.redirect(appUrl("/app/settings?billing=cancel_scheduled"), { status: 303 });
}
