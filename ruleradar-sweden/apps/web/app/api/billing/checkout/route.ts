import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSubscriptionForOrganization, markCheckoutStarted } from "@ruleradar/db";
import { loadConfig } from "@ruleradar/shared";
import { authIsRequired, getSession } from "../../../auth";
import { appUrl, isSameOrigin } from "../../../request-guard";

type PlanId = "solo" | "team" | "multi_office";

const priceEnvByPlan: Record<PlanId, "STRIPE_SOLO_PRICE_ID" | "STRIPE_TEAM_PRICE_ID" | "STRIPE_MULTI_OFFICE_PRICE_ID"> = {
  solo: "STRIPE_SOLO_PRICE_ID",
  team: "STRIPE_TEAM_PRICE_ID",
  multi_office: "STRIPE_MULTI_OFFICE_PRICE_ID"
};

export async function GET(request: NextRequest) {
  return startCheckout(request);
}

export async function POST(request: NextRequest) {
  return startCheckout(request);
}

async function startCheckout(request: NextRequest) {
  if (request.method === "POST" && !isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const config = loadConfig();
  const plan = normalizePlan(request.nextUrl.searchParams.get("plan") || "team");
  const priceKey = priceEnvByPlan[plan];
  const session = await getSession();

  if (authIsRequired() && !session) {
    return NextResponse.redirect(appUrl(`/signup?plan=${plan}`), { status: 303 });
  }

  if (!authIsRequired() && !session?.organizationId) {
    return NextResponse.redirect(appUrl("/app/settings?checkout=fixture_skipped"), { status: 303 });
  }

  if (!session?.organizationId) {
    return NextResponse.json({ error: "Create or log in to a workspace before checkout." }, { status: 401 });
  }

  if (!config.STRIPE_SECRET_KEY || !config[priceKey]) {
    return NextResponse.json({ error: "Stripe is not configured for this plan." }, { status: 503 });
  }

  const stripe = new Stripe(config.STRIPE_SECRET_KEY);
  const existing = await getSubscriptionForOrganization(session.organizationId);
  const customerId = existing?.stripeCustomerId || (await stripe.customers.create({
    email: session.email,
    name: session.name || undefined,
    metadata: {
      organizationId: session.organizationId,
      userId: session.userId
    }
  })).id;

  await markCheckoutStarted({
    organizationId: session.organizationId,
    planId: plan,
    stripeCustomerId: customerId
  });

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: session.organizationId,
    line_items: [{ price: config[priceKey], quantity: 1 }],
    success_url: `${config.APP_URL}/app/settings?checkout=success`,
    cancel_url: `${config.APP_URL}/pricing?checkout=cancelled`,
    subscription_data: {
      trial_period_days: 14,
      metadata: {
        organizationId: session.organizationId,
        userId: session.userId,
        plan
      }
    },
    metadata: {
      organizationId: session.organizationId,
      userId: session.userId,
      plan
    }
  });

  return NextResponse.redirect(checkout.url!, { status: 303 });
}

function normalizePlan(plan: string): PlanId {
  return plan === "solo" || plan === "multi_office" || plan === "team" ? plan : "team";
}
