import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { fetchLeadCounts } from '@/lib/supabase';
import { supabase } from '@/integrations/supabase/client';

interface Counts {
  total: number;
  unsorted: number;
  phone: number;
  email: number;
  both: number;
  missing: number;
  hasWebsite: number;
  callbacks: number;
  callbacksDue: number;
  not_contacted: number;
  contacted: number;
  answered: number;
  interested: number;
  not_interested: number;
  unsure: number;
  demo: number;
  making_demo: number;
  closed_won: number;
  closed_lost: number;
}

export interface ImportResult {
  url: string;
  status: 'added' | 'duplicate' | 'failed';
  name?: string;
  reason?: string;
}

interface BulkImportState {
  text: string;
  loading: boolean;
  progress: number;
  total: number;
  results: ImportResult[];
  stopped: boolean;
}

interface Notifications {
  batchReady: boolean;
  unreadInbox: number;
  unreadHistory: number;
}

interface CRMContextValue {
  counts: Counts;
  refreshCounts: () => Promise<void>;
  bulkImport: BulkImportState;
  setBulkImport: React.Dispatch<React.SetStateAction<BulkImportState>>;
  bulkStopRef: React.MutableRefObject<boolean>;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifications: Notifications;
  refreshNotifications: () => Promise<void>;
}

const defaultCounts: Counts = {
  total: 0, unsorted: 0, phone: 0, email: 0, both: 0,
  missing: 0, hasWebsite: 0, callbacks: 0, callbacksDue: 0, not_contacted: 0,
  contacted: 0, answered: 0, interested: 0, not_interested: 0,
  unsure: 0, demo: 0, making_demo: 0, closed_won: 0, closed_lost: 0,
};

const defaultBulkImport: BulkImportState = {
  text: '', loading: false, progress: 0, total: 0, results: [], stopped: false,
};

const CRMContext = createContext<CRMContextValue>({
  counts: defaultCounts,
  refreshCounts: async () => {},
  bulkImport: defaultBulkImport,
  setBulkImport: () => {},
  bulkStopRef: { current: false },
  sidebarOpen: false,
  setSidebarOpen: () => {},
  notifications: { batchReady: false, unreadInbox: 0, unreadHistory: 0 },
  refreshNotifications: async () => {},
});

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Counts>(defaultCounts);
  const [bulkImport, setBulkImport] = useState<BulkImportState>(defaultBulkImport);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notifications>({ batchReady: false, unreadInbox: 0, unreadHistory: 0 });
  const bulkStopRef = useRef(false);

  const refreshCounts = useCallback(async () => {
    try {
      const c = await fetchLeadCounts();
      setCounts(c);
    } catch {}
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      // Check if any active campaign has unsent leads (batch ready)
      const { data: activeCampaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('status', 'active');
      const batchReady = (activeCampaigns?.length || 0) > 0;

      // Count unread: leads with last_inbound_at > read_at (or read_at is null)
      const { data: unreadData } = await supabase
        .from('leads')
        .select('id, last_inbound_at, read_at')
        .not('last_inbound_at', 'is', null);
      const unreadInbox = (unreadData || []).filter((l: any) => {
        if (!l.last_inbound_at) return false;
        if (!l.read_at) return true;
        return new Date(l.last_inbound_at) > new Date(l.read_at);
      }).length;

      const { count } = await (supabase as any)
        .from('app_notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);

      setNotifications({ batchReady, unreadInbox, unreadHistory: count || 0 });
    } catch {}
  }, []);

  useEffect(() => {
    refreshCounts();
    refreshNotifications();
    // Refresh notifications every 60 seconds
    const interval = setInterval(refreshNotifications, 15000);
    return () => clearInterval(interval);
  }, [refreshCounts, refreshNotifications]);

  return (
    <CRMContext.Provider value={{ counts, refreshCounts, bulkImport, setBulkImport, bulkStopRef, sidebarOpen, setSidebarOpen, notifications, refreshNotifications }}>
      {children}
    </CRMContext.Provider>
  );
}

export function useCRM() {
  return useContext(CRMContext);
}
