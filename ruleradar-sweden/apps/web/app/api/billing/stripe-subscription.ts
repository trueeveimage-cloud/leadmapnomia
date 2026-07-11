import type Stripe from "stripe";

type SubscriptionWithPeriods = Stripe.Subscription & {
  current_period_end?: number | null;
};

type SubscriptionItemWithPeriod = Stripe.SubscriptionItem & {
  current_period_end?: number | null;
};

export function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const value = subscription as SubscriptionWithPeriods;
  const itemPeriods = (subscription.items.data as SubscriptionItemWithPeriod[])
    .map((item) => item.current_period_end)
    .filter((period): period is number => typeof period === "number" && Number.isFinite(period));
  const period = value.current_period_end
    ?? (itemPeriods.length ? Math.min(...itemPeriods) : null)
    ?? subscription.trial_end;

  return period ? new Date(period * 1000) : null;
}
