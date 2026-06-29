import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { loadConfig } from "@ruleradar/shared";

const priceEnvByPlan: Record<string, "STRIPE_SOLO_PRICE_ID" | "STRIPE_TEAM_PRICE_ID" | "STRIPE_MULTI_OFFICE_PRICE_ID"> = {
  solo: "STRIPE_SOLO_PRICE_ID",
  team: "STRIPE_TEAM_PRICE_ID",
  multi_office: "STRIPE_MULTI_OFFICE_PRICE_ID"
};

export async function POST(request: NextRequest) {
  const config = loadConfig();
  const plan = request.nextUrl.searchParams.get("plan") || "team";
  const priceKey = priceEnvByPlan[plan];
  if (!config.STRIPE_SECRET_KEY || !priceKey || !config[priceKey]) {
    return NextResponse.json({ error: "Stripe is not configured for this plan." }, { status: 503 });
  }

  const stripe = new Stripe(config.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: config[priceKey], quantity: 1 }],
    success_url: `${config.APP_URL}/app?checkout=success`,
    cancel_url: `${config.APP_URL}/pricing?checkout=cancelled`,
    subscription_data: { trial_period_days: 14 },
    metadata: { plan }
  });

  return NextResponse.redirect(session.url!, { status: 303 });
}
