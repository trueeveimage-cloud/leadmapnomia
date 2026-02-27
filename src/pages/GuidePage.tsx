import AppLayout from "@/components/AppLayout";
import { Search, Phone, Mail, MessageSquare, PhoneCall, Users, Target, Zap, BarChart3, Settings, ArrowRight, Keyboard, Globe, Clock, CheckCircle2, XCircle, Calendar, Inbox, ListChecks, Rocket, Map, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  features: string[];
  path?: string;
  accent?: string;
}

function FeatureCard({ icon, title, description, features, path, accent = "primary" }: FeatureCardProps) {
  const navigate = useNavigate();
  const accentMap: Record<string, string> = {
    primary: "from-primary/20 to-primary/5 border-primary/20 hover:border-primary/40",
    green: "from-green/20 to-green/5 border-green/20 hover:border-green/40",
    amber: "from-amber/20 to-amber/5 border-amber/20 hover:border-amber/40",
    purple: "from-purple/20 to-purple/5 border-purple/20 hover:border-purple/40",
    cyan: "from-cyan/20 to-cyan/5 border-cyan/20 hover:border-cyan/40",
    red: "from-destructive/20 to-destructive/5 border-destructive/20 hover:border-destructive/40",
  };
  const iconMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    green: "text-green bg-green/10",
    amber: "text-amber bg-amber/10",
    purple: "text-purple bg-purple/10",
    cyan: "text-cyan bg-cyan/10",
    red: "text-destructive bg-destructive/10",
  };

  return (
    <div
      onClick={() => path && navigate(path)}
      className={`group relative rounded-xl border bg-gradient-to-br p-5 transition-all duration-300 ${accentMap[accent]} ${path ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start gap-4">
        <div className={`shrink-0 rounded-lg p-2.5 ${iconMap[accent]}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{title}</h3>
            {path && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
          <ul className="mt-3 space-y-1.5">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-secondary-foreground">
                <Zap className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FlowStep({ step, title, desc, active }: { step: number; title: string; desc: string; active?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
        {step}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-10 pb-16">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Rocket className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">How It All Works</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              Your complete outreach CRM — from finding leads to closing deals. Here's every feature and how they connect together.
            </p>
          </div>
        </div>

        {/* The Flow */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-5 flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            The Outreach Flow
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-4 rounded-lg bg-secondary/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Phase 1 · Find</p>
              <FlowStep step={1} title="Finder Search" desc="Search Google Maps for businesses by city + niche" active />
              <FlowStep step={2} title="Auto-Add" desc="Leads auto-import with phone, email, website" />
              <FlowStep step={3} title="Email Scrape" desc="Bulk scrape emails from lead websites" />
            </div>
            <div className="space-y-4 rounded-lg bg-secondary/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber">Phase 2 · Reach</p>
              <FlowStep step={4} title="Campaign SMS" desc="Send SMS to 07-numbers via Twilio" active />
              <FlowStep step={5} title="Wait for Reply" desc="Auto-track delivery + inbound replies" />
              <FlowStep step={6} title="Auto Call List" desc="No reply after 48h → moved to call list" />
            </div>
            <div className="space-y-4 rounded-lg bg-secondary/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-green">Phase 3 · Close</p>
              <FlowStep step={7} title="Call / Follow Up" desc="Call leads, log outcomes, schedule callbacks" active />
              <FlowStep step={8} title="Status Pipeline" desc="Track: Interested → Demo → Closed Won" />
              <FlowStep step={9} title="Won!" desc="Deal closed, lead moves to Closed / Won 🎉" />
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Every Page Explained
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard
              icon={<Search className="h-5 w-5" />}
              title="Finder"
              description="Search Google Maps for businesses by city, keywords and niche. Run batch searches across multiple cities at once."
              features={[
                "Search by city + keywords (e.g. 'Frisör Stockholm')",
                "Batch mode: run across 10+ cities simultaneously",
                "Auto-filters: min rating, min reviews, require phone",
                "Coverage map shows which cities you've searched",
                "Auto-adds leads to your CRM when search completes",
              ]}
              path="/finder"
              accent="cyan"
            />

            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title="Unsorted Inbox"
              description="All newly found leads land here. Categorized by what contact info they have — Phone, Email, Both, or Missing."
              features={[
                "Sub-sections: Phone, Email, Both, Missing",
                "Quick triage: assign status in one click",
                "Bulk actions for fast processing",
                "Click any lead to see full detail panel",
              ]}
              path="/unsorted"
              accent="primary"
            />

            <FeatureCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="Campaigns"
              description="Build targeted SMS campaigns with templates, audience filters, and safety caps. Send real SMS via Twilio."
              features={[
                "Audience filter: by section, rating, website, reviews",
                "Template variables: {name}, {category}, {city}",
                "Safety: daily cap, batch cap, cooldown days",
                "Only sends to mobile numbers (07...)",
                "Landlines skip SMS → go straight to call list",
              ]}
              path="/campaigns"
              accent="purple"
            />

            <FeatureCard
              icon={<Inbox className="h-5 w-5" />}
              title="Inbox"
              description="All inbound SMS replies appear here. Quick-action buttons let you triage each reply instantly."
              features={[
                "Real-time inbound via Twilio webhook",
                "One-click: Interested, Not Interested, Callback",
                "Auto-detects opt-out keywords (stop, avsluta)",
                "Shows lead name + message preview",
              ]}
              path="/inbox"
              accent="green"
            />

            <FeatureCard
              icon={<PhoneCall className="h-5 w-5" />}
              title="Call List"
              description="Leads who need a phone call — either landlines that can't receive SMS or leads who didn't reply."
              features={[
                "Auto-populated: landlines + no-reply leads",
                "Cron job checks every 30 min for non-repliers",
                "Log outcome: Answered, No Answer, Busy, Wrong #",
                "Auto-reschedule: No Answer → tomorrow, Busy → 3h",
              ]}
              path="/call-list"
              accent="amber"
            />

            <FeatureCard
              icon={<Zap className="h-5 w-5" />}
              title="Next Lead"
              description="Your power-dial page. Fetches the highest-priority lead and walks you through the call workflow step by step."
              features={[
                "Priority: overdue callbacks → needs call → uncontacted",
                "One-tap call on mobile (opens dialer)",
                "Desktop: copy number + log outcome",
                "Quick followup presets: 1h, 3h, tomorrow, 2 days",
                "Keyboard shortcut: press N from anywhere",
              ]}
              path="/next"
              accent="primary"
            />

            <FeatureCard
              icon={<Calendar className="h-5 w-5" />}
              title="Callbacks"
              description="Scheduled follow-ups with precise dates and times. Overdue callbacks are highlighted."
              features={[
                "Sorted by next action date",
                "Overdue items highlighted in red",
                "Set exact date + time for follow-up",
                "One-click to call when it's time",
              ]}
              path="/callbacks"
              accent="amber"
            />

            <FeatureCard
              icon={<ListChecks className="h-5 w-5" />}
              title="Status Pipeline"
              description="Track every lead through the sales funnel with dedicated pages for each status."
              features={[
                "Not Contacted → Contacted → Answered",
                "Interested → Demo → Closed Won 🎉",
                "Not Interested / Unsure / Closed Lost",
                "Each status has its own filtered page",
              ]}
              path="/status/not-contacted"
              accent="green"
            />

            <FeatureCard
              icon={<Globe className="h-5 w-5" />}
              title="Coverage Map"
              description="Visual map showing which cities you've already searched, helping you avoid duplicates and find new areas."
              features={[
                "Interactive Sweden map with city markers",
                "Color-coded by search completeness",
                "Click a city to see its search history",
              ]}
              path="/finder/coverage"
              accent="cyan"
            />

            <FeatureCard
              icon={<Settings className="h-5 w-5" />}
              title="Settings"
              description="Configure defaults, API keys, and run bulk operations on your data."
              features={[
                "Outreach defaults: caps, cooldown, call-after hours",
                "Finder defaults: city, keywords, leads target",
                "Bulk email scrape: find emails from websites",
                "Export all leads to CSV",
                "Keyboard shortcuts reference",
              ]}
              path="/settings"
              accent="primary"
            />
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Keyboard Shortcuts
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: "N", desc: "Open Next Lead" },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2">
                <kbd className="inline-flex h-7 w-7 items-center justify-center rounded bg-muted text-xs font-mono font-bold text-foreground border border-border">
                  {key}
                </kbd>
                <span className="text-sm text-secondary-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SMS Flow Diagram */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            SMS Outreach Flow
          </h2>
          <div className="space-y-3 text-sm font-mono text-muted-foreground bg-secondary/30 rounded-lg p-4 overflow-x-auto">
            <p><span className="text-primary">Campaign</span> → Send Batch clicked</p>
            <p className="pl-4">├─ Phone starts with <span className="text-green">07</span> → <span className="text-green">SMS sent via Twilio</span></p>
            <p className="pl-4">│&nbsp;&nbsp; ├─ Lead replies → <span className="text-green">Inbox</span> → pick status</p>
            <p className="pl-4">│&nbsp;&nbsp; └─ No reply (48h) → <span className="text-amber">Call List</span> (auto)</p>
            <p className="pl-4">└─ Landline (08, 031...) → <span className="text-amber">Call List</span> (immediate)</p>
            <p className="mt-2"><span className="text-amber">Call List</span> → You call → pick outcome:</p>
            <p className="pl-4">├─ <span className="text-green">Answered</span> → pick status (Interested / Demo / etc.)</p>
            <p className="pl-4">├─ <span className="text-amber">No Answer</span> → reschedule tomorrow</p>
            <p className="pl-4">├─ <span className="text-amber">Busy</span> → reschedule +3 hours</p>
            <p className="pl-4">├─ <span className="text-purple">Callback</span> → pick date/time</p>
            <p className="pl-4">└─ <span className="text-destructive">Wrong #</span> → removed</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
