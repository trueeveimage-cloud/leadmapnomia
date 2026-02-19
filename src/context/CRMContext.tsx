import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { fetchLeadCounts } from '@/lib/supabase';

interface Counts {
  total: number;
  unsorted: number;
  phone: number;
  gmail: number;
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

interface CRMContextValue {
  counts: Counts;
  refreshCounts: () => Promise<void>;
}

const defaultCounts: Counts = {
  total: 0, unsorted: 0, phone: 0, gmail: 0, email: 0, both: 0,
  missing: 0, callbacks: 0, callbacksDue: 0, not_contacted: 0,
  contacted: 0, answered: 0, interested: 0, not_interested: 0,
  unsure: 0, demo: 0, closed_won: 0, closed_lost: 0,
};

const CRMContext = createContext<CRMContextValue>({
  counts: defaultCounts,
  refreshCounts: async () => {},
});

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Counts>(defaultCounts);

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
    <CRMContext.Provider value={{ counts, refreshCounts }}>
      {children}
    </CRMContext.Provider>
  );
}

export function useCRM() {
  return useContext(CRMContext);
}
