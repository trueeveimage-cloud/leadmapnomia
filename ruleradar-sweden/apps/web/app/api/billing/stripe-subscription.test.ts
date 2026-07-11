import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { subscriptionPeriodEnd } from "./stripe-subscription";

describe("subscriptionPeriodEnd", () => {
  it("reads item-level periods from current Stripe payloads", () => {
    const subscription = {
      items: { data: [{ current_period_end: 1_800_000_000 }] },
      trial_end: 1_700_000_000
    } as unknown as Stripe.Subscription;

    expect(subscriptionPeriodEnd(subscription)?.toISOString()).toBe("2027-01-15T08:00:00.000Z");
  });

  it("keeps compatibility with legacy subscription-level periods", () => {
    const subscription = {
      current_period_end: 1_700_000_000,
      items: { data: [] },
      trial_end: null
    } as unknown as Stripe.Subscription;

    expect(subscriptionPeriodEnd(subscription)?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });
});
