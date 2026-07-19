import type { AppConfig } from "./config";

export type StripeEnvironment = "live" | "test" | "missing" | "unknown";

export function stripeEnvironment(config: AppConfig): StripeEnvironment {
  const key = config.STRIPE_SECRET_KEY || "";
  if (!key) return "missing";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "unknown";
}

export function emailDomain(from: string) {
  const address = from.match(/<([^>]+)>/)?.[1] || from;
  const separator = address.lastIndexOf("@");
  return separator >= 0 ? address.slice(separator + 1).trim().toLowerCase() : null;
}

export function getReleaseReadiness(config: AppConfig) {
  const stripeMode = stripeEnvironment(config);
  const stripeConfigured = Boolean(
    config.STRIPE_SECRET_KEY &&
    config.STRIPE_WEBHOOK_SECRET &&
    config.STRIPE_SOLO_PRICE_ID &&
    config.STRIPE_TEAM_PRICE_ID &&
    config.STRIPE_MULTI_OFFICE_PRICE_ID
  );
  const senderDomain = emailDomain(config.ALERT_FROM_EMAIL);
  const emailConfigured = Boolean(config.RESEND_API_KEY && config.ADMIN_ALERT_EMAIL && senderDomain === "ruleradar.se");
  const legalConfigured = Boolean(
    config.LEGAL_ENTITY_NAME &&
    config.LEGAL_ORG_NUMBER &&
    config.LEGAL_POSTAL_ADDRESS &&
    config.LEGAL_CONTACT_EMAIL
  );

  return {
    stripe: { ready: stripeConfigured && stripeMode === "live", configured: stripeConfigured, mode: stripeMode },
    email: { ready: emailConfigured, senderDomain },
    legal: { ready: legalConfigured }
  };
}
