import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Send, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function QuickSendPage() {
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<{ phone: string; body: string; time: string; ok: boolean }[]>([]);

  const handleSend = async () => {
    const cleanPhone = phone.trim();
    const cleanBody = body.trim();
    if (!cleanPhone || !cleanBody) {
      toast.error('Enter both phone number and message');
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ phone: cleanPhone, body: cleanBody }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      toast.success('SMS sent!');
      setHistory(prev => [{ phone: cleanPhone, body: cleanBody, time: new Date().toLocaleTimeString(), ok: true }, ...prev]);
      setBody('');
    } catch (e: any) {
      toast.error(e.message);
      setHistory(prev => [{ phone: cleanPhone, body: cleanBody, time: new Date().toLocaleTimeString(), ok: false }, ...prev]);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto pt-10 px-4">
        <div className="flex items-center gap-2 mb-6">
          <MessageCircle size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-foreground">Quick Send SMS</h1>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone number</label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+46701234567"
              className="bg-muted border-border"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Message</label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={4}
              className="bg-muted border-border"
            />
            <div className="text-[10px] text-muted-foreground mt-1 text-right">{body.length} chars</div>
          </div>
          <Button onClick={handleSend} disabled={sending || !phone.trim() || !body.trim()} className="w-full gap-2">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send SMS
          </Button>
        </div>

        {history.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Sent this session</h3>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className={`text-xs p-3 rounded-lg border ${h.ok ? 'bg-card border-border' : 'bg-destructive/5 border-destructive/20'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-foreground">{h.phone}</span>
                    <span className="text-muted-foreground">{h.time}</span>
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap">{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
