import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Link } from 'react-router-dom';
import { MessageCircle, Megaphone, Send, Inbox, Bell } from 'lucide-react';

export default function SmsOutreachPage() {
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto w-full px-5 py-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Nomia</div>
          <h1 className="text-2xl font-semibold text-foreground mt-1">SMS Outreach</h1>
          <p className="text-sm text-muted-foreground mt-1">Campaigns, quick sends, inbox, and callback workflow live under Nomia.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
            { to: '/quick-send', label: 'Quick Send', icon: Send },
            { to: '/inbox', label: 'Inbox', icon: Inbox },
            { to: '/callbacks', label: 'Callbacks', icon: Bell },
          ].map(item => (
            <Link key={item.to} to={item.to} className="border border-border bg-card rounded-lg p-4 hover:border-foreground/30 transition-colors">
              <item.icon size={18} className="text-foreground" />
              <div className="mt-3 font-medium text-foreground">{item.label}</div>
              <div className="text-xs text-muted-foreground mt-1">Open {item.label.toLowerCase()}</div>
            </Link>
          ))}
        </div>

        <div className="mt-5 border border-border bg-card rounded-lg p-4 flex items-start gap-3">
          <MessageCircle size={18} className="text-muted-foreground mt-0.5" />
          <div className="text-sm text-muted-foreground">
            SMS outreach uses the same outreach lock model: leads marked SMS sent or Do not contact should not be messaged again unless manually unlocked.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
