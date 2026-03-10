import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { fetchCampaigns, Campaign } from '@/lib/campaigns';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy, MessageSquare, Phone } from 'lucide-react';

interface CampaignPerf {
  name: string;
  sent: number;
  delivered: number;
  replied: number;
  replyRate: number;
  deliveryRate: number;
  template: string;
}

export default function CampaignStatsPage() {
  const [data, setData] = useState<CampaignPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Fetch active campaigns
        const campaigns = await fetchCampaigns();
        const campaignMap = new Map(campaigns.map(c => [c.id, c]));

        // Also fetch ALL campaign_runs (including from deleted campaigns)
        const { data: allRuns } = await supabase
          .from('campaign_runs')
          .select('id, campaign_id, stats');

        // Group runs by campaign_id
        const runsByCampaign = new Map<string, typeof allRuns>();
        for (const r of (allRuns || [])) {
          const arr = runsByCampaign.get(r.campaign_id) || [];
          arr.push(r);
          runsByCampaign.set(r.campaign_id, arr);
        }

        // For deleted campaigns, fetch their name/template from campaign_runs stats or use fallback
        // Get unique campaign IDs (includes deleted ones)
        const allCampaignIds = [...runsByCampaign.keys()];

        // Fetch deleted campaigns info directly
        const { data: allCampaignsRaw } = await supabase
          .from('campaigns')
          .select('id, name, template_text')
          .in('id', allCampaignIds);
        const allCampaignsMap = new Map((allCampaignsRaw || []).map(c => [c.id, c]));

        const perfs: CampaignPerf[] = [];
        
        for (const campId of allCampaignIds) {
          const runs = runsByCampaign.get(campId) || [];
          const campInfo = allCampaignsMap.get(campId) || campaignMap.get(campId);
          
          const runIds = runs.map(r => r.id);
          let sent = 0, delivered = 0, replied = 0;
          
          for (const r of runs) {
            const s = r.stats as any;
            sent += s?.sent || 0;
          }

          if (sent === 0) continue; // Skip campaigns with no sends

          if (runIds.length > 0) {
            const { count: deliveredCount } = await supabase
              .from('message_logs')
              .select('id', { count: 'exact', head: true })
              .in('campaign_run_id', runIds)
              .eq('status', 'delivered');
            delivered = deliveredCount || 0;

            const { data: msgLeads } = await supabase
              .from('message_logs')
              .select('lead_id')
              .in('campaign_run_id', runIds)
              .eq('direction', 'outbound');
            
            const leadIds = [...new Set((msgLeads || []).map(m => m.lead_id))];
            if (leadIds.length > 0) {
              const { count: repliedCount } = await supabase
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .in('id', leadIds)
                .eq('has_replied', true);
              replied = repliedCount || 0;
            }
          }
          
          perfs.push({
            name: campInfo?.name || `Deleted Campaign`,
            sent,
            delivered,
            replied,
            replyRate: sent > 0 ? (replied / sent) * 100 : 0,
            deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
            template: campInfo?.template_text || '(template unavailable)',
          });
        }
        
        setData(perfs.sort((a, b) => b.replyRate - a.replyRate));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const bestTemplate = data.length > 0 ? data[0] : null;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <Link to="/campaigns" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mb-4">
          <ArrowLeft size={12} /> Back to campaigns
        </Link>

        <h1 className="text-xl font-bold text-foreground mb-1 flex items-center gap-2">
          <Trophy size={20} className="text-primary" /> A/B Template Comparison
        </h1>
        <p className="text-sm text-muted-foreground mb-6">Compare which SMS template gets the most replies</p>

        {loading ? (
          <p className="text-sm text-muted-foreground py-20 text-center">Loading stats...</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-20 text-center">No campaigns yet</p>
        ) : (
          <>
            {/* Winner banner */}
            {bestTemplate && bestTemplate.sent > 0 && (
              <div className="bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={16} className="text-green-400" />
                  <span className="text-sm font-semibold text-foreground">Best Performing: {bestTemplate.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                    {bestTemplate.replyRate.toFixed(1)}% reply rate
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate">{bestTemplate.template}</p>
              </div>
            )}

            {/* Chart */}
            <div className="bg-card border border-border rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Reply Rate Comparison</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(215, 15%, 50%)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(215, 15%, 50%)' }} />
                  <Tooltip contentStyle={{ background: 'hsl(222, 24%, 10%)', border: '1px solid hsl(222, 22%, 16%)', borderRadius: 8, fontSize: 12 }} />
                  <Legend />
                  <Bar dataKey="sent" name="Sent" fill="hsl(213, 94%, 58%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delivered" name="Delivered" fill="hsl(142, 69%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="replied" name="Replied" fill="hsl(262, 83%, 65%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="space-y-3">
              {data.map((c, i) => (
                <div key={i} className={`bg-card border rounded-lg p-4 ${i === 0 && c.sent > 0 ? 'border-green-500/30' : 'border-border'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {i === 0 && c.sent > 0 && <Trophy size={14} className="text-green-400" />}
                      <h3 className="font-medium text-foreground text-sm">{c.name}</h3>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-muted-foreground">
                        <MessageSquare size={11} className="inline mr-0.5" /> {c.sent} sent
                      </span>
                      <span style={{ color: 'hsl(142 69% 45%)' }}>
                        {c.deliveryRate.toFixed(0)}% delivered
                      </span>
                      <span className="font-bold" style={{ color: 'hsl(262 83% 65%)' }}>
                        {c.replyRate.toFixed(1)}% reply rate
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono bg-muted rounded p-2">{c.template || 'No template'}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
