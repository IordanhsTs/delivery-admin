import { useState, useEffect, useCallback } from 'react';
import { supabase, getTenantSchema } from './supabaseClient';
import { liveChannel, skipFirst } from './live';

// ── Τρέχον υπόλοιπο ταμείου (POS cash-out) ──────────────────────────────────
// Ίδιο μοτίβο με useStoreMessages: fetch μέσω RPC + realtime subscribe ώστε το
// badge στο μενού να ενημερώνεται μόλις ένας διανομέας δηλώσει ή ο admin
// προσθέσει ανεφοδιασμό, χωρίς να χρειάζεται χειροκίνητο refresh.
export function useCashFloat() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc('cash_float_overview');
    if (!error && data && data[0]) setOverview(data[0]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOverview();

    // Το liveChannel δίνει ήδη μοναδικό όνομα ανά instance — το χρειαζόμαστε γιατί
    // το hook μπορεί να ζει ταυτόχρονα στο badge του μενού ΚΑΙ στην καρτέλα «Ταμείο».
    const stop = liveChannel({
      name: 'cash_float',
      onResync: skipFirst(fetchOverview),
      bind: (channel) => channel
        .on('postgres_changes', { event: '*', schema: getTenantSchema(), table: 'cash_declarations' }, () => fetchOverview())
        .on('postgres_changes', { event: '*', schema: getTenantSchema(), table: 'cash_float_topups' }, () => fetchOverview()),
    });

    return () => { stop(); };
  }, [fetchOverview]);

  return {
    balance: overview?.balance ?? 0,
    standardAmount: overview?.standard_amount ?? 0,
    threshold: overview?.low_balance_threshold ?? 0,
    isLow: overview?.is_low ?? false,
    loading,
    refresh: fetchOverview,
  };
}
