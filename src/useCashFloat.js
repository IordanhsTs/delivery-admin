import { useState, useEffect, useCallback } from 'react';
import { supabase, getTenantSchema } from './supabaseClient';

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

    // Μοναδικό όνομα ανά instance — ίδιος λόγος με useStoreMessages: το hook
    // μπορεί να ζει ταυτόχρονα στο badge του μενού ΚΑΙ στην καρτέλα «Ταμείο».
    const channel = supabase
      .channel(`cash_float_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: getTenantSchema(), table: 'cash_declarations' }, () => fetchOverview())
      .on('postgres_changes', { event: '*', schema: getTenantSchema(), table: 'cash_float_topups' }, () => fetchOverview())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
