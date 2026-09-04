// ΜΟΝΟ ΓΙΑ PREVIEW — δεν μπαίνει ποτέ σε build παραγωγής (vite.preview.config.js).
// Μιμείται ΑΚΡΙΒΩΣ το φράγμα του PostgREST: κόβει κάθε σελίδα στις 1000.
const N = 4700;
const STORES = ['Πίτα του Παππού', 'Sushi Bar', 'Café Νο5', 'Burger House', 'Ουζερί Ακρόπολη'];
const DRIVERS = ['Γιώργος Π.', 'Μαρία Κ.', 'Νίκος Δ.', 'Ελένη Σ.'];
const ROWS = Array.from({ length: N }, (_, i) => {
  const created = new Date(Date.now() - i * 5 * 60000);
  const accepted = new Date(created.getTime() + (3 + (i % 7)) * 60000);
  const completed = new Date(accepted.getTime() + (8 + (i % 19)) * 60000);
  return {
    id: N - i,
    created_at: created.toISOString(),
    accepted_at: accepted.toISOString(),
    completed_at: completed.toISOString(),
    status: 'completed',
    address: `Οδός Δοκιμής ${i % 120 + 1}, Φλώρινα`,
    distance_km: 1 + (i % 9) * 0.7,
    surcharge: 0,
    store_id: i % 5,
    driver_id: i % 4,
    stores: { name: STORES[i % 5], category: 'food' },
    drivers: { full_name: DRIVERS[i % 4] },
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
      if (table === 'stores')  return { data: STORES.map((name, id) => ({ id, name })), error: null };
      if (table === 'drivers') return { data: DRIVERS.map((full_name, id) => ({ id, full_name })), error: null };
      const size = Math.min(q._to - q._from + 1, 1000);   // ← το max_rows της Supabase
      return { data: ROWS.slice(q._from, q._from + size), error: null };
    },
  };
  return q;
}

export const supabase = { from: (t) => builder(t) };
export const getTenantSchema = () => 'public';
export const isBackupMode = () => false;
export const getActiveBackend = () => ({ name: 'primary' });
export const applyTenantFromSession = () => {};
export const TOTAL_MOCK_ROWS = N;
