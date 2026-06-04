export const BUSINESSES = {
  leadmap: 'Leadmap AI',
  nomia: 'Nomia',
} as const;

export const OUTREACH_STATE_LABELS = {
  not_contacted: 'Not contacted',
  email_sent: 'Email sent',
  sms_sent: 'SMS sent',
  called: 'Called',
  replied: 'Replied',
  follow_up_needed: 'Follow-up needed',
  closed: 'Closed',
  lost: 'Lost',
  do_not_contact: 'Do not contact',
} as const;

export const CALL_STATUSES = [
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
  'Error',
] as const;

export const RETELL_ENDPOINTS = {
  startCall: '/api/retell/start-call',
  webhook: '/api/webhooks/retell',
} as const;

export type OutreachState = keyof typeof OUTREACH_STATE_LABELS;
export type CallStatus = typeof CALL_STATUSES[number];
