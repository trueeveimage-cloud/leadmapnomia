import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { fetchCampaigns, Campaign, deleteCampaign } from '@/lib/campaigns';
import { Link } from 'react-router-dom';
import { Plus, Play, Pause, Copy, Trash2, Megaphone, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { InfoTip } from '@/components/InfoTip';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setCampaigns(await fetchCampaigns()); }
    catch { toast.error('Failed to load campaigns'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign?')) return;
    await deleteCampaign(id);
    setCampaigns(c => c.filter(x => x.id !== id));
    toast.success('Campaign deleted');
  };

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    running: 'bg-green/15 text-green',
    paused: 'bg-amber/15 text-amber',
    completed: 'bg-primary/15 text-primary',
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Megaphone size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
            <InfoTip text="SMS outreach campaigns. Create audience filters, message templates, and send in batches." />
          </div>
          <Link to="/campaigns/new">
            <Button className="gap-2 h-8 text-sm"><Plus size={14} /> New Campaign</Button>
          </Link>
        </div>

        {/* Twilio banner */}
        <div className="bg-amber/10 border border-amber/30 rounded-lg p-3 mb-6 flex items-center gap-2 text-xs text-amber">
          <AlertTriangle size={14} />
          <span>Twilio not connected — campaigns use mock provider. Go to <Link to="/settings" className="underline">Settings</Link> to connect.</span>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-20 text-center">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No campaigns yet</p>
            <Link to="/campaigns/new"><Button variant="outline" className="mt-3 gap-2 text-sm h-8"><Plus size={13} /> Create your first campaign</Button></Link>
          </div>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => (
              <Link
                key={c.id}
                to={`/campaigns/${c.id}`}
                className="block bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-foreground text-sm">{c.name}</h3>
                    <span className={`status-pill text-[10px] ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.preventDefault()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                      <Trash2 size={13} className="text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground flex gap-4">
                  <span>Cap: {c.daily_cap}/day, {c.batch_cap}/batch</span>
                  <span>Cooldown: {c.cooldown_days}d</span>
                  <span>Call after: {c.call_after_hours}h</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground truncate max-w-lg">
                  {c.template_text || 'No template set'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
