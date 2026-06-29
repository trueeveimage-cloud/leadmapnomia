import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  SYSTEM_CRON_SECRET: z.string().min(16).optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5"),
  RESEND_API_KEY: z.string().min(1).optional(),
  ALERT_FROM_EMAIL: z.string().min(3).default("RuleRadar Sweden <alerts@example.com>"),
  ADMIN_ALERT_EMAIL: z.string().email().optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_SOLO_PRICE_ID: z.string().min(1).optional(),
  STRIPE_TEAM_PRICE_ID: z.string().min(1).optional(),
  STRIPE_MULTI_OFFICE_PRICE_ID: z.string().min(1).optional()
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(input);
}

export function requireConfig<K extends keyof AppConfig>(config: AppConfig, key: K): NonNullable<AppConfig[K]> {
  const value = config[key];
  if (!value) throw new Error(`Missing required environment variable ${String(key)}`);
  return value as NonNullable<AppConfig[K]>;
}
