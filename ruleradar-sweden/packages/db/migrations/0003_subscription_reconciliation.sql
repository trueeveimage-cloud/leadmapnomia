create unique index if not exists subscriptions_org_unique
  on subscriptions(organization_id);

create unique index if not exists subscriptions_stripe_customer_unique
  on subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists subscriptions_stripe_subscription_unique
  on subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;
