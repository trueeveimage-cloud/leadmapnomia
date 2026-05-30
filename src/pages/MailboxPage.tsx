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

type SortKey = 'score' | 'score_asc' | 'rating' | 'reviews' | 'has_phone' | 'has_email' | 'followup' | 'recent' | 'name';

const SORT_LABELS: Record<SortKey, string> = {
  score: 'Highest potential',
  score_asc: 'Lowest potential',
  reviews: 'Most reviews',
  rating: 'Highest rating',
  has_phone: 'Has phone',
  has_email: 'Has email',
  followup: 'Needs follow-up',
  recent: 'Recently added',
  name: 'Name (A–Z)',
};

export default function MailboxPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [lead, setLead] = useState<Lead | null>(null);
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [messages, setMessages] = useState<GmailMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // Connected Gmail account
  const [senderEmail, setSenderEmail] = useState<string | null>(null);
  const [senderChecked, setSenderChecked] = useState(false);

  // Inbox view (inbound from any address)
  const [inboxMode, setInboxMode] = useState(false);
  const [inboxMsgs, setInboxMsgs] = useState<GmailMsg[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);

  // Compose state
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Fetch connected Gmail address once
  useEffect(() => {
    supabase.functions.invoke('gmail-profile', { body: {} }).then(({ data }) => {
      const d = data as any;
      if (d?.connected && d.emailAddress) setSenderEmail(d.emailAddress);
      setSenderChecked(true);
    }).catch(() => setSenderChecked(true));
  }, []);

  // Deep-link via ?email=
  useEffect(() => {
    const q = searchParams.get('email');
    if (q && q !== email) {
      setEmail(q);
      loadThread(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Lead search — empty query lists top leads by chosen sort, otherwise filters by name/email
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = search.trim();
      let query = supabase.from('leads').select('*');
      if (sortBy === 'has_phone') query = query.not('phone', 'is', null).neq('phone', '');
      else if (sortBy === 'has_email') query = query.not('email', 'is', null).neq('email', '');
      else if (sortBy === 'followup') query = query.eq('needs_call', true);
      else query = query.not('email', 'is', null).neq('email', '');
      if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
      switch (sortBy) {
        case 'rating': query = query.order('rating', { ascending: false, nullsFirst: false }); break;
        case 'reviews': query = query.order('reviews_count', { ascending: false, nullsFirst: false }); break;
        case 'score': query = query.order('potential_score', { ascending: false, nullsFirst: false }); break;
        case 'score_asc': query = query.order('potential_score', { ascending: true, nullsFirst: false }); break;
        case 'has_phone':
        case 'has_email': query = query.order('potential_score', { ascending: false, nullsFirst: false }); break;
        case 'followup': query = query.order('last_outbound_at', { ascending: true, nullsFirst: false }); break;
        case 'name': query = query.order('name', { ascending: true }); break;
        case 'recent':
        default: query = query.order('created_at', { ascending: false }); break;
      }
      const { data } = await query.limit(q ? 12 : 20);
      setLeadResults((data as Lead[]) || []);
    }, 200);
    return () => clearTimeout(t);
  }, [search, sortBy]);

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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Mailbox</h1>
            <span className="text-xs text-muted-foreground">— Gmail chat with any business</span>
          </div>
          <div className="flex items-center gap-2">
            {senderChecked && (
              senderEmail ? (
                <span className="text-[11px] px-2 py-1 rounded bg-green/10 text-green border border-green/30">
                  Sending from: <span className="font-medium">{senderEmail}</span>
                </span>
              ) : (
                <span className="text-[11px] px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/30">
                  Connect Gmail before sending
                </span>
              )
            )}
            <Button
              size="sm"
              variant={inboxMode ? 'default' : 'outline'}
              onClick={async () => {
                const next = !inboxMode;
                setInboxMode(next);
                if (next && inboxMsgs.length === 0) {
                  setInboxLoading(true);
                  try {
                    const { data } = await supabase.functions.invoke('gmail-thread', {
                      body: { email: 'in:inbox', max: 25 },
                    });
                    setInboxMsgs((data as any)?.messages || []);
                  } catch (e: any) {
                    toast.error('Failed to load inbox: ' + (e?.message || 'unknown'));
                  } finally { setInboxLoading(false); }
                }
              }}
              className="gap-1.5"
            >
              <Inbox className="h-3.5 w-3.5" />
              {inboxMode ? 'Hide inbox' : 'Show inbox replies'}
            </Button>
          </div>
        </div>

        {/* Inbox panel: recent incoming emails */}
        {inboxMode && (
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-2.5 border-b flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" /> Recent incoming emails
              </div>
              {inboxLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="max-h-[360px] overflow-y-auto divide-y">
              {!inboxLoading && inboxMsgs.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No incoming messages.</div>
              )}
              {inboxMsgs.filter(m => !m.labels?.includes('SENT')).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    // Extract email from "Name <email>"
                    const match = m.from?.match(/<([^>]+)>/) || m.from?.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
                    const addr = match?.[1] || m.from;
                    if (addr) { setEmail(addr); setInboxMode(false); loadThread(addr); }
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{m.subject || '(no subject)'}</div>
                    <div className="text-[11px] text-muted-foreground shrink-0">
                      {m.internalDate ? format(new Date(m.internalDate), 'MMM d, HH:mm') : ''}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">From: {m.from}</div>
                  <div className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{m.snippet}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recipient picker */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">Search lead</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="text-[11px] bg-transparent border border-border rounded px-1.5 py-0.5 text-muted-foreground focus:outline-none focus:border-primary"
                  title="Sort leads"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="pl-8"
                />
              </div>
              {leadResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto">
                  {leadResults.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => selectLead(l)}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">{l.name}</div>
                        <div className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {l.rating ? `★ ${l.rating}` : ''}
                          {l.reviews_count ? ` · ${l.reviews_count}` : ''}
                          {l.potential_score ? ` · ${l.potential_score}` : ''}
                        </div>
                      </div>
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
            <div className="text-sm font-medium flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" /> Send a manual email to {email}
              </span>
              {senderEmail && (
                <span className="text-[11px] text-muted-foreground font-normal">
                  From: <span className="text-foreground font-medium">{senderEmail}</span>
                </span>
              )}
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
            <div className="flex justify-end items-center gap-2">
              {senderChecked && !senderEmail && (
                <span className="text-xs text-destructive">Connect Gmail before sending.</span>
              )}
              <Button onClick={send} disabled={sending || !subject || !body || (senderChecked && !senderEmail)}>
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
