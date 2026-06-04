import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PhoneCall, ThumbsDown, Clock, Trophy, XCircle } from 'lucide-react';

export default function LeadmapClosingPage() {
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto w-full px-5 py-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leadmap AI</div>
          <h1 className="text-2xl font-semibold text-foreground mt-1">Leadmap Closing</h1>
          <p className="text-sm text-muted-foreground mt-1">Called leads by outcome: interested, follow-up, closed, lost, and do-not-contact.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: '/status/interested', label: 'Interested', icon: PhoneCall },
            { to: '/status/callback', label: 'Follow-up Needed', icon: Clock },
            { to: '/status/closed-won', label: 'Closed', icon: Trophy },
            { to: '/status/closed-lost', label: 'Lost', icon: XCircle },
            { to: '/status/not-interested', label: 'Not Interested', icon: ThumbsDown },
          ].map(item => (
            <Link key={item.to} to={item.to} className="border border-border bg-card rounded-lg p-4 hover:border-foreground/30 transition-colors">
              <item.icon size={18} className="text-foreground" />
              <div className="mt-3 font-medium text-foreground">{item.label}</div>
              <div className="text-xs text-muted-foreground mt-1">Review {item.label.toLowerCase()} leads</div>
            </Link>
          ))}
        </div>
        <Button asChild className="mt-5">
          <Link to="/cold-call">Open Cold Call</Link>
        </Button>
      </div>
    </AppLayout>
  );
}
