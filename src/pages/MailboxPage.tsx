import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Send, Search, Loader2, RefreshCw, Inbox, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Lead } from '@/lib/supabase';

interface GmailMsg {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  internalDate: number;
  snippet: string;
  body: string;
  labels: string[];
}

export default function MailboxPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [lead, setLead] = useState<Lead | null>(null);
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<GmailMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // Compose state
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Deep-link via ?email=
  useEffect(() => {
    const q = searchParams.get('email');
    if (q && q !== email) {
      setEmail(q);
      loadThread(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Lead search
  useEffect(() => {
    if (!search.trim()) { setLeadResults([]); return; }
    const t = setTimeout(async () => {
      const q = search.trim();
      const { data } = await supabase
        .from('leads')
        .select('*')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .not('email', 'is', null)
        .limit(8);
      setLeadResults((data as Lead[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadThread = async (targetEmail: string, pageToken?: string) => {
    if (!targetEmail) return;
    const isFirstPage = !pageToken;
    if (isFirstPage) { setLoading(true); setMessages([]); setNextPageToken(null); }
    else setLoadingMore(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-thread', {
        body: { email: targetEmail, max: 10, pageToken },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(JSON.stringify((data as any).error));
      const newMsgs = (data as any).messages || [];
      setMessages((prev) => {
        const combined = isFirstPage ? newMsgs : [...prev, ...newMsgs];
        // dedupe by id, keep newest-first sort
        const seen = new Set<string>();
        return combined.filter((m: GmailMsg) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
          .sort((a: GmailMsg, b: GmailMsg) => b.internalDate - a.internalDate);
      });
      setNextPageToken((data as any).nextPageToken || null);
    } catch (e: any) {
      toast.error('Failed to load Gmail thread: ' + (e?.message || 'unknown'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !nextPageToken || loadingMore || loading) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && nextPageToken && !loadingMore) {
        loadThread(email, nextPageToken);
      }
    }, { root: scrollRef.current, rootMargin: '100px' });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPageToken, loadingMore, loading, email]);

  const selectLead = (l: Lead) => {
    setLead(l);
    setEmail(l.email || '');
    setSearch('');
    setLeadResults([]);
    if (l.email) loadThread(l.email);
  };

  const handleManualLoad = () => {
    setLead(null);
    if (email) loadThread(email);
  };

  const send = async () => {
    if (!email || !subject || !body) { toast.error('Fill in recipient, subject and body'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-gmail', {
        body: { leadId: lead?.id, to: email, subject, body },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.skipped) toast.message('Skipped: ' + d.reason);
      else if (d?.success) {
        toast.success('Email sent');
        setSubject(''); setBody('');
        setTimeout(() => loadThread(email), 1500);
      } else {
        toast.error('Send failed');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setSending(false);
    }
  };

  const isFromMe = (m: GmailMsg) => m.labels?.includes('SENT');

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Mailbox</h1>
          <span className="text-xs text-muted-foreground">— manual Gmail chat with any business</span>
        </div>

        {/* Recipient picker */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="relative">
              <label className="text-xs font-medium text-muted-foreground">Search lead</label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="pl-8"
                />
              </div>
              {leadResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
                  {leadResults.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => selectLead(l)}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                    >
                      <div className="font-medium truncate">{l.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{l.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Or enter email directly</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="business@example.com"
                  type="email"
                />
                <Button variant="outline" onClick={handleManualLoad} disabled={!email || loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Inbox className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {lead && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
              Linked to lead: <span className="font-medium text-foreground">{lead.name}</span> · {lead.email}
            </div>
          )}
        </div>

        {/* Conversation thread */}
        {email && (
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <div className="text-sm font-medium flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                Conversation with {email}
                <span className="text-xs text-muted-foreground">({messages.length} messages)</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => loadThread(email)} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div ref={scrollRef} className="max-h-[420px] overflow-y-auto divide-y">
              {loading && messages.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading thread…</div>
              )}
              {!loading && messages.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">No emails found with this address.</div>
              )}
              {messages.map((m) => {
                const sent = isFromMe(m);
                const isExp = !!expanded[m.id];
                return (
                  <div key={m.id} className={`px-4 py-3 ${sent ? 'bg-primary/5' : ''}`}>
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [m.id]: !p[m.id] }))}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 ${sent ? 'text-primary' : 'text-muted-foreground'}`}>
                          {sent ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium truncate">{m.subject || '(no subject)'}</div>
                            <div className="text-[11px] text-muted-foreground shrink-0">
                              {m.internalDate ? format(new Date(m.internalDate), 'MMM d, HH:mm') : ''}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {sent ? `To: ${m.to}` : `From: ${m.from}`}
                          </div>
                          {!isExp && <div className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{m.snippet}</div>}
                        </div>
                      </div>
                    </button>
                    {isExp && (
                      <div className="mt-2 pl-5 text-sm whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-80 overflow-y-auto">
                        {m.body || m.snippet || '(no body)'}
                      </div>
                    )}
                  </div>
                );
              })}
              {nextPageToken && messages.length > 0 && (
                <div ref={sentinelRef} className="p-3 text-center">
                  {loadingMore ? (
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading more…
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => loadThread(email, nextPageToken)} className="text-xs">
                      Load more
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manual compose */}
        {email && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="text-sm font-medium flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" /> Send a manual email to {email}
            </div>
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              placeholder="Write your message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <div className="flex justify-end">
              <Button onClick={send} disabled={sending || !subject || !body}>
                {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Send email
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
