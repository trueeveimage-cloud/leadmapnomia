

## Plan: Follow-Up System for Interested Leads

Three features: time-since-last-message indicators, SMS template presets, and auto-follow-up nudges.

---

### 1. "Last messaged" time indicator on lead list (ClosingPage)

In the lead list on the left panel of `ClosingPage.tsx`, show a relative time badge (e.g. "2h ago", "3d ago") next to each lead based on `last_outbound_at`. Color-code it:
- Green: < 12 hours
- Amber: 12-48 hours  
- Red: > 48 hours (needs follow-up)

Sort leads by staleness (oldest last-message first) by default, so leads needing follow-up appear at top (after pinned).

**File:** `src/pages/ClosingPage.tsx`

---

### 2. SMS template presets on the Closing page

Add a row of quick-send template buttons above the reply input in the Messages tab. Clicking one fills the reply input with the template text (user can edit before sending).

Preset templates:
- **Nudge**: "Hej {name}! Såg att du var intresserad — har du hunnit fundera? /Simon"
- **Call offer**: "Hej {name}, vill du att jag ringer upp dig istället? Tar bara 2 min! /Simon"
- **Booking link**: "Hej {name}! Boka en tid som passar dig här: [LINK] /Simon"
- **Details ask**: "Toppen! Kan du skicka din logga + ev. önskemål så förbereder jag ett förslag? /Simon"

Templates stored as a constant array. Each template's `{name}` is replaced with the lead's first name before filling.

**File:** `src/pages/ClosingPage.tsx`

---

### 3. Auto-follow-up Edge Function

Create a new Edge Function `auto-followup-interested` that:
1. Queries leads with `status = 'interested'`, `has_replied = false`, `last_outbound_at` older than a configurable threshold (default 24h from settings key `followup_after_hours`)
2. Checks they haven't already received a follow-up (no outbound message in the last 24h)
3. Sends a nudge SMS via the existing `send-sms` pattern (direct Twilio API call)
4. Logs the message and updates `last_outbound_at`
5. Caps at 20 per run to avoid spam

Add a settings key `followup_template` for the nudge text, with a sensible default.

Add a toggle + config in `SettingsPage.tsx` to enable/disable auto-follow-up, set the delay hours, and customize the template.

**Files:**
- `supabase/functions/auto-followup-interested/index.ts` (new)
- `src/pages/SettingsPage.tsx` (add settings UI)

Schedule via pg_cron to run every 30 minutes.

---

### Technical Details

| Step | What | Where |
|------|------|-------|
| Time badges | `formatDistanceToNow(lead.last_outbound_at)` with color thresholds | ClosingPage lead list items |
| Sorting | Pinned first, then ascending `last_outbound_at` (nulls last) | `filtered` useMemo |
| Templates | Const array, `{name}` → `lead.name.split(' ')[0]` replacement | Above reply input |
| Edge function | Twilio direct API, service role key, loops max 20 leads | New function |
| Cron | `cron.schedule('auto-followup', '*/30 * * * *', ...)` | Via SQL insert |
| Settings | `followup_enabled`, `followup_after_hours`, `followup_template` | Settings table |

