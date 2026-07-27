// ── Μορφοποίηση απόστασης & επιβάρυνσης ─────────────────────────────────────
// Ο admin ΔΕΝ υπολογίζει αποστάσεις — τις διαβάζει έτσι όπως αποθηκεύτηκαν τη
// στιγμή της παραγγελίας (orders.distance_km / orders.surcharge). Έτσι μια
// μελλοντική διόρθωση θέσης καταστήματος δεν αλλάζει αναδρομικά το ιστορικό.
// Ο υπολογισμός ζει στο store-web-app (lib/distance.ts).

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
