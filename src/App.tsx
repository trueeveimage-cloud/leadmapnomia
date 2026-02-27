import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CRMProvider } from "@/context/CRMContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AddPage from "./pages/AddPage";
import BulkPage from "./pages/BulkPage";
import SectionPage from "./pages/SectionPage";
import CallbacksPage from "./pages/CallbacksPage";
import SettingsPage from "./pages/SettingsPage";
import FinderPage from "./pages/FinderPage";
import FinderRunPage from "./pages/FinderRunPage";
import FinderBatchPage from "./pages/FinderBatchPage";
import FinderCoveragePage from "./pages/FinderCoveragePage";
import CostCalculatorPage from "./pages/CostCalculatorPage";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import CampaignsPage from "./pages/CampaignsPage";
import CampaignNewPage from "./pages/CampaignNewPage";
import CampaignDetailPage from "./pages/CampaignDetailPage";
import InboxPage from "./pages/InboxPage";
import CallListPage from "./pages/CallListPage";
import NextLeadPage from "./pages/NextLeadPage";
import NotFound from "./pages/NotFound";
import GuidePage from "./pages/GuidePage";
import DashboardPage from "./pages/DashboardPage";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const queryClient = new QueryClient();

// Global hotkeys
function GlobalHotkeys() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea';
      if (e.key === 'n' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigate('/next');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">Loading...</div>;
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
                  <GlobalHotkeys />
                  <Routes>
                    <Route path="/" element={<Navigate to="/unsorted" replace />} />
                    <Route path="/add" element={<AddPage />} />
                    <Route path="/bulk" element={<BulkPage />} />
                    <Route path="/unsorted" element={<SectionPage allSections title="Unsorted Inbox" showTriage emptyMessage="No unsorted leads — add some above!" />} />
                    <Route path="/phone" element={<SectionPage section="phone" title="Has Phone" emptyMessage="No phone leads yet" />} />
                    <Route path="/email" element={<SectionPage section="email" title="Has Email" emptyMessage="No email leads yet" />} />
                    <Route path="/gmail" element={<Navigate to="/email" replace />} />
                    <Route path="/both" element={<SectionPage section="both" title="Has Both" emptyMessage="No leads with both contact methods" />} />
                    <Route path="/missing" element={<SectionPage section="missing" title="Missing Contact" emptyMessage="No missing contact leads" />} />
                    <Route path="/callbacks" element={<CallbacksPage />} />
                    <Route path="/status/not-contacted" element={<SectionPage status="not_contacted" title="Not Contacted" excludeSection="missing" />} />
                    <Route path="/status/contacted" element={<SectionPage status="contacted" title="Contacted" />} />
                    <Route path="/status/answered" element={<SectionPage status="answered" title="Answered" />} />
                    <Route path="/status/callback" element={<SectionPage status="callback" title="Callback" />} />
                    <Route path="/status/interested" element={<SectionPage status="interested" title="Interested" />} />
                    <Route path="/status/not-interested" element={<SectionPage status="not_interested" title="Not Interested" />} />
                    <Route path="/status/unsure" element={<SectionPage status="unsure" title="Unsure" />} />
                    <Route path="/status/demo" element={<SectionPage status="demo" title="Demo" />} />
                    <Route path="/status/closed-won" element={<SectionPage status="closed_won" title="Closed / Won" />} />
                    <Route path="/status/closed-lost" element={<SectionPage status="closed_lost" title="Closed / Lost" />} />
                    <Route path="/finder" element={<FinderPage />} />
                    <Route path="/finder/coverage" element={<FinderCoveragePage />} />
                    <Route path="/finder/runs/:id" element={<FinderRunPage />} />
                    <Route path="/finder/batch/:batchId" element={<FinderBatchPage />} />
                    <Route path="/costs" element={<CostCalculatorPage />} />
                    <Route path="/campaigns" element={<CampaignsPage />} />
                    <Route path="/campaigns/new" element={<CampaignNewPage />} />
                    <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
                    <Route path="/inbox" element={<InboxPage />} />
                    <Route path="/call-list" element={<CallListPage />} />
                    <Route path="/next" element={<NextLeadPage />} />
                    <Route path="/guide" element={<GuidePage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
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
