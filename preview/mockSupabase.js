// ΜΟΝΟ ΓΙΑ PREVIEW — δεν μπαίνει ποτέ σε build παραγωγής (vite.preview.config.js).
// Μιμείται ΑΚΡΙΒΩΣ το φράγμα του PostgREST: κόβει κάθε σελίδα στις 1000.
//
// 05/09/2026: το mock είχε 5 καταστήματα και 4 διανομείς, οπότε δεν αναπαρήγαγε
// τίποτα από όσα σπάνε στην πραγματικότητα — η πίτα με 36 κομμάτια, τα ονόματα
// που δεν χωράνε στον άξονα, η ταξινόμηση. Πλέον καθρεφτίζει την παραγωγή:
// 12 καφέ · 19 φαγητά · 5 ψιλικά · 11 διανομείς.
//
// 21/09/2026 (migration 0039): η χρέωση φαγητού/ψιλικών είναι 0,20 € — μέσα
// είναι ο ΦΠΑ που ενσωμάτωσε ο διαχειριστής — ενώ η αμοιβή διανομέα έμεινε
// 0,13 €. Το DASH έχει χρέωση 0,17 € αντί 0,15 €, όπως στην παραγωγή: ήταν
// ακριβώς αυτό που πρόδωσε το bug, γιατί ο παλιός τύπος `χρέωση − 0,05`
// έβγαζε 0,12 € αντί για 0,10 €. Χωρίς αυτή την ανωμαλία μέσα στο mock, η
// οθόνη θα έδειχνε σωστά νούμερα ακόμα κι αν ο κώδικας ήταν λάθος.
const N = 4700;

const PAYOUT = { coffee: 0.10, food: 0.13, kiosk: 0.13, default: 0.13 };

const STORES = [
  ...['Believe', 'Central', 'Classic', 'DASH', 'Delicious', 'Light Bar',
      'Mocha', 'Panda', 'Piccolo', 'QR coffee', 'Sousou cafe', 'Ζυγός']
    .map((name) => ({ name, delivery_fee: name === 'DASH' ? 0.17 : 0.15, category: 'coffee' })),
  ...['Pasta Bar', 'Rozzel', 'Mel’s creperie', 'Μπλε pita and more', 'Φιλαράκια',
      'Ουζερί Ακρόπολη', 'Burger House', 'Sushi Bar', 'Πίτα του Παππού', 'Gyros Time',
      'Το Στέκι', 'Λυκόστομο', 'Pizza Fan', 'Ψητοπωλείο Ο Μάκης', 'Σουβλάκι Express',
      'Noodle Bar', 'Crepa Loca', 'Στου Θωμά', 'Tandoori']
    .map((name) => ({ name, delivery_fee: 0.20, category: 'food' })),
  ...['Ψιλικά Κέντρο', 'Mini Market Ν.', 'Περίπτερο Πλατείας', 'Kiosk 24h', 'Ψιλικά Στέλλα']
    .map((name) => ({ name, delivery_fee: 0.20, category: 'kiosk' })),
].map((s) => ({ ...s, driver_payout: PAYOUT[s.category] }));

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
    payment_method: i % 5 === 0 ? null : (i % 2 === 0 ? 'cash' : 'card'),
    store_id: storeId,
    driver_id: driverId,
    // ΠΑΓΩΜΕΝΗ τη στιγμή της ολοκλήρωσης (migration 0039). Αντιγράφεται εδώ
    // ΜΙΑ φορά· αν αλλάξεις μετά την αμοιβή του καταστήματος από την οθόνη,
    // αυτές οι γραμμές ΔΕΝ πρέπει να κουνηθούν — αυτό ακριβώς δοκιμάζεται.
    driver_payout: STORES[storeId].driver_payout,
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
    _patch: null, _eq: null,
    // ΠΡΟΣΟΧΗ: κάθε κρίκος επιστρέφει το `proxied`, ΟΧΙ το `q` — αλλιώς η
    // αλυσίδα βγαίνει από το Proxy στον πρώτο γνωστό τελεστή και ο επόμενος
    // άγνωστος («.select().neq») σκάει πάλι.
    select() { return proxied; },
    // Η αποθήκευση καρτέλας καταστήματος (StoreDrawer) περνάει από εδώ. Χωρίς
    // update()/eq() που κρατούν τιμές, το «Αποθήκευση» έδειχνε επιτυχία και δεν
    // άλλαζε τίποτα — δηλαδή το harness θα «περνούσε» ό,τι κι αν έγραφα.
    update(patch) { q._patch = patch; return proxied; },
    eq(col, val) { q._eq = { col, val }; return proxied; },
    gte() { return proxied; },
    lte() { return proxied; },
    order() { return proxied; },
    range(from, to) { q._from = from; q._to = to; return proxied; },
    // Το Statistics διαβάζει τις ώρες λειτουργίας για τον ρυθμό παραγγελιών/ώρα
    // (06/09/2026). Χωρίς maybeSingle το harness έσκαγε πριν προλάβει να ζωγραφίσει.
    maybeSingle() {
      const one = q._run();
      return Promise.resolve({ data: Array.isArray(one.data) ? one.data[0] ?? null : one.data, error: null });
    },
    then(resolve) { return Promise.resolve(q._run()).then(resolve); },
    _run() {
      if (q._patch) {
        // Μόνο ό,τι χρειάζεται το preview: ενημέρωση ΕΝΟΣ καταστήματος με id.
        if (table === 'stores' && q._eq?.col === 'id') {
          const row = STORES[q._eq.val];
          if (row) Object.assign(row, q._patch);
        }
        return { data: null, error: null };
      }
      if (table === 'stores') {
        return { data: STORES.map((s, id) => ({ id, ...s, latitude: 40.78, longitude: 21.41 })), error: null };
      }
      if (table === 'driver_category_rates') {
        // Προτεινόμενες τιμές για ΝΕΟ κατάστημα (0039) — δεν πληρώνουν τίποτα.
        return { data: Object.entries(PAYOUT).map(([category, rate]) => ({ category, rate })), error: null };
      }
      if (table === 'company_modules') {
        // Ίδιο grandfather clause με την παραγωγή (migration 0042): το preview
        // δείχνει το Ταμείο ενεργό εξ ορισμού, όπως η μοναδική σημερινή εταιρία.
        // ΣΗΜΕΙΩΣΗ: αυτό το preview mount (main.jsx) δεν περνάει ΠΟΤΕ από το
        // πραγματικό App.jsx/verifyAdminSession — τα tabs μπαίνουν standalone
        // (βλ. TABS map). Αυτό το fixture υπάρχει προληπτικά, όχι επειδή κάτι
        // εδώ το διαβάζει σήμερα.
        return { data: [{ module_key: 'cash_float', enabled: true }], error: null };
      }
      if (table === 'drivers') {
        return { data: DRIVERS.map((full_name, id) => ({ id, full_name })), error: null };
      }
      if (table === 'fuel_settings') {
        return { data: [{ l_per_100km: 4, price_per_l: 1.8 }], error: null };
      }
      if (table === 'schedule_settings') {
        return { data: [{ open_hour: 7, close_hour: 25 }], error: null };
      }
      if (table === 'saved_addresses') {
        return { data: [
          { id: 'sa1', label: 'Σπίτι Παπαδόπουλου', address: 'Μεγάλου Αλεξάνδρου 45, Φλώρινα', latitude: 40.7855, longitude: 21.4051 },
          { id: 'sa2', label: 'Γραφείο', address: 'Προξένου Κορομηλά 12, Φλώρινα', latitude: 40.7802, longitude: 21.4130 },
        ], error: null };
      }
      const size = Math.min(q._to - q._from + 1, 1000);   // ← το max_rows της Supabase
      return { data: ROWS.slice(q._from, q._from + size), error: null };
    },
  };
  // Το PostgREST έχει δεκάδες τελεστές (neq, limit, in, is, ilike, single…) και
  // κάθε οθόνη χρησιμοποιεί άλλους. Όποιος έλειπε έσκαγε ΟΛΟΚΛΗΡΗ την οθόνη με
  // «.neq is not a function» — και μαζί έκρυβε αυτό που θέλαμε να δούμε. Ό,τι
  // δεν ξέρουμε γίνεται κρίκος που δεν φιλτράρει: το preview δείχνει εμφάνιση
  // και ροή, όχι ακρίβεια ερωτημάτων.
  const proxied = new Proxy(q, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      return () => proxied;
    },
  });
  return proxied;
}

export const supabase = { from: (t) => builder(t) };
// company_modules ζει στο public schema, όχι στο tenant-scoped default — το
// πραγματικό App.jsx κάνει .schema('public').from(...) γι' αυτό. Το mock είναι
// flat (κανένα πραγματικό schema), οπότε απλά αγνοεί το όνομα.
supabase.schema = () => ({ from: (t) => builder(t) });

// ── Ψεύτικη συνεδρία ────────────────────────────────────────────────────────
// Χωρίς αυτό το harness έσκαγε με «Cannot read properties of undefined
// (reading 'getSession')» και ζωγράφιζε ΛΕΥΚΗ σελίδα: οι οθόνες ελέγχουν τη
// συνεδρία πριν φορτώσουν δεδομένα. Ο σκοπός του preview είναι ακριβώς να
// βλέπουμε τις οθόνες ΧΩΡΙΣ χειροκίνητο login.
// Το App.jsx ΑΠΟΚΩΔΙΚΟΠΟΙΕΙ το access_token και ψάχνει το claim `user_role`
// (θετικός έλεγχος, allowlist). Ένα σκέτο string εδώ έριχνε τον έλεγχο στο
// μεταβατικό fallback «είσαι driver/store;» → signOut → οθόνη login. Οπότε
// χρειάζεται ΑΛΗΘΙΝΗ μορφή JWT — ανυπόγραφη, τοπικά δεν την ελέγχει κανείς.
const FAKE_CLAIMS = { user_role: 'admin', company_schema: 'public', email: 'preview@vertex.local' };
const FAKE_JWT = 'eyJhbGciOiJub25lIn0.'
  + btoa(JSON.stringify(FAKE_CLAIMS)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  + '.preview';
const FAKE_SESSION = {
  access_token: FAKE_JWT, refresh_token: 'preview',
  user: { id: 'preview-admin', email: 'preview@vertex.local', app_metadata: FAKE_CLAIMS },
};
supabase.auth = {
  getSession:        () => Promise.resolve({ data: { session: FAKE_SESSION }, error: null }),
  refreshSession:    () => Promise.resolve({ data: { session: FAKE_SESSION }, error: null }),
  signInWithPassword:() => Promise.resolve({ data: { session: FAKE_SESSION }, error: null }),
  signOut:           () => Promise.resolve({ error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
};
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
// Η ΗΜΕΡΑ ΠΟΥ ΑΦΟΡΑ η δήλωση (for_date / spent_on στο πραγματικό RPC) — το UI
// ομαδοποιεί με αυτήν, όχι με το created_at.
const entryDay = (d) => new Date(new Date().setHours(12, 0, 0, 0) - d * 86400000).toISOString().slice(0, 10);

const CASH_LEDGER = [
  { kind: 'cash',  id: 'c1', driver_id: 'd1', driver_name: DRIVERS[0], amount: 120, original_amount: null, note: null, created_at: cashDay(0, 21), edited_at: null , entry_date: entryDay(0) },
  { kind: 'fuel',  id: 'f1', driver_id: 'd2', driver_name: DRIVERS[1], amount: 20, original_amount: null, note: 'Shell Λεωφόρου', created_at: cashDay(0, 19), edited_at: null , entry_date: entryDay(0) },
  { kind: 'topup', id: 't1', driver_id: null, driver_name: null, amount: 300, original_amount: null, note: 'Ανεφοδιασμός Δευτέρας', created_at: cashDay(1, 10), edited_at: null , entry_date: entryDay(1) },
  { kind: 'cash',  id: 'c2', driver_id: 'd3', driver_name: DRIVERS[2], amount: 85.4, original_amount: 58.4, note: null, created_at: cashDay(2, 22), edited_at: cashDay(2, 23) , entry_date: entryDay(2) },
  { kind: 'fuel',  id: 'f2', driver_id: 'd4', driver_name: DRIVERS[3], amount: 15.5, original_amount: null, note: null, created_at: cashDay(3, 18), edited_at: null , entry_date: entryDay(3) },
];

// ── Ενεργές ώρες ανά διανομέα (08/09/2026) ─────────────────────────────────
// Το Statistics.jsx καλεί driver_distance_report(p_from, p_to) για τον ρυθμό
// «παρ./ενεργή ώρα» ανά διανομέα. Δεν υπάρχει driver_shifts στο harness — οι
// ώρες εδώ είναι επινοημένες, αρκεί να δίνουν ρεαλιστικό/ποικίλο ρυθμό ώστε να
// φαίνεται το νέο badge, όχι πραγματική ακρίβεια.
const DRIVER_HOURS_REPORT = DRIVERS.map((full_name, id) => ({
  driver_id: id,
  full_name,
  hours: Math.round((ROWS.filter((r) => r.driver_id === id).length / (6 + (id % 5))) * 10) / 10,
}));

const RPCS = {
  driver_distance_report: DRIVER_HOURS_REPORT,
  cash_float_overview: [{ balance: -45.5, standard_amount: 300, low_balance_threshold: 100, is_low: true }],
  admin_cash_ledger_history: CASH_LEDGER,
  admin_pending_expenses: [
    { kind: 'cash', id: 'c1', driver_id: 'd1', driver_name: DRIVERS[0], amount: 120, created_at: cashDay(0, 21) , entry_date: entryDay(0) },
    { kind: 'fuel', id: 'f1', driver_id: 'd2', driver_name: DRIVERS[1], amount: 20, created_at: cashDay(0, 19) , entry_date: entryDay(0) },
  ],
  admin_settled_expenses: [
    { kind: 'cash', id: 'c2', driver_id: 'd3', driver_name: DRIVERS[2], amount: 85.4, received_at: cashDay(1, 12) },
  ],
};

// ── Χιλιόμετρα & Καύσιμα: βάρδιες + διόρθωση (19/09/2026) ─────────────────
// Stateful: η «διόρθωση» αλλάζει τη βάρδια και η αναφορά ξαναϋπολογίζεται, ώστε
// να φαίνεται ολόκληρη η ροή. Τα τρία σενάρια αντιστοιχούν σε αυτά που ζητήθηκαν:
//   • Φώτης: το ίδιο το περιστατικό (τελική 250.300 αντί 25.300 → 225.150 χλμ)
//   • Λεωνίδας: ΜΟΝΗ βάρδια της εβδομάδας, «ύποπτη» (0 χλμ) — δεν πρέπει να χαθεί από τη λίστα
//   • Ιορδάνης: κανονικές βάρδιες + μία χωρίς τελική ένδειξη
const hAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const MOCK_SHIFTS = [
  { shift_id: 's1', driver_id: 6, driver_name: DRIVERS[6], vehicle_id: 'v1', vehicle_code: 'moto1', started_at: hAgo(6), ended_at: hAgo(1),
    start_odometer_km: 25150, end_odometer_km: 250300, distance_km: 225150, source: 'odometer', odometer_source: 'declared', flag: 'over_cap', corrections: [] },
  { shift_id: 's2', driver_id: 6, driver_name: DRIVERS[6], vehicle_id: 'v1', vehicle_code: 'moto1', started_at: hAgo(30), ended_at: hAgo(25),
    start_odometer_km: 25000, end_odometer_km: 25150, distance_km: 150, source: 'odometer', odometer_source: 'declared', flag: null, corrections: [] },
  { shift_id: 's3', driver_id: 3, driver_name: DRIVERS[3], vehicle_id: 'v2', vehicle_code: 'moto2', started_at: hAgo(52), ended_at: hAgo(47),
    start_odometer_km: 25700, end_odometer_km: 26500, distance_km: 0, source: 'odometer', odometer_source: 'suspect', flag: 'suspect', corrections: [] },
  { shift_id: 's4', driver_id: 1, driver_name: DRIVERS[1], vehicle_id: 'v3', vehicle_code: 'moto3', started_at: hAgo(8), ended_at: hAgo(3),
    start_odometer_km: 18040, end_odometer_km: 18195, distance_km: 155, source: 'odometer', odometer_source: 'declared', flag: null, corrections: [] },
  { shift_id: 's5', driver_id: 1, driver_name: DRIVERS[1], vehicle_id: 'v3', vehicle_code: 'moto3', started_at: hAgo(32), ended_at: hAgo(27),
    start_odometer_km: 17900, end_odometer_km: null, distance_km: 0, source: 'odometer', odometer_source: null, flag: 'no_end', corrections: [] },
];
const fuelRow = (full_name, id) => {
  const mine = MOCK_SHIFTS.filter((x) => x.driver_id === id);
  const km = mine.reduce((a, x) => a + Number(x.distance_km), 0);
  const hours = mine.reduce((a, x) => a + (new Date(x.ended_at) - new Date(x.started_at)) / 3600000, 0);
  return {
    driver_id: id, full_name,
    shifts: mine.length, distance_km: km, hours: Math.round(hours * 10) / 10,
    l_per_100km: 4, liters: km * 0.04, fuel_cost: km * 0.04 * 1.8,
    ping_count: 0, gap_count: 0, sources: mine.length ? 'odometer' : '', own_paid_fuel: 0,
  };
};
const RPC_HANDLERS = {
  // Ίδιο σχήμα με το Statistics (driver_id, full_name, hours) + τα πεδία του FuelReport.
  driver_distance_report: () => DRIVERS.map((n, id) => ({ ...DRIVER_HOURS_REPORT[id], ...fuelRow(n, id), hours: DRIVER_HOURS_REPORT[id].hours + fuelRow(n, id).hours })),
  admin_shifts_in_range: () => MOCK_SHIFTS.map((x) => ({ ...x })),
  admin_correct_shift_odometer: (a) => {
    const sh = MOCK_SHIFTS.find((x) => x.shift_id === a.p_shift_id);
    if (!sh) return { error: { message: 'Η βάρδια δεν βρέθηκε' } };
    if (a.p_end_km !== null && a.p_end_km - a.p_start_km > 400) return { error: { message: 'Πάνω από 400 χλμ σε μία βάρδια δεν γίνονται δεκτά' } };
    sh.corrections.unshift({ at: new Date().toISOString(), old_start: sh.start_odometer_km, old_end: sh.end_odometer_km,
      new_start: a.p_start_km, new_end: a.p_end_km ?? sh.end_odometer_km, reason: a.p_reason });
    sh.start_odometer_km = a.p_start_km;
    if (a.p_end_km !== null) { sh.end_odometer_km = a.p_end_km; sh.distance_km = a.p_end_km - a.p_start_km; }
    sh.odometer_source = 'admin';
    sh.flag = null;
    return { data: { shift_id: sh.shift_id, distance_km: sh.distance_km, vehicle_fixed: true, vehicle_km: a.p_end_km ?? a.p_start_km } };
  },
};

supabase.rpc = (name, args) => {
  const h = RPC_HANDLERS[name];
  if (h) {
    const r = h(args || {});
    return Promise.resolve(r && (r.error || r.data !== undefined) ? { data: r.data ?? null, error: r.error ?? null } : { data: r, error: null });
  }
  return Promise.resolve({ data: RPCS[name] ?? [], error: null });
};

// ── Οι γεωγραφικές edge functions (06/09/2026) ──────────────────────────────
// Ψεύτικες προτάσεις οδών ώστε να προβάλλεται η «Νέα Παραγγελία» χωρίς κλειδί
// Google και χωρίς να ξοδεύεται credit σε κάθε φόρτωση του harness.
const FAKE_STREETS = [
  { street: 'Μεγάλου Αλεξάνδρου', context: 'Φλώρινα', placeId: 'p1' },
  { street: 'Μεγάλου Βασιλείου', context: 'Φλώρινα', placeId: 'p2' },
  { street: 'Μεγαλέξανδρου', context: 'Φλώρινα 531 00', placeId: 'p3' },
  { street: 'Προξένου Κορομηλά', context: 'Φλώρινα', placeId: 'p4' },
  { street: 'Καφέ Μέγαρο', context: 'Μεγάλου Αλεξάνδρου 12, Φλώρινα', placeId: 'p5', isPlace: true, streetName: 'Μεγάλου Αλεξάνδρου 12' },
];

supabase.functions = {
  invoke: (name, opts) => {
    const body = opts?.body || {};
    if (name === 'places-autocomplete') {
      const q = String(body.text || '').toLowerCase();
      return Promise.resolve({
        data: { suggestions: FAKE_STREETS.filter((s) => s.street.toLowerCase().includes(q)) },
        error: null,
      });
    }
    if (name === 'place-details') {
      return Promise.resolve({ data: { lat: 40.7855, lon: 21.4051, exact: true, streetName: null }, error: null });
    }
    if (name === 'route-distance') {
      // 3,4 χλμ → επιβάρυνση 0,90 €: αρκετά μακριά ώστε να ελέγχεται η χρέωση.
      return Promise.resolve({ data: { km: 3.4, minutes: 9 }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
};
