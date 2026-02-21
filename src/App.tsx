import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CRMProvider } from "@/context/CRMContext";
import AddPage from "./pages/AddPage";
import BulkPage from "./pages/BulkPage";
import SectionPage from "./pages/SectionPage";
import CallbacksPage from "./pages/CallbacksPage";
import SettingsPage from "./pages/SettingsPage";
import FinderPage from "./pages/FinderPage";
import FinderRunPage from "./pages/FinderRunPage";
import CostCalculatorPage from "./pages/CostCalculatorPage";
import NotFound from "./pages/NotFound";
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
        navigate('/add');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Sonner position="bottom-right" />
        <CRMProvider>
          <GlobalHotkeys />
          <Routes>
            <Route path="/" element={<Navigate to="/unsorted" replace />} />
            <Route path="/add" element={<AddPage />} />
            <Route path="/bulk" element={<BulkPage />} />
            <Route path="/unsorted" element={<SectionPage allSections title="Unsorted Inbox" showTriage emptyMessage="No unsorted leads — add some above!" />} />
            <Route path="/phone" element={<SectionPage section="phone" title="Has Phone" emptyMessage="No phone leads yet" />} />
            <Route path="/gmail" element={<SectionPage section="gmail" title="Has Gmail" emptyMessage="No Gmail leads yet" />} />
            <Route path="/email" element={<SectionPage section="email" title="Has Email" emptyMessage="No email leads yet" />} />
            <Route path="/both" element={<SectionPage section="both" title="Has Both" emptyMessage="No leads with both contact methods" />} />
            <Route path="/missing" element={<SectionPage section="missing" title="Missing Contact" emptyMessage="No missing contact leads" />} />
            <Route path="/callbacks" element={<CallbacksPage />} />
            <Route path="/status/not-contacted" element={<SectionPage status="not_contacted" title="Not Contacted" />} />
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
            <Route path="/finder/runs/:id" element={<FinderRunPage />} />
            <Route path="/costs" element={<CostCalculatorPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </CRMProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
