import { supabase } from "@/integrations/supabase/client";

export interface MessageLog {
  id: string;
  lead_id: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  provider: string;
  provider_message_sid: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  campaign_run_id: string | null;
  created_at: string;
}

export async function fetchMessagesForLead(leadId: string): Promise<MessageLog[]> {
  const { data, error } = await supabase
    .from('message_logs')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as MessageLog[];
}

export async function fetchInboxMessages(): Promise<(MessageLog & { lead_name?: string; lead_category?: string })[]> {
  const { data, error } = await supabase
    .from('message_logs')
    .select('*, leads!message_logs_lead_id_fkey(name, category)')
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map((m: any) => ({
    ...m,
    lead_name: m.leads?.name,
    lead_category: m.leads?.category,
  }));
}

export async function fetchRecentOutbound(campaignRunId?: string, limit = 50): Promise<MessageLog[]> {
  let query = supabase
    .from('message_logs')
    .select('*')
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (campaignRunId) {
    query = query.eq('campaign_run_id', campaignRunId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as MessageLog[];
}
