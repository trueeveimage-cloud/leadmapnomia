import Stripe from "stripe";
import { syncStripeSubscription, type SubscriptionSyncInput } from "@ruleradar/db";
import type { AppConfig } from "@ruleradar/shared";
import { subscriptionPeriodEnd } from "../stripe-subscription";

interface ReconciliationDependencies {
  syncSubscription: (input: SubscriptionSyncInput) => Promise<unknown>;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
}

export async function reconcileStripeEvent(
  event: Stripe.Event,
  config: AppConfig,
  dependencies: ReconciliationDependencies = defaultDependencies(config)
) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    return dependencies.syncSubscription({
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
    return dependencies.syncSubscription({
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
    const invoiceWithSubscription = invoice as Stripe.Invoice & { subscription?: string | { id: string } | null };
    const subscriptionId = asString(invoiceWithSubscription.subscription || null);
    const customerId = asString(invoice.customer);
    if (!subscriptionId) {
      return dependencies.syncSubscription({
        stripeCustomerId: customerId,
        planId: invoice.metadata?.plan,
        status: event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required" ? "past_due" : "invoice_paid"
      });
    }

    const subscription = await dependencies.retrieveSubscription(subscriptionId);
    const priceId = subscription.items?.data?.[0]?.price?.id;
    return dependencies.syncSubscription({
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

function defaultDependencies(config: AppConfig): ReconciliationDependencies {
  return {
    syncSubscription: syncStripeSubscription,
    retrieveSubscription: (id) => new Stripe(config.STRIPE_SECRET_KEY!).subscriptions.retrieve(id)
  };
}

function asString(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function planFromPrice(priceId: string | undefined, config: AppConfig) {
  if (priceId === config.STRIPE_SOLO_PRICE_ID) return "solo";
  if (priceId === config.STRIPE_MULTI_OFFICE_PRICE_ID) return "multi_office";
  return "team";
}
