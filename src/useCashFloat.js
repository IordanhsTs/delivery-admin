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
        // Η βενζίνη μπήκε εδώ με το 0030: από τότε που βγαίνει κι αυτή από το
        // ταμείο, μια δήλωση βενζίνης αλλάζει το υπόλοιπο — χωρίς αυτή τη
        // γραμμή το νούμερο θα έμενε παγωμένο μέχρι το επόμενο refresh.
        .on('postgres_changes', { event: '*', schema: getTenantSchema(), table: 'fuel_expenses' }, () => fetchOverview())
        .on('postgres_changes', { event: '*', schema: getTenantSchema(), table: 'cash_float_topups' }, () => fetchOverview()),
    });

    return () => { stop(); };
  }, [fetchOverview]);

  // Το υπόλοιπο δεν πέφτει ΠΟΤΕ κάτω από το μηδέν στην οθόνη: αν οι δηλώσεις
  // ξεπεράσουν τους ανεφοδιασμούς (τα λεφτά τελείωσαν), «μηδέν» είναι αυτό που
  // βλέπει ο υπεύθυνος. Το κόβουμε ΕΔΩ και όχι στο cash_float_overview επίτηδες:
  // η βάση κρατάει το πραγματικό — αρνητικό — άθροισμα, που είναι ένδειξη ότι
  // κάτι δηλώθηκε χωρίς να έχει καταχωρηθεί ο αντίστοιχος ανεφοδιασμός.
  return {
    balance: Math.max(0, overview?.balance ?? 0),
    standardAmount: overview?.standard_amount ?? 0,
    threshold: overview?.low_balance_threshold ?? 0,
    isLow: overview?.is_low ?? false,
    loading,
    refresh: fetchOverview,
  };
}
