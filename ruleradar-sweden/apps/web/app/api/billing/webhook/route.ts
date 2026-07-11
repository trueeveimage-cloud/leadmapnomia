import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { claimStripeWebhookEvent, completeStripeWebhookEvent, getOrganizationBillingContact, syncStripeSubscription } from "@ruleradar/db";
import { renderLifecycleEmail, sendEmail } from "@ruleradar/notifications";
import { loadConfig, logger } from "@ruleradar/shared";
import { subscriptionPeriodEnd } from "../stripe-subscription";

export async function POST(request: NextRequest) {
  const config = loadConfig();
  if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  const stripe = new Stripe(config.STRIPE_SECRET_KEY);
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, config.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid webhook signature." }, { status: 400 });
  }

  if (!(await claimStripeWebhookEvent(event.id, event.type))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const result = await reconcileStripeEvent(event, config);
    await sendLifecycleNotification(event, result, config);
    await completeStripeWebhookEvent(event.id, "processed", result);
    logger.info("stripe_webhook_received", { type: event.type, id: event.id, result });
    return NextResponse.json({ received: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeStripeWebhookEvent(event.id, "failed", null, message);
    logger.error("stripe_webhook_failed", { type: event.type, id: event.id, error: message });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

async function sendLifecycleNotification(event: Stripe.Event, result: unknown, config: ReturnType<typeof loadConfig>) {
  const organizationId = organizationIdFromResult(result);
  if (!organizationId) return;
  const contact = await getOrganizationBillingContact(organizationId);
  if (!contact?.email) return;

  const kind = event.type === "checkout.session.completed"
    ? "trial_started"
    : event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required"
      ? "payment_failed"
      : event.type === "customer.subscription.deleted"
        ? "subscription_canceled"
        : null;
  if (!kind) return;
  const email = renderLifecycleEmail(kind, `${config.APP_URL}/app/settings`);
  await sendEmail({ to: contact.email, ...email });
}

function organizationIdFromResult(result: unknown) {
  if (!result || typeof result !== "object" || !("organizationId" in result)) return null;
  const value = (result as { organizationId?: unknown }).organizationId;
  return typeof value === "string" ? value : null;
}

async function reconcileStripeEvent(event: Stripe.Event, config: ReturnType<typeof loadConfig>) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    return syncStripeSubscription({
      organizationId: session.client_reference_id || session.metadata?.organizationId,
      stripeCustomerId: asString(session.customer),
      stripeSubscriptionId: asString(session.subscription),
      planId: session.metadata?.plan,
      status: "checkout_completed"
    });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    return syncStripeSubscription({
      organizationId: subscription.metadata?.organizationId,
      stripeCustomerId: asString(subscription.customer),
      stripeSubscriptionId: subscription.id,
      planId: subscription.metadata?.plan || planFromPrice(priceId, config),
      status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
      currentPeriodEnd: subscriptionPeriodEnd(subscription)
    });
  }

  if (
    event.type === "invoice.payment_failed" ||
    event.type === "invoice.payment_succeeded" ||
    event.type === "invoice.payment_action_required"
  ) {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeInvoice = invoice as any;
    const subscriptionId = asString(stripeInvoice.subscription);
    const customerId = asString(invoice.customer);
    if (!subscriptionId) {
      return syncStripeSubscription({
        stripeCustomerId: customerId,
        planId: invoice.metadata?.plan,
        status: event.type === "invoice.payment_failed" ? "past_due" : "invoice_paid"
      });
    }

    const subscription = await new Stripe(config.STRIPE_SECRET_KEY!).subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items?.data?.[0]?.price?.id;
    return syncStripeSubscription({
      organizationId: subscription.metadata?.organizationId || invoice.metadata?.organizationId,
      stripeCustomerId: asString(subscription.customer) || customerId,
      stripeSubscriptionId: subscription.id,
      planId: subscription.metadata?.plan || invoice.metadata?.plan || planFromPrice(priceId, config),
      status: event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required" ? "past_due" : subscription.status,
      currentPeriodEnd: subscriptionPeriodEnd(subscription)
    });
  }

  return { mode: "ignored" as const };
}

function asString(value: string | { id: string } | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function planFromPrice(priceId: string | undefined, config: ReturnType<typeof loadConfig>) {
  if (priceId === config.STRIPE_SOLO_PRICE_ID) return "solo";
  if (priceId === config.STRIPE_MULTI_OFFICE_PRICE_ID) return "multi_office";
  return "team";
}
