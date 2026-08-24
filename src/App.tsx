import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { CRMProvider } from "@/context/CRMContext";
import { ProductProvider, useProduct } from "@/context/ProductContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import OutreachTimerWidget from "@/components/OutreachTimerWidget";

// Eager: auth + small pages on critical path
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import WorkspaceChooserPage from "./pages/WorkspaceChooserPage";

// Lazy: everything else — splits bundle per route for faster initial load
const AddPage = lazy(() => import("./pages/AddPage"));
const BulkPage = lazy(() => import("./pages/BulkPage"));
const SectionPage = lazy(() => import("./pages/SectionPage"));
const ClosingPage = lazy(() => import("./pages/ClosingPage"));
const LeadmapClosingPage = lazy(() => import("./pages/LeadmapClosingPage"));
const EmailOutreachPage = lazy(() => import("./pages/EmailOutreachPage"));
const EmailResultsPage = lazy(() => import("./pages/EmailResultsPage"));
const PartnerAcquisitionPage = lazy(() => import("./pages/PartnerAcquisitionPage"));
const GBPContentLoopPage = lazy(() => import("./pages/GBPContentLoopPage"));
const SmsOutreachPage = lazy(() => import("./pages/SmsOutreachPage"));
const CallbacksPage = lazy(() => import("./pages/CallbacksPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const FinderRunPage = lazy(() => import("./pages/FinderRunPage"));
const FinderBatchPage = lazy(() => import("./pages/FinderBatchPage"));
const FinderCoveragePage = lazy(() => import("./pages/FinderCoveragePage"));
const CostCalculatorPage = lazy(() => import("./pages/CostCalculatorPage"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const CampaignNewPage = lazy(() => import("./pages/CampaignNewPage"));
const CampaignDetailPage = lazy(() => import("./pages/CampaignDetailPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const CallListPage = lazy(() => import("./pages/CallListPage"));
const NextLeadPage = lazy(() => import("./pages/NextLeadPage"));
const GuidePage = lazy(() => import("./pages/GuidePage"));
const CampaignStatsPage = lazy(() => import("./pages/CampaignStatsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AutomationPage = lazy(() => import("./pages/AutomationPage"));
const OutreachProgressPage = lazy(() => import("./pages/OutreachProgressPage"));
const AutomationRunsPage = lazy(() => import("./pages/AutomationRunsPage"));
const QuickSendPage = lazy(() => import("./pages/QuickSendPage"));
const HotLeadsPage = lazy(() => import("./pages/HotLeadsPage"));
const MailboxPage = lazy(() => import("./pages/MailboxPage"));
const EmailFinderPage = lazy(() => import("./pages/EmailFinderPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const NomiaDashboardPage = lazy(() => import("./pages/NomiaDashboardPage"));
const NomiaLeadsPage = lazy(() => import("./pages/NomiaLeadsPage"));
const NomiaCallsPage = lazy(() => import("./pages/NomiaCallsPage"));
const NomiaEmailPage = lazy(() => import("./pages/NomiaEmailPage"));
const NomiaPipelinePage = lazy(() => import("./pages/NomiaPipelinePage"));
const NomiaAnalyticsPage = lazy(() => import("./pages/NomiaAnalyticsPage"));
const NomiaSettingsPage = lazy(() => import("./pages/NomiaSettingsPage"));


const queryClient = new QueryClient();

// Load global scoring weights from settings on mount
function ScoringWeightsBootstrap() {
  useEffect(() => {
    import('@/lib/supabase').then(({ getSetting }) => {
      getSetting('scoring_weights').then((v) => {
        if (!v) return;
        try {
          const parsed = JSON.parse(v);
          import('@/lib/leadScoring').then(({ setScoringWeights }) => setScoringWeights(parsed));
        } catch {}
      });
    });
  }, []);
  return null;
}

// Global hotkeys + Easter egg
function GlobalHotkeys() {
  const navigate = useNavigate();
  useEffect(() => {
    // Konami code: ↑↑↓↓←→←→BA
    const konamiCode = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let konamiIndex = 0;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea';

      // Konami code detection
      if (e.key === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
          konamiIndex = 0;
          activateEasterEgg();
        }
      } else {
        konamiIndex = 0;
      }

      if (e.key === 'n' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigate('/nomia/leads');
      }
    };
    window.addEventListener('keydown', handler);

    // Easier easter egg: click the logo/title 7 times rapidly
    let clickCount = 0;
    let clickTimer: ReturnType<typeof setTimeout>;
    const logoHandler = () => {
      clickCount++;
      clearTimeout(clickTimer);
      if (clickCount >= 7) {
        clickCount = 0;
        activateEasterEgg();
      }
      clickTimer = setTimeout(() => { clickCount = 0; }, 2000);
    };
    // Attach to sidebar logo area
    setTimeout(() => {
      const logo = document.querySelector('[data-easter-egg]');
      if (logo) logo.addEventListener('click', logoHandler);
    }, 1000);

    return () => {
      window.removeEventListener('keydown', handler);
      clearTimeout(clickTimer);
    };
  }, [navigate]);
  return null;
}

function productForPath(pathname: string) {
  if (
    pathname.startsWith('/nomia')
    || pathname === '/nomia-crm'
    || pathname === '/next'
  ) return 'nomia' as const;

  if (
    pathname.startsWith('/leadmap')
    || pathname.startsWith('/automation')
    || pathname.startsWith('/outreach-progress')
    || pathname.startsWith('/automation-runs')
    || pathname.startsWith('/partners')
    || pathname.startsWith('/gbp-content')
    || pathname.startsWith('/lead-finder')
    || pathname.startsWith('/email-results')
    || pathname.startsWith('/email-finder')
    || pathname.startsWith('/finder')
    || pathname.startsWith('/cold-call')
    || pathname.startsWith('/ai-calls')
    || pathname === '/next-leadline'
  ) return 'leadmap' as const;

  return null;
}

function ProductRouteSync() {
  const { pathname } = useLocation();
  const { product, setProduct } = useProduct();

  useEffect(() => {
    const next = productForPath(pathname);
    if (next && next !== product) setProduct(next);
  }, [pathname, product, setProduct]);

  return null;
}

function activateEasterEgg() {
  const messages = [
    "💰 You're destined for greatness. Keep grinding.",
    "🚀 Every rejection is one step closer to a YES.",
    "👑 Champions aren't built in comfort zones.",
    "🔥 Your parents will be so proud. Don't stop.",
    "💎 Diamonds are made under pressure. You got this.",
    "⚡ The hustle is real. The results are coming.",
    "🦁 You didn't come this far to only come this far.",
    "🌟 Greatness takes time. Stay patient, stay hungry.",
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  document.body.style.transition = 'all 0.5s';
  document.body.style.filter = 'hue-rotate(180deg)';
  setTimeout(() => { document.body.style.filter = ''; }, 2000);
  
  // Show a nice toast-style overlay instead of alert
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid #0f3460;border-radius:20px;padding:40px 50px;text-align:center;font-size:24px;color:#e94560;font-weight:bold;box-shadow:0 0 60px rgba(233,69,96,0.3);animation:fadeIn 0.3s ease';
  overlay.textContent = msg;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.style.opacity = '0'; overlay.style.transition = 'opacity 0.5s'; }, 2500);
  setTimeout(() => overlay.remove(), 3000);
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Checking secure session...</div>;
  if (!user) return <AuthPage />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Sonner position="bottom-right" />
        <AuthProvider>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/*" element={
              <AuthGate>
                <CRMProvider>
                  <ProductProvider>
                  <ProductRouteSync />
                  <GlobalHotkeys />
                  <ScoringWeightsBootstrap />
                  <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">Loading…</div>}>
                    <Routes>
                      <Route path="/" element={<WorkspaceChooserPage />} />
                      <Route path="/dashboard" element={<Navigate to="/nomia/dashboard" replace />} />
                      <Route path="/nomia" element={<Navigate to="/nomia/dashboard" replace />} />
                      <Route path="/nomia/dashboard" element={<NomiaDashboardPage />} />
                      <Route path="/nomia/leads" element={<NomiaLeadsPage />} />
                      <Route path="/nomia/calls" element={<NomiaCallsPage />} />
                      <Route path="/nomia/email" element={<NomiaEmailPage />} />
                      <Route path="/nomia/inbox" element={<InboxPage />} />
                      <Route path="/nomia/pipeline" element={<NomiaPipelinePage />} />
                      <Route path="/nomia/analytics" element={<NomiaAnalyticsPage />} />
                      <Route path="/nomia/settings" element={<NomiaSettingsPage />} />
                      <Route path="/nomia/notifications" element={<NotificationsPage />} />
                      <Route path="/leadmap" element={<Navigate to="/leadmap/dashboard" replace />} />
                      <Route path="/leadmap/dashboard" element={<DashboardPage />} />
                      <Route path="/leadmap/leads" element={<SectionPage allSections product="leadmap" title="Leadmap CRM" showTriage emptyMessage="No Leadmap leads yet" />} />
                      <Route path="/leadmap/finder" element={<EmailFinderPage />} />
                      <Route path="/leadmap/automation" element={<AutomationPage />} />
                      <Route path="/leadmap/automation-runs" element={<AutomationRunsPage />} />
                      <Route path="/leadmap/email" element={<EmailOutreachPage />} />
                      <Route path="/leadmap/email-results" element={<EmailResultsPage />} />
                      <Route path="/leadmap/ai-calls" element={<CallListPage />} />
                      <Route path="/leadmap/outreach-progress" element={<OutreachProgressPage />} />
                      <Route path="/leadmap/partners" element={<PartnerAcquisitionPage />} />
                      <Route path="/leadmap/organic-growth" element={<GBPContentLoopPage />} />
                      <Route path="/leadmap/settings" element={<SettingsPage />} />
                      <Route path="/automation" element={<Navigate to="/leadmap/automation" replace />} />
                      <Route path="/outreach-progress" element={<Navigate to="/leadmap/outreach-progress" replace />} />
                      <Route path="/automation-runs" element={<Navigate to="/leadmap/automation-runs" replace />} />
                      <Route path="/notifications" element={<Navigate to="/nomia/notifications" replace />} />
                      <Route path="/hot-leads" element={<HotLeadsPage />} />
                      <Route path="/add" element={<AddPage />} />
                      <Route path="/bulk" element={<BulkPage />} />
                      <Route path="/unsorted" element={<SectionPage allSections product="all" title="All Leads" showTriage emptyMessage="No leads yet — add some!" />} />
                      <Route path="/phone" element={<SectionPage section="phone" title="Has Phone" emptyMessage="No phone leads yet" />} />
                      <Route path="/email" element={<SectionPage section="email" title="Has Email" emptyMessage="No email leads yet" />} />
                      <Route path="/gmail" element={<Navigate to="/email" replace />} />
                      <Route path="/both" element={<SectionPage section="both" title="Has Both" emptyMessage="No leads with both contact methods" />} />
                      <Route path="/missing" element={<SectionPage section="missing" title="Missing Contact" emptyMessage="No missing contact leads" />} />
                      <Route path="/status/has-website" element={<SectionPage optOut title="Has Website" emptyMessage="No leads with websites" />} />
                      <Route path="/callbacks" element={<CallbacksPage />} />
                      <Route path="/status/not-contacted" element={<SectionPage status="not_contacted" title="Not Contacted" excludeSection="missing" />} />
                      <Route path="/status/contacted" element={<SectionPage status="contacted" title="Contacted" />} />
                      <Route path="/status/answered" element={<SectionPage status="answered" title="Answered" />} />
                      <Route path="/status/callback" element={<SectionPage status="callback" title="Callback" />} />
                      <Route path="/status/interested" element={<ClosingPage status="interested" title="Interested" />} />
                      <Route path="/status/not-interested" element={<ClosingPage status="not_interested" title="Not Interested" />} />
                      <Route path="/status/unsure" element={<ClosingPage status="unsure" title="Unsure" />} />
                      <Route path="/status/demo" element={<ClosingPage status="demo" title="Demo" />} />
                      <Route path="/status/making-demo" element={<ClosingPage status="making_demo" title="Making Demo" />} />
                      <Route path="/status/closed-won" element={<ClosingPage status="closed_won" title="Closed Won" />} />
                      <Route path="/status/closed-lost" element={<ClosingPage status="closed_lost" title="Closed Lost" />} />
                      <Route path="/finder" element={<Navigate to="/lead-finder" replace />} />
                      <Route path="/leadmap/closing" element={<LeadmapClosingPage />} />
                      <Route path="/leadmap/email-outreach" element={<EmailOutreachPage />} />
                      <Route path="/email-results" element={<Navigate to="/leadmap/email-results" replace />} />
                      <Route path="/partners" element={<Navigate to="/leadmap/partners" replace />} />
                      <Route path="/gbp-content" element={<Navigate to="/leadmap/organic-growth" replace />} />
                      <Route path="/nomia/email-outreach" element={<Navigate to="/nomia/email" replace />} />
                      <Route path="/nomia/sms-outreach" element={<Navigate to="/nomia/inbox" replace />} />
                      <Route path="/nomia/closing" element={<Navigate to="/nomia/pipeline" replace />} />
                      <Route path="/cold-call" element={<NextLeadPage mode="leadline" />} />
                      <Route path="/ai-calls" element={<Navigate to="/leadmap/ai-calls" replace />} />
                      <Route path="/leadmap-crm" element={<Navigate to="/leadmap/leads" replace />} />
                      <Route path="/nomia-crm" element={<Navigate to="/nomia/leads" replace />} />
                      <Route path="/email-finder" element={<Navigate to="/leadmap/finder" replace />} />
                      <Route path="/lead-finder" element={<Navigate to="/leadmap/finder" replace />} />
                      <Route path="/finder/coverage" element={<FinderCoveragePage />} />
                      <Route path="/finder/runs/:id" element={<FinderRunPage />} />
                      <Route path="/finder/batch/:batchId" element={<FinderBatchPage />} />
                      <Route path="/costs" element={<CostCalculatorPage />} />
                      <Route path="/campaigns" element={<CampaignsPage />} />
                      <Route path="/campaigns/new" element={<CampaignNewPage />} />
                      <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
                      <Route path="/campaigns/compare" element={<CampaignStatsPage />} />
                      <Route path="/inbox" element={<Navigate to="/nomia/inbox" replace />} />
                      <Route path="/call-list" element={<Navigate to="/leadmap/ai-calls" replace />} />
                      <Route path="/next" element={<NextLeadPage mode="nomia" />} />
                      <Route path="/next-leadline" element={<NextLeadPage mode="leadline" />} />
                      <Route path="/quick-send" element={<QuickSendPage />} />
                      <Route path="/mailbox" element={<MailboxPage />} />
                      <Route path="/guide" element={<GuidePage />} />
                      <Route path="/settings" element={<Navigate to="/nomia/settings" replace />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                  <OutreachTimerWidget />
                  </ProductProvider>
                </CRMProvider>
              </AuthGate>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
