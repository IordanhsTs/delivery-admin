// ── Ανάκτηση ΟΛΩΝ των γραμμών, πέρα από το όριο των 1000 ─────────────────────
//
// ΤΟ ΠΡΟΒΛΗΜΑ: το PostgREST (το API της Supabase) κόβει ΣΙΩΠΗΛΑ κάθε απάντηση
// στις 1000 γραμμές (ρύθμιση `max_rows`, βλ. vertex-db/supabase/config.toml).
// Δεν επιστρέφει σφάλμα — γυρίζει 1000 γραμμές σαν να ήταν όλες. Με ~350
// παραγγελίες/ημέρα, ΚΑΘΕ αναφορά πάνω από ~3 ημέρες έδειχνε λάθος νούμερα
// χωρίς καμία προειδοποίηση (στατιστικά ΚΑΙ χρεώσεις).
//
// Η ΛΥΣΗ: ζητάμε τις γραμμές σε «σελίδες» των 1000 με `.range()` και τις
// ενώνουμε. Το όριο μένει ΩΣ ΕΧΕΙ στον server — είναι δικλείδα ασφαλείας για
// κακόβουλα/κατά λάθος τεράστια αιτήματα — και το παρακάμπτουμε μόνο εκεί που
// το θέλουμε πραγματικά. Έτσι δουλεύει το ίδιο και στο εφεδρικό backend, χωρίς
// να χρειάζεται ρύθμιση σε δύο διαφορετικά μέρη.
//
// ⚠ ΠΡΟΣΟΧΗ 1 — δέχεται `buildQuery` (συνάρτηση), όχι έτοιμο query: ένα
// PostgrestFilterBuilder εκτελείται ΜΙΑ φορά, οπότε χρειαζόμαστε καινούργιο για
// κάθε σελίδα.
//
// ⚠ ΠΡΟΣΟΧΗ 2 — ντετερμινιστική ταξινόμηση: χωρίς σταθερή σειρά, η βάση μπορεί
// να γυρίσει τις γραμμές αλλιώς σε κάθε σελίδα και να πάρουμε διπλές ή να
// χάσουμε άλλες. Κάθε κλήση ΠΡΕΠΕΙ να κλείνει με μοναδική στήλη — στον
// `orders` το `id` (bigint). Ως δεύτερη γραμμή άμυνας (μια παραγγελία μπορεί να
// ολοκληρωθεί ΟΣΟ σελιδοποιούμε και να μετακινήσει τα offsets) πετάμε τα διπλά
// με βάση το `id`.

export const PAGE_SIZE = 1000;

// Δικλείδα ασφαλείας: χωρίς αυτήν, ένα λάθος πληκτρολογημένο εύρος ημερομηνιών
// θα κατέβαζε όλο τον πίνακα στο κινητό του διαχειριστή. 200.000 παραγγελίες
// είναι ~1,5 χρόνος με τον σημερινό ρυθμό. Η ΚΡΙΣΙΜΗ διαφορά από το παλιό όριο
// των 1000: όταν το φτάσουμε το ΛΕΜΕ (`truncated: true`) — δεν σιωπούμε.
export const HARD_CAP = 200000;

export async function fetchAllRows(buildQuery, { onProgress, hardCap = HARD_CAP } = {}) {
  const rows = [];
  const seen = new Set();

  for (let from = 0; from < hardCap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, hardCap) - 1;
    const { data, error } = await buildQuery().range(from, to);

    if (error) return { data: null, error, truncated: false };
    if (!data) return { data: rows, error: null, truncated: false };

    for (const row of data) {
      const key = row?.id;
      if (key !== undefined && key !== null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push(row);
    }

    if (onProgress) onProgress(rows.length);

    // Γύρισε λιγότερες από όσες ζητήσαμε → ήταν η τελευταία σελίδα.
    if (data.length < to - from + 1) {
      return { data: rows, error: null, truncated: false };
    }
  }

  return { data: rows, error: null, truncated: true };
}
