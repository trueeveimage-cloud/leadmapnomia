import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import type { SubscriptionSyncInput } from "@ruleradar/db";
import { loadConfig } from "@ruleradar/shared";
import { reconcileStripeEvent } from "./reconciliation";

const config = loadConfig({
  NODE_ENV: "test",
  APP_URL: "https://ruleradar.se",
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_SOLO_PRICE_ID: "price_solo",
  STRIPE_TEAM_PRICE_ID: "price_team",
  STRIPE_MULTI_OFFICE_PRICE_ID: "price_multi"
});

describe("Stripe webhook reconciliation", () => {
  it("maps a completed checkout to its workspace and selected plan", async () => {
    const dependencies = fakeDependencies();
    const result = await reconcileStripeEvent(event("checkout.session.completed", {
      customer: "cus_123",
      subscription: "sub_123",
      client_reference_id: "org_123",
      metadata: { plan: "team" }
    }), config, dependencies);

    expect(result).toEqual({ mode: "database", organizationId: "org_123" });
    expect(dependencies.syncSubscription).toHaveBeenCalledWith({
      organizationId: "org_123",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      planId: "team",
      status: "checkout_completed"
    });
  });

  it("marks deleted subscriptions canceled and maps their price", async () => {
    const dependencies = fakeDependencies();
    await reconcileStripeEvent(event("customer.subscription.deleted", subscription({ priceId: "price_multi" })), config, dependencies);

    expect(dependencies.syncSubscription).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org_123",
      planId: "multi_office",
      status: "canceled"
    }));
  });

  it("marks a subscription past due after a failed invoice", async () => {
    const dependencies = fakeDependencies(subscription({ status: "active", priceId: "price_solo" }));
    await reconcileStripeEvent(event("invoice.payment_failed", {
      customer: "cus_invoice",
      subscription: "sub_123",
      metadata: {}
    }), config, dependencies);

    expect(dependencies.retrieveSubscription).toHaveBeenCalledWith("sub_123");
    expect(dependencies.syncSubscription).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org_123",
      stripeCustomerId: "cus_123",
      planId: "solo",
      status: "past_due"
    }));
  });

  it("records successful invoices without a subscription reference", async () => {
    const dependencies = fakeDependencies();
    await reconcileStripeEvent(event("invoice.payment_succeeded", {
      customer: "cus_123",
      subscription: null,
      metadata: { plan: "team" }
    }), config, dependencies);

    expect(dependencies.retrieveSubscription).not.toHaveBeenCalled();
    expect(dependencies.syncSubscription).toHaveBeenCalledWith({
      stripeCustomerId: "cus_123",
      planId: "team",
      status: "invoice_paid"
    });
  });

  it("ignores unrelated Stripe events without writing billing state", async () => {
    const dependencies = fakeDependencies();
    await expect(reconcileStripeEvent(event("charge.succeeded", {}), config, dependencies)).resolves.toEqual({ mode: "ignored" });
    expect(dependencies.syncSubscription).not.toHaveBeenCalled();
  });
});

function fakeDependencies(retrieved = subscription({})) {
  return {
    syncSubscription: vi.fn(async (input: SubscriptionSyncInput) => ({ mode: "database", organizationId: input.organizationId || "org_from_customer" })),
    retrieveSubscription: vi.fn(async () => retrieved)
  };
}

function event(type: string, object: unknown) {
  return { id: `evt_${type}`, type, data: { object } } as Stripe.Event;
}

function subscription(input: { status?: string; priceId?: string } = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: input.status || "trialing",
    metadata: { organizationId: "org_123" },
    items: { data: [{ price: { id: input.priceId || "price_team" }, current_period_end: 1_800_000_000 }] }
  } as unknown as Stripe.Subscription;
}
