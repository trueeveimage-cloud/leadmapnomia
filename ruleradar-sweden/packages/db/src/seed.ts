import { getPool, closeDb } from "./client";
import { seedSources } from "./fixtures";
import { logger } from "@ruleradar/shared";

async function main() {
  const pool = getPool();
  await pool.query(`
    insert into plans (id, name, monthly_sek, included_seats, features)
    values
      ('solo', 'Solo', 399, 1, '{"daily_digest":true,"immediate_alerts":false}'::jsonb),
      ('team', 'Team', 799, 5, '{"daily_digest":true,"immediate_alerts":true,"acknowledgements":true}'::jsonb),
      ('multi_office', 'Multi-office', 1499, 15, '{"daily_digest":true,"immediate_alerts":true,"org_units":true,"priority_review":true}'::jsonb)
    on conflict (id) do update set name = excluded.name, monthly_sek = excluded.monthly_sek, included_seats = excluded.included_seats, features = excluded.features
  `);

  for (const source of seedSources) {
    await pool.query(
      `insert into sources (name, agency, url, strategy, topics, enabled, priority, requires_review_by_default)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       on conflict (url) do update set
         name = excluded.name,
         agency = excluded.agency,
         strategy = excluded.strategy,
         topics = excluded.topics,
         enabled = excluded.enabled,
         priority = excluded.priority,
         requires_review_by_default = excluded.requires_review_by_default`,
      [source.name, source.agency, source.url, source.strategy, JSON.stringify(source.topics), source.enabled, source.priority, !!source.requiresReviewByDefault]
    );
  }

  const { rows: userRows } = await pool.query(`
    insert into users (email, name, is_platform_admin)
    values ('admin@ruleradar.se', 'RuleRadar Admin', true)
    on conflict (email) do update set is_platform_admin = true, updated_at = now()
    returning id
  `);
  let { rows: orgRows } = await pool.query(`
    select id from organizations where billing_email = 'admin@ruleradar.se' order by created_at asc limit 1
  `);
  if (!orgRows.length) {
    const insertedOrg = await pool.query(`
      insert into organizations (name, billing_email, trial_ends_at)
      values ('RuleRadar Beta Workspace', 'admin@ruleradar.se', now() + interval '14 days')
      returning id
    `);
    orgRows = insertedOrg.rows;
  }
  await pool.query(`
    insert into organization_members (organization_id, user_id, role)
    values ($1, $2, 'owner')
    on conflict (organization_id, user_id) do nothing
  `, [orgRows[0].id, userRows[0].id]);
  await pool.query(`
    insert into subscriptions (organization_id, plan_id, status)
    select $1, 'team', 'trialing'
    where not exists (select 1 from subscriptions where organization_id = $1)
  `, [orgRows[0].id]);
  await pool.query(`
    insert into notification_settings (organization_id, recipient_email, immediate, daily_digest, topics)
    select $1, 'admin@ruleradar.se', true, true, '[]'::jsonb
    where not exists (select 1 from notification_settings where organization_id = $1 and recipient_email = 'admin@ruleradar.se')
  `, [orgRows[0].id]);

  logger.info("seed_complete", { sources: seedSources.length });
}

main().finally(closeDb);
