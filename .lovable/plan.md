This is a large refactor. I'll ship it in clearly scoped phases so each piece is verifiable. Confirm and I'll execute phases in order (or skip phases you don't want now).

## Phase 1 — Product split (Nomia / Leadmap)

**DB**
- Add `product TEXT NOT NULL DEFAULT 'nomia'` to `leads` (values: `nomia` | `leadmap`).
- Add `product` to `campaigns` and `message_logs` so outreach + stats split cleanly.
- Backfill: everything existing → `nomia`.

**UI**
- Sidebar restructured into 2 top-level sections (collapsible groups):
  - **Nomia** (gold-on-black accent): Next Lead · Leads · Email · SMS · Closing · Follow-ups · Campaign Stats
  - **Leadmap** (white-on-black accent): same children
- Add `ProductContext` (`'nomia' | 'leadmap'`) persisted in localStorage. All list/queue/stat pages auto-filter by active product.
- Theme: keep current design language; only swap accent token per active product (gold vs white). No full re-skin.
- Add product picker on lead detail panel + bulk "Move to Leadmap/Nomia" action.

## Phase 2 — Email Finder upgrade
- Expand `scrape-emails` to scan: `/`, `/kontakt`, `/contact`, `/about`, `/om-oss`, `/footer`, `/privacy`, `/integritet`, `/terms`, `/villkor`, `/boka`, `/booking`, `/team`, `/personal`.
- Parse `mailto:` links + visible plain-text emails. No guessing/permutations.
- Keep only public business-style addresses: `info@, kontakt@, hello@, hej@, sales@, booking@, admin@, support@, reception@, contact@, office@, mail@` OR free-mail (`gmail/outlook/hotmail/live`) found publicly on the site.
- Rank: same-domain business prefix > same-domain other > free-mail.
- Increase batch size + raise per-page byte cap so deeper pages are reachable.

## Phase 3 — Lead Finder countries
- Extend `cities.ts` with curated cities for **UK** and **Spain** (in addition to SE/NO/DK).
- Country filter in Finder UI (SE / UK / ES; NO/DK stay).
- Localized keyword sets per country in `nichePresets.ts`.

## Phase 4 — Sorting on Leads list
Add sort dropdown with: Highest potential · Lowest potential · Newest · Not contacted · Has email · Has phone · Needs follow-up. (Last 4 act as filter+sort shortcuts.)

## Phase 5 — Gmail correctness
- `send-gmail` reads connected account via `gmail-profile` and uses that as `From`. Remove any hard-coded address; ignore `gmail_from_address` unless it matches the connected mailbox.
- Email composer header shows live "Sending from: <connected gmail>".
- Auto-save drafts to `localStorage` keyed by `leadId` so switching leads never loses text; restore on reopen.
- Hard guard against double-contact: `send-gmail` and `send-sms` already check `message_logs`; surface a clear toast "Already contacted via X on <date>" instead of silent skip.

## Phase 6 — Outreach stages + Email tier list
- Normalize `outreach_stage` to: `none | email_sent | sms_sent | called | replied | follow_up | closed | lost`.
- New page `/email-tier` (per product): leads with `outreach_stage='email_sent'` ranked by `lead_tier` (S→A+→A→B→C) then `last_outbound_at` desc. Columns: tier, name, sent at, reply state, quick actions.

## Phase 7 — Combined lead timeline
- New component `LeadTimeline` on the right panel.
- Sources merged & sorted desc: `message_logs` (email+sms in/out), `activities` (call outcomes, status changes, notes), `lead_appointments`.
- Icons + color per type, "today / yesterday / date" grouping.

## Phase 8 — Campaign dashboard with charts
- New page `/campaigns/dashboard` (per product) using Recharts:
  - Line: sent vs delivered vs replied over time.
  - KPI cards: sent, delivered, reply rate %, meetings booked (`lead_appointments`), closed (`status='closed_won'`).
  - Sortable table per campaign: sent / delivered / replied / reply rate / meetings / closed.

---

### Technical notes
- All new tables/columns get explicit `GRANT` + RLS.
- Product filter implemented as a single `.eq('product', activeProduct)` helper in `src/lib/supabase.ts` so every query stays consistent.
- Theme accent via CSS var swap on `<body data-product="...">` in `index.css` — no component rewrites.
- No changes to Twilio webhook / pg_cron behavior.

### Suggested execution order
1, 5, 4, 6, 7, 2, 3, 8 — ship value early (split + Gmail correctness + sort + tier list + timeline), then finder upgrades, then dashboard.

Reply **"go"** to execute all phases in that order, or list the phase numbers you want first (e.g. "1, 5, 7 only").