// ΜΟΝΟ ΓΙΑ PREVIEW — δεν μπαίνει ποτέ σε build παραγωγής (vite.preview.config.js).
// Μιμείται ΑΚΡΙΒΩΣ το φράγμα του PostgREST: κόβει κάθε σελίδα στις 1000.
//
// 05/09/2026: το mock είχε 5 καταστήματα και 4 διανομείς, οπότε δεν αναπαρήγαγε
// τίποτα από όσα σπάνε στην πραγματικότητα — η πίτα με 36 κομμάτια, τα ονόματα
// που δεν χωράνε στον άξονα, η ταξινόμηση. Πλέον καθρεφτίζει την παραγωγή:
// 12 καφέ @ 0,15 € · 19 φαγητά @ 0,18 € · 5 ψιλικά @ 0,18 € · 11 διανομείς.
const N = 4700;

const STORES = [
  ...['Believe', 'Central', 'Classic', 'DASH', 'Delicious', 'Light Bar',
      'Mocha', 'Panda', 'Piccolo', 'QR coffee', 'Sousou cafe', 'Ζυγός']
    .map((name) => ({ name, delivery_fee: 0.15, category: 'coffee' })),
  ...['Pasta Bar', 'Rozzel', 'Mel’s creperie', 'Μπλε pita and more', 'Φιλαράκια',
      'Ουζερί Ακρόπολη', 'Burger House', 'Sushi Bar', 'Πίτα του Παππού', 'Gyros Time',
      'Το Στέκι', 'Λυκόστομο', 'Pizza Fan', 'Ψητοπωλείο Ο Μάκης', 'Σουβλάκι Express',
      'Noodle Bar', 'Crepa Loca', 'Στου Θωμά', 'Tandoori']
    .map((name) => ({ name, delivery_fee: 0.18, category: 'food' })),
  ...['Ψιλικά Κέντρο', 'Mini Market Ν.', 'Περίπτερο Πλατείας', 'Kiosk 24h', 'Ψιλικά Στέλλα']
    .map((name) => ({ name, delivery_fee: 0.18, category: 'kiosk' })),
];

const DRIVERS = [
  'Παναγιώτης Κατσούτας', 'Ιορδάνης Τσουτσούλης', 'Λάζαρος Φωστηρόπουλος',
  'Λεωνίδας Μαργαρίτης', 'Χρήστος Στρέζος', 'Θανάσης Σταυρίδης',
  'Φώτης Κυρεζόπουλος', 'Χρήστος Αναστασίου', 'Στέφανος Τρυφωνίδης',
  'Αλέξανδρος Λιασόπουλος', 'Αλέξανδρος Τσιγγέλης',
];

// Ανομοιόμορφη κατανομή, όπως στην πραγματικότητα: λίγα καταστήματα κρατούν το
// μεγαλύτερο μέρος του τζίρου και μια ουρά από μικρά κάνει 1-2 παραγγελίες. Με
// ομοιόμορφη κατανομή η πίτα θα έδειχνε 36 ίσα κομμάτια και δεν θα φαινόταν
// ούτε γιατί χρειάζεται το «Λοιπά» ούτε αν δουλεύει η ταξινόμηση.
const storeIndexFor = (i) => Math.floor(STORES.length * Math.pow((i % 1000) / 1000, 2.2));
const driverIndexFor = (i) => Math.floor(DRIVERS.length * Math.pow(((i * 37) % 1000) / 1000, 1.6));

const ROWS = Array.from({ length: N }, (_, i) => {
  const created = new Date(Date.now() - i * 5 * 60000);
  const accepted = new Date(created.getTime() + (3 + (i % 7)) * 60000);
  const completed = new Date(accepted.getTime() + (8 + (i % 19)) * 60000);
  const storeId = storeIndexFor(i);
  const driverId = driverIndexFor(i);
  return {
    id: N - i,
    created_at: created.toISOString(),
    accepted_at: accepted.toISOString(),
    completed_at: completed.toISOString(),
    status: 'completed',
    address: `Οδός Δοκιμής ${i % 120 + 1}, Φλώρινα`,
    distance_km: 1 + (i % 9) * 0.7,
    surcharge: 0,
    store_id: storeId,
    driver_id: driverId,
    stores: {
      name: STORES[storeId].name,
      category: STORES[storeId].category,
      delivery_fee: STORES[storeId].delivery_fee,
    },
    drivers: { full_name: DRIVERS[driverId] },
  };
});

function builder(table) {
  const q = {
    _from: 0, _to: 999,
    select() { return q; },
    eq() { return q; },
    gte() { return q; },
    lte() { return q; },
    order() { return q; },
    range(from, to) { q._from = from; q._to = to; return q; },
    then(resolve) { return Promise.resolve(q._run()).then(resolve); },
    _run() {
      if (table === 'stores') {
        return { data: STORES.map((s, id) => ({ id, ...s })), error: null };
      }
      if (table === 'drivers') {
        return { data: DRIVERS.map((full_name, id) => ({ id, full_name })), error: null };
      }
      const size = Math.min(q._to - q._from + 1, 1000);   // ← το max_rows της Supabase
      return { data: ROWS.slice(q._from, q._from + size), error: null };
    },
  };
  return q;
}

export const supabase = { from: (t) => builder(t) };
export const getTenantSchema = () => 'public';
export const isBackupMode = () => false;
// Χωρίς αυτά τα δύο το harness πετούσε «does not provide an export named
// getBackupState» σε κάθε φόρτωση — θόρυβος που έκρυβε τα αληθινά σφάλματα.
export const getBackupState = () => 'primary';
export const subscribeBackupState = () => () => {};
export const getActiveBackend = () => ({ name: 'primary' });
export const applyTenantFromSession = () => {};
export const TOTAL_MOCK_ROWS = N;

// ── Ταμείο (05/09/2026) ─────────────────────────────────────────────────────
// Το harness δεν είχε rpc(), οπότε η καρτέλα «Ταμείο» δεν προβαλλόταν καθόλου.
// Το υπόλοιπο είναι ΕΠΙΤΗΔΕΣ αρνητικό στη βάση, ώστε να φαίνεται ότι η οθόνη το
// κόβει στο μηδέν. Το ιστορικό έχει και τα τρία είδη κίνησης.
const cashDay = (d, h) => new Date(new Date().setHours(h, 15, 0, 0) - d * 86400000).toISOString();

const CASH_LEDGER = [
  { kind: 'cash',  id: 'c1', driver_id: 'd1', driver_name: DRIVERS[0], amount: 120, original_amount: null, note: null, created_at: cashDay(0, 21), edited_at: null },
  { kind: 'fuel',  id: 'f1', driver_id: 'd2', driver_name: DRIVERS[1], amount: 20, original_amount: null, note: 'Shell Λεωφόρου', created_at: cashDay(0, 19), edited_at: null },
  { kind: 'topup', id: 't1', driver_id: null, driver_name: null, amount: 300, original_amount: null, note: 'Ανεφοδιασμός Δευτέρας', created_at: cashDay(1, 10), edited_at: null },
  { kind: 'cash',  id: 'c2', driver_id: 'd3', driver_name: DRIVERS[2], amount: 85.4, original_amount: 58.4, note: null, created_at: cashDay(2, 22), edited_at: cashDay(2, 23) },
  { kind: 'fuel',  id: 'f2', driver_id: 'd4', driver_name: DRIVERS[3], amount: 15.5, original_amount: null, note: null, created_at: cashDay(3, 18), edited_at: null },
];

const RPCS = {
  cash_float_overview: [{ balance: -45.5, standard_amount: 300, low_balance_threshold: 100, is_low: true }],
  admin_cash_ledger_history: CASH_LEDGER,
  admin_pending_expenses: [
    { kind: 'cash', id: 'c1', driver_id: 'd1', driver_name: DRIVERS[0], amount: 120, created_at: cashDay(0, 21) },
    { kind: 'fuel', id: 'f1', driver_id: 'd2', driver_name: DRIVERS[1], amount: 20, created_at: cashDay(0, 19) },
  ],
  admin_settled_expenses: [
    { kind: 'cash', id: 'c2', driver_id: 'd3', driver_name: DRIVERS[2], amount: 85.4, received_at: cashDay(1, 12) },
  ],
};

supabase.rpc = (name) => Promise.resolve({ data: RPCS[name] ?? [], error: null });
