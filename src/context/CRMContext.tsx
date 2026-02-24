import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { fetchLeadCounts } from '@/lib/supabase';

interface Counts {
  total: number;
  unsorted: number;
  phone: number;
  email: number;
  both: number;
  missing: number;
  callbacks: number;
  callbacksDue: number;
  not_contacted: number;
  contacted: number;
  answered: number;
  interested: number;
  not_interested: number;
  unsure: number;
  demo: number;
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

interface CRMContextValue {
  counts: Counts;
  refreshCounts: () => Promise<void>;
  bulkImport: BulkImportState;
  setBulkImport: React.Dispatch<React.SetStateAction<BulkImportState>>;
  bulkStopRef: React.MutableRefObject<boolean>;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const defaultCounts: Counts = {
  total: 0, unsorted: 0, phone: 0, email: 0, both: 0,
  missing: 0, callbacks: 0, callbacksDue: 0, not_contacted: 0,
  contacted: 0, answered: 0, interested: 0, not_interested: 0,
  unsure: 0, demo: 0, closed_won: 0, closed_lost: 0,
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
});

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Counts>(defaultCounts);
  const [bulkImport, setBulkImport] = useState<BulkImportState>(defaultBulkImport);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bulkStopRef = useRef(false);

  const refreshCounts = useCallback(async () => {
    try {
      const c = await fetchLeadCounts();
      setCounts(c);
    } catch {}
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  return (
    <CRMContext.Provider value={{ counts, refreshCounts, bulkImport, setBulkImport, bulkStopRef, sidebarOpen, setSidebarOpen }}>
      {children}
    </CRMContext.Provider>
  );
}

export function useCRM() {
  return useContext(CRMContext);
}
