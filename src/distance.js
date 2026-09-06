// ── Απόσταση & επιβάρυνση ───────────────────────────────────────────────────
// ΙΣΤΟΡΙΚΑ ο admin ΔΕΝ υπολόγιζε αποστάσεις: τις διάβαζε έτσι όπως
// αποθηκεύτηκαν τη στιγμή της παραγγελίας (orders.distance_km /
// orders.surcharge), ώστε μια μελλοντική διόρθωση θέσης καταστήματος να μην
// αλλάζει αναδρομικά το ιστορικό. Αυτό ΕΞΑΚΟΛΟΥΘΕΙ να ισχύει για ό,τι
// διαβάζεται.
//
// ΑΛΛΑΞΕ 06/09/2026: ο admin φτιάχνει και ο ίδιος παραγγελίες («Νέα
// Παραγγελία»), και μέχρι σήμερα τις έγραφε ΧΩΡΙΣ distance_km και surcharge —
// δηλαδή μηδενική επιβάρυνση στην εκκαθάριση, ενώ η ίδια διεύθυνση από το
// κατάστημα χρεωνόταν κανονικά. Άρα χρειάζεται τον ίδιο υπολογισμό τη στιγμή
// της δημιουργίας.
//
// ΟΙ ΚΑΝΟΝΕΣ ΤΙΜΟΛΟΓΗΣΗΣ ΕΙΝΑΙ ΑΝΤΙΓΡΑΦΟ του store-web-app (lib/distance.ts):
// τα τρία apps είναι ξεχωριστά repos χωρίς κοινό package. ΑΝ ΑΛΛΑΞΕΙ Η
// ΤΙΜΟΛΟΓΗΣΗ, ΑΛΛΑΖΕΙ ΚΑΙ ΣΤΑ ΤΡΙΑ.

/** Πάνω από τόσα χλμ η παραγγελία δεν επιτρέπεται καθόλου. */
export const MAX_DISTANCE_KM = 15;

/** Μέχρι τόσα χλμ δεν υπάρχει επιπλέον χρέωση. */
export const FREE_RADIUS_KM = 2.5;

/** Χρέωση ανά 100 μέτρα πέρα από το FREE_RADIUS_KM. */
export const SURCHARGE_PER_100M = 0.1;

/** Απόσταση σε ευθεία γραμμή (Haversine), με ακρίβεια μέτρου. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 1000) / 1000;
}

/**
 * Επιπλέον χρέωση προς το κατάστημα για απόσταση πάνω από το FREE_RADIUS_KM.
 * Στρογγυλοποίηση ΠΡΟΣ ΤΑ ΚΑΤΩ — χρεώνονται μόνο τα ΣΥΜΠΛΗΡΩΜΕΝΑ 100μ:
 * 3,5χλμ → 1,00€ · 3,55χλμ → 1,00€ · 3,6χλμ → 1,10€.
 *
 * Το toFixed(6) πριν το floor ΔΕΝ είναι καλλωπισμός. Σε IEEE-754 το
 * `(2.8 - 2.5) * 10` δίνει 2.999999999999998, που με σκέτο floor γίνεται 2 αντί
 * για 3 — δηλαδή 0,20€ αντί για 0,30€. Οι 2,8 / 2,9 / 3,3 / 3,8 χλμ είναι από
 * τις πιο συνηθισμένες αποστάσεις σε επαρχιακή πόλη.
 */
export function surchargeFor(distanceKm) {
  const n = Number(distanceKm);
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(n)) return 0;
  const beyond = n - FREE_RADIUS_KM;
  if (beyond <= 0) return 0;
  const units = Math.floor(Number((beyond * 10).toFixed(6)));
  return Math.round(units * SURCHARGE_PER_100M * 100) / 100;
}

/** «3,4 χλμ» — ελληνικό δεκαδικό κόμμα, 1 δεκαδικό. */
export function formatKm(distanceKm) {
  const n = Number(distanceKm);
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1).replace('.', ',')} χλμ`;
}

/** «1,00 €» */
export function formatEuro(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2).replace('.', ',')} €`;
}

/** «3:41» — υπόλοιπο μέχρι την αποστολή μιας προγραμματισμένης παραγγελίας. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Διάρκειες μιας παραγγελίας σε λεπτά.
 *
 * Ο πελάτης θέλει ΚΑΙ τα δύο σκέλη ώστε να βγαίνει ο πραγματικός συνολικός χρόνος:
 *   • active   = από τη δημιουργία μέχρι να την πάρει διανομέας («ενεργή»)
 *   • accepted = από την αποδοχή και μετά («αποδεκτή»)
 *
 * Το Math.max(0, …) δεν είναι διακοσμητικό: το `created_at` γράφεται από τον
 * Postgres ενώ το `accepted_at` από το κινητό του διανομέα. Μια απόκλιση ρολογιού
 * λίγων δευτερολέπτων έδινε αρνητική διαφορά → «-1 λ.» στην οθόνη του διανομέα.
 *
 * `activated_at ?? created_at`: για μια ΚΑΘΥΣΤΕΡΗΜΕΝΗ παραγγελία το `created_at`
 * είναι η στιγμή αποστολής από το κατάστημα, πολύ πριν γίνει 'pending' — χωρίς
 * αυτό το fallback ο χρόνος «ενεργή» θα ξεκινούσε ήδη από τα λεπτά αναμονής αντί
 * από το 0 τη στιγμή που απελευθερώνεται (release_due_orders() το γεμίζει τότε).
 */
export function orderDurations(order, now = new Date()) {
  const created = order.activated_at
    ? new Date(order.activated_at)
    : order.created_at ? new Date(order.created_at) : null;
  const accepted = order.accepted_at ? new Date(order.accepted_at) : null;
  const ended = order.completed_at ? new Date(order.completed_at) : null;
  if (!created) return { activeMins: 0, acceptedMins: 0, totalMins: 0 };

  const activeEnd = accepted || ended || now;
  const activeMins = Math.max(0, Math.floor((activeEnd - created) / 60000));

  const acceptedMins = accepted
    ? Math.max(0, Math.floor(((ended || now) - accepted) / 60000))
    : 0;

  return { activeMins, acceptedMins, totalMins: activeMins + acceptedMins };
}
