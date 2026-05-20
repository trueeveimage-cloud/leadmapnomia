# Transform LeadMapAI into AI Receptionist Sales Command Center

## Goal
Repurpose the existing CRM into a high-value lead finder + scorer + outreach tool tailored to selling an AI receptionist to Swedish/Nordic service businesses where missed calls cost money.

## Scope (what changes)

### 1. Database — new lead fields
Add columns to `leads`:
- `potential_score` (int 0-100)
- `lead_tier` (text: A+, A, B, C)
- `estimated_value` (text label, e.g. "High / Medium / Low")
- `website_quality` (text: weak / decent / strong / none)
- `has_booking` (bool, nullable)
- `has_emergency` (bool, nullable)
- `has_receptionist` (bool, nullable)
- `has_contact_form` (bool, nullable)
- `best_contact_method` (text)
- `why_good_lead` (text — generated explanation)
- `email_source` (text: homepage / contact / footer / google / none)
- `instagram_url`, `facebook_url` (text)
- `opening_hours` (text)
- `follow_up_at` (timestamptz)

Extend `status` allowed values to include `qualified`, `call_first`, `no_answer`, `demo_sent`, `follow_up`, `not_relevant` (stored as text, no enum constraint — existing values stay valid).

### 2. Scoring engine (`src/lib/leadScoring.ts`)
Pure TypeScript module:
- `NICHE_PROFILES` map (cosmetic, dental, law, plumber, electrician, locksmith, roofer, water_damage, real_estate, construction, car_dealer, car_detailer, healthcare) with `{ highValue, urgent, baseValue, defaultEmergency, lowValue }`
- `detectNiche(lead)` — match against name/category/niche_label keywords
- `assessWebsiteQuality(lead)` — heuristic from website presence + last_fetched
- `calculateScore(lead)` — applies all +/- rules from request, returns `{ score, tier, reasons[], badges[] }`
- `generateWhyGoodLead(lead, score, reasons)` — Swedish explanation string
- `generateOutreachMessage(lead, niche)` — niche-specific Swedish SMS/email template
- `scoreAndPersist(leadId)` helper that recomputes + saves to DB

### 3. High-value search presets (`src/lib/finderPresets.ts`)
Add 6 new presets (Cosmetic Clinics, Dental High Ticket, Lawyers, Emergency Trades, Real Estate / Property, Car High Ticket) with the keyword lists provided. Default city Göteborg.

### 4. Email extraction upgrade (`supabase/functions/scrape-emails/index.ts`)
- Fetch homepage, then try `/kontakt`, `/contact`, `/about`, `/om-oss`, `/boka`, `/booking` (up to 3 extra pages per lead)
- Tag each found email with `source` (homepage/contact/about/footer/booking)
- Prefer business-pattern prefixes (`info@`, `kontakt@`, `hello@`, `boka@`, `booking@`, `reception@`, `admin@`, `sales@`, `support@`)
- Keep only publicly visible emails; never guess/generate
- Return `{ leadId, email, source, allEmails[] }`

Client side: when saving scraped email, also save `email_source`.

### 5. New "Hot Leads" command center page (`/hot-leads`)
Primary view ordered by `potential_score DESC`:
- Top filter bar: city, niche, tier (A+/A/B/C), score range, has_phone, has_email, has_website, has_booking, has_emergency, min_reviews, min_rating, status, needs follow-up
- Sort dropdown: score, reviews, rating, worst website, no booking, emergency first, recently added, not contacted
- Lead cards (not table) with badges: `A+ Hot Lead`, `High Ticket`, `Urgent Call`, `No Booking`, `Weak Website`, `Email Found`, `Call First`
- Each card: name, niche, city, score (big), tier badge, "Why this lead" text, quick action row

### 6. Quick actions component
Reusable `LeadQuickActions` with buttons:
- Open website / Open Google Maps / Call (tel:) / Copy phone / Copy email / Copy outreach message / Mark contacted / Set follow-up / Add note

### 7. Lead detail panel additions
In `LeadDetailPanel`: show score breakdown, tier, why-good-lead, niche detection, generated outreach message (copyable), all new fields, new statuses, follow-up date picker.

### 8. Bulk rescore action
Settings page button: "Recompute all lead scores" — iterates in 200-row batches, runs `calculateScore`, updates DB.

### 9. Sidebar
Add **Hot Leads** entry at the top of the workflow group with a flame icon.

## Out of scope (explicitly NOT in this change)
- Email sending infra (still on hold — domain DNS pending). Outreach message is generate + copy only.
- Twilio changes
- New auth/roles
- Touching the existing campaign engine logic
- Rebuilding `LeadList`/`LeadRow` (Hot Leads is a new dedicated view)

## Technical notes
- Score computed client-side on read AND persisted via bulk action + on new-lead insert (via small util called from `addLead` and `fetch-place` results). No DB triggers — keep logic in TS so it's editable.
- Status field stays `text` (no enum migration). Frontend `LeadStatus` type expanded.
- All new UI in semantic tokens, badges via existing shadcn `Badge` with custom color classes mapped in `index.css`.
- No new dependencies.

## Files touched (approx)
- `supabase/migrations/<new>.sql` (add columns)
- `src/lib/leadScoring.ts` (new)
- `src/lib/finderPresets.ts` (extend)
- `src/lib/supabase.ts` (extend Lead type + LeadStatus union)
- `src/pages/HotLeadsPage.tsx` (new)
- `src/components/LeadQuickActions.tsx` (new)
- `src/components/LeadScoreBadge.tsx` (new)
- `src/components/LeadDetailPanel.tsx` (additions)
- `src/components/Sidebar.tsx` (Hot Leads link)
- `src/App.tsx` (route)
- `src/pages/SettingsPage.tsx` (rescore button)
- `supabase/functions/scrape-emails/index.ts` (multi-page + source)
- `src/index.css` (tier badge tokens)
