alter table public.leads
  drop constraint if exists leads_outreach_state_check;

alter table public.leads
  add constraint leads_outreach_state_check
  check (outreach_state in (
    'not_contacted',
    'email_sent',
    'sms_sent',
    'called',
    'replied',
    'follow_up_needed',
    'closed',
    'lost',
    'do_not_contact'
  )) not valid;

alter table public.leads
  drop constraint if exists leads_call_status_check;

alter table public.leads
  add constraint leads_call_status_check
  check (call_status in (
    'New',
    'Approved for AI call',
    'Calling',
    'No answer',
    'Not interested',
    'Interested',
    'Demo requested',
    'Meeting requested',
    'Demo sent',
    'Closed',
    'Lost',
    'Do not contact',
    'Error'
  )) not valid;

comment on column public.leads.outreach_state is
  'Shared outreach lock state. UI labels: Not contacted, Email sent, SMS sent, Called, Replied, Follow-up needed, Closed, Lost, Do not contact.';

comment on column public.leads.call_status is
  'Shared Retell/phone call status. Exact allowed values match the Leadmap AI and Retell task contract.';

comment on function public.acquire_outreach_lock(uuid, text, boolean) is
  'Single backend/database lock gate for Gmail, SMS, manual calls, and Retell AI calls.';
