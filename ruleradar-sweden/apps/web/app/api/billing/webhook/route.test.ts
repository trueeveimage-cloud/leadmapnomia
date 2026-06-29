import { describe, expect, it } from "vitest";
import Stripe from "stripe";

describe("Stripe webhook verification dependency", () => {
  it("exposes constructEvent for signature verification", () => {
    const stripe = new Stripe("sk_test_fake");
    expect(typeof stripe.webhooks.constructEvent).toBe("function");
  });
});
