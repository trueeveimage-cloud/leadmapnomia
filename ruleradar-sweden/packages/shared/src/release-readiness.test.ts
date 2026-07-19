import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { emailDomain, getReleaseReadiness, stripeEnvironment } from "./release-readiness";

const productionValues = {
  NODE_ENV: "production",
  APP_URL: "https://ruleradar.se",
  RESEND_API_KEY: "re_example",
  ALERT_FROM_EMAIL: "RuleRadar Sweden <alerts@ruleradar.se>",
  ADMIN_ALERT_EMAIL: "admin@ruleradar.se",
  LEGAL_ENTITY_NAME: "Example AB",
  LEGAL_ORG_NUMBER: "559000-0000",
  LEGAL_POSTAL_ADDRESS: "Exempelgatan 1, 111 11 Stockholm",
  LEGAL_CONTACT_EMAIL: "legal@ruleradar.se",
  STRIPE_SECRET_KEY: "sk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_SOLO_PRICE_ID: "price_solo",
  STRIPE_TEAM_PRICE_ID: "price_team",
  STRIPE_MULTI_OFFICE_PRICE_ID: "price_multi"
} as const;

describe("release readiness", () => {
  it("does not treat Stripe test credentials as production ready", () => {
    const config = loadConfig({ ...productionValues, STRIPE_SECRET_KEY: "sk_test_example" });
    expect(stripeEnvironment(config)).toBe("test");
    expect(getReleaseReadiness(config).stripe.ready).toBe(false);
  });

  it("requires the branded sender domain and final legal identity", () => {
    const config = loadConfig({ ...productionValues, ALERT_FROM_EMAIL: "RuleRadar <alerts@leadmap.se>", LEGAL_ORG_NUMBER: undefined });
    const readiness = getReleaseReadiness(config);
    expect(readiness.email.ready).toBe(false);
    expect(readiness.email.senderDomain).toBe("leadmap.se");
    expect(readiness.legal.ready).toBe(false);
  });

  it("recognizes a complete production configuration", () => {
    const readiness = getReleaseReadiness(loadConfig(productionValues));
    expect(readiness.stripe.ready).toBe(true);
    expect(readiness.email.ready).toBe(true);
    expect(readiness.legal.ready).toBe(true);
  });

  it("extracts sender domains from named and plain addresses", () => {
    expect(emailDomain("RuleRadar <alerts@ruleradar.se>")).toBe("ruleradar.se");
    expect(emailDomain("alerts@ruleradar.se")).toBe("ruleradar.se");
  });
});
