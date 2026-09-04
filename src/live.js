// ─── ΖΩΝΤΑΝΗ ΣΥΝΔΕΣΗ ΠΟΥ ΑΥΤΟ-ΕΠΙΔΙΟΡΘΩΝΕΤΑΙ ────────────────────────────────
//
// Το ΠΡΟΒΛΗΜΑ (04/09/2026, εντοπίστηκε πρώτα στα καταστήματα): σε καρτέλα που
// μένει ανοιχτή για ώρες — δηλαδή στο admin ΚΑΘΕ ΜΕΡΑ — το websocket του realtime
// πεθαίνει σιωπηλά:
//   • ο browser «παγώνει» τα timers των ανενεργών καρτελών, άρα χάνονται τα
//     heartbeats και ο server κλείνει τη σύνδεση,
//   • το JWT λήγει στη μία ώρα και το κανάλι δεν ξαναμπαίνει με ληγμένο token,
//   • ή απλά κόβεται στιγμιαία το δίκτυο / κοιμάται ο υπολογιστής.
// Η σελίδα δείχνει μια χαρά και τα HTTP queries δουλεύουν κανονικά — αλλά κανένα
// event δεν φτάνει πια. Στο κατάστημα αυτό κόλλαγε την κάρτα στο «Αναμονή για
// οδηγό»· εδώ σημαίνει χάρτης με παγωμένα στίγματα και νέα παραγγελία που δεν
// ηχεί ποτέ. Χωρίς κανένα σφάλμα, χωρίς καμία ένδειξη.
//
// Τρία επίπεδα άμυνας, ανεξάρτητα μεταξύ τους:
//   1. onWake      — μόλις η καρτέλα ξαναγίνει ορατή/ενεργή ή γυρίσει το δίκτυο:
//                    φρεσκάρουμε το session και ελέγχουμε όλα τα κανάλια.
//   2. liveChannel — κάθε κανάλι παρακολουθεί τον εαυτό του και ξαναχτίζεται
//                    μόνο του· σε κάθε επανασύνδεση καλεί onResync (πλήρες
//                    ξαναδιάβασμα, γιατί ό,τι έγινε όσο ήταν πεσμένο ΔΕΝ έρχεται
//                    ποτέ ως event).
//   3. Poll στα δεδομένα (βλ. LiveMap) — η τελευταία γραμμή άμυνας: ακόμα κι αν
//                    το realtime έχει πεθάνει τελείως, τα δεδομένα ανανεώνονται.

import { supabase } from './supabaseClient';

// Το focus χτυπά συχνά (κάθε alt-tab)· δεν θέλουμε καταιγίδα από ελέγχους.
const WAKE_THROTTLE_MS = 3000;
// Πόσο περιμένουμε πριν ξαναχτίσουμε ένα κανάλι που έπεσε (ο server μπορεί να
// είναι στιγμιαία απρόσιτος — δεν κερδίζουμε τίποτα με επιθετικό retry).
const REBUILD_DELAY_MS = 4000;
// Περιοδικός έλεγχος υγείας, ανεξάρτητα από events. Σε κρυμμένη καρτέλα ο browser
// τον περιορίζει σε ~1/λεπτό — δεν πειράζει, εκεί δουλεύει το onWake.
const WATCHDOG_MS = 30000;

const wakeListeners = new Set();
let lastWake = 0;
let wired = false;

async function fireWake(force = false) {
  const now = Date.now();
  if (!force && now - lastWake < WAKE_THROTTLE_MS) return;
  lastWake = now;

  // Το JWT μπορεί να έχει λήξει όσο η καρτέλα κοιμόταν. Χωρίς φρέσκο token το
  // realtime απορρίπτεται στο join, οπότε το ανανεώνουμε ΠΡΙΝ ελέγξουμε κανάλια
  // (το getSession κάνει μόνο του refresh όταν το token έχει λήξει).
  try {
    await supabase.auth.getSession();
  } catch {
    /* Χωρίς δίκτυο το refresh αποτυγχάνει· συνεχίζουμε στον έλεγχο καναλιών. */
  }

  wakeListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* Ένας ακροατής που σκάει δεν ακυρώνει τους υπόλοιπους. */
    }
  });
}

function wire() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fireWake();
  });
  window.addEventListener('focus', () => fireWake());
  window.addEventListener('online', () => fireWake());
  // Επιστροφή από το bfcache (πίσω/μπροστά στο κινητό): η σελίδα «ξυπνά»
  // ολόκληρη από κατάψυξη, με νεκρά όλα τα sockets.
  window.addEventListener('pageshow', () => fireWake());
}

/** Δηλώνει κάτι που πρέπει να ξαναελεγχθεί μόλις ξυπνήσει η καρτέλα. */
export function onWake(fn) {
  wire();
  wakeListeners.add(fn);
  return () => {
    wakeListeners.delete(fn);
  };
}

/** Χειροκίνητο ξύπνημα — για κουμπιά «Ανανέωση». */
export function forceWake() {
  fireWake(true);
}

/**
 * Realtime κανάλι που επιβιώνει από πεσμένο δίκτυο, ληγμένο token και κοιμισμένη
 * καρτέλα. Επιστρέφει τη συνάρτηση καθαρισμού.
 *
 * @param {object}   opts
 * @param {string}   opts.name      Όνομα καναλιού (topic).
 * @param {function} opts.bind      Δηλώνει τα `.on(...)`. Καλείται ΞΑΝΑ σε κάθε
 *                                  επαναχτίσιμο — αν κρατάς αναφορά στο κανάλι
 *                                  (π.χ. για broadcast send), ανανέωσέ την εδώ.
 * @param {function} [opts.onResync] Καλείται σε κάθε επιτυχή (επανα)σύνδεση.
 * @param {boolean}  [opts.unique]  Προεπιλογή true: μοναδικό suffix στο όνομα ώστε
 *                                  δύο instances να μη συγκρούονται. ΠΡΟΣΟΧΗ: για
 *                                  broadcast πρέπει να είναι false — εκεί το όνομα
 *                                  είναι η διεύθυνση και πρέπει να ταιριάζει με
 *                                  τον παραλήπτη.
 */
export function liveChannel({ name, bind, onResync, unique = true }) {
  let disposed = false;
  let generation = 0;
  let current = null;
  let healthy = false;
  let rebuildTimer = null;

  const clearRebuild = () => {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
  };

  const build = async () => {
    if (disposed) return;
    clearRebuild();

    // Ο μετρητής γενιάς ακυρώνει τα callbacks του παλιού καναλιού: το κλείσιμό του
    // πυροδοτεί CLOSED και χωρίς αυτόν θα ζητούσε αμέσως νέο επαναχτίσιμο.
    const gen = ++generation;
    const previous = current;
    current = null;
    healthy = false;

    if (previous) {
      try {
        await supabase.removeChannel(previous);
      } catch {
        /* Ήδη κλειστό — προχωράμε στο νέο κανάλι. */
      }
      if (disposed || gen !== generation) return;
    }

    const topic = unique
      ? `${name}_${gen}_${Math.random().toString(36).slice(2, 8)}`
      : name;

    current = bind(supabase.channel(topic)).subscribe((status) => {
      if (disposed || gen !== generation) return;
      if (status === 'SUBSCRIBED') {
        healthy = true;
        if (onResync) onResync();
      } else {
        // CHANNEL_ERROR / TIMED_OUT / CLOSED
        healthy = false;
        scheduleRebuild();
      }
    });
  };

  const scheduleRebuild = () => {
    if (disposed || rebuildTimer) return;
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      build();
    }, REBUILD_DELAY_MS);
  };

  /** Υγιές = και το κανάλι μπήκε, και το από κάτω websocket ζει. */
  const check = () => {
    if (disposed) return;
    let socketAlive = true;
    try {
      socketAlive = supabase.realtime.isConnected();
    } catch {
      /* Άγνωστη κατάσταση socket — κρίνουμε μόνο από το healthy. */
    }
    if (!healthy || !socketAlive) build();
  };

  build();
  const offWake = onWake(check);
  const watchdog = setInterval(check, WATCHDOG_MS);

  return () => {
    disposed = true;
    offWake();
    clearInterval(watchdog);
    clearRebuild();
    if (current) {
      try {
        supabase.removeChannel(current);
      } catch {
        /* Στο unmount δεν έχει νόημα να ασχοληθούμε με αποτυχία κλεισίματος. */
      }
    }
    current = null;
  };
}

/**
 * Τυλίγει ένα onResync ώστε να αγνοεί την ΠΡΩΤΗ σύνδεση: εκεί τα αρχικά fetch του
 * component μόλις έχουν τρέξει και δεν έχει νόημα να ξαναγίνουν.
 */
export function skipFirst(fn) {
  let first = true;
  return (...args) => {
    if (first) {
      first = false;
      return;
    }
    fn(...args);
  };
}
