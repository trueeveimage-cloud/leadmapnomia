import { describe, expect, it } from 'vitest';
import { getNomiaPipelineStage, isDoNotContact, isSwedishLead, renderNomiaTemplate } from '../lib/nomiaWorkspace';

describe('Nomia workspace rules', () => {
  it('recognizes Sweden from explicit country or phone', () => {
    expect(isSwedishLead({ country: 'SE' })).toBe(true);
    expect(isSwedishLead({ phone_e164: '+46701234567' })).toBe(true);
    expect(isSwedishLead({ country: 'UK', phone_e164: '+447700900123' })).toBe(false);
  });

  it('treats every shared do-not-contact signal as blocked', () => {
    expect(isDoNotContact({ do_not_contact: true })).toBe(true);
    expect(isDoNotContact({ outreach_opt_out: true })).toBe(true);
    expect(isDoNotContact({ outreach_state: 'do_not_contact' })).toBe(true);
    expect(isDoNotContact({ call_status: 'Do not contact' })).toBe(true);
  });

  it('uses appointments for meeting stage without adding a new lead status', () => {
    expect(getNomiaPipelineStage({ status: 'interested' }, true)).toBe('meeting_booked');
    expect(getNomiaPipelineStage({ status: 'making_demo' }, true)).toBe('proposal');
    expect(getNomiaPipelineStage({ status: 'closed_won' }, true)).toBe('won');
  });

  it('keeps lost and do-not-contact leads out of active stages', () => {
    expect(getNomiaPipelineStage({ status: 'closed_lost' })).toBe('lost');
    expect(getNomiaPipelineStage({ status: 'not_contacted', do_not_contact: true })).toBe('lost');
  });

  it('renders only the supported Gmail variables', () => {
    const rendered = renderNomiaTemplate('Hej {{owner_name}} at {{business_name}} in {{city}}', {
      name: 'Acme AB', owner_name: 'Anna', city: 'Malmo',
    });
    expect(rendered).toBe('Hej Anna at Acme AB in Malmo');
  });
});
