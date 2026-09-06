import { useCallback, useEffect, useRef } from 'react';

// ════════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΟΥΜΠΙ «ΠΙΣΩ» ΤΟΥ ANDROID
// ════════════════════════════════════════════════════════════════════════════
// Ο διαχειριστής έχει την εφαρμογή εγκατεστημένη ως συντόμευση στην αρχική
// οθόνη του κινητού. Το admin όμως είναι ΜΙΑ σελίδα: οι ενότητες αλλάζουν με
// state, οπότε το κινητό δεν έβλεπε καμία πλοήγηση και το «πίσω» τον πετούσε
// κατευθείαν έξω από την εφαρμογή.
//
// Εδώ γράφουμε κάθε αλλαγή ενότητας ως στάση στο ιστορικό (history.pushState),
// ώστε το «πίσω» να ξεδιπλώνει τη στοίβα των ενοτήτων που άνοιξε — μία-μία, με
// τη σειρά — και να βγαίνει έξω μόνο από τη ρίζα (τη στάση με την οποία άνοιξε
// η εφαρμογή, δηλαδή τον χάρτη).
//
// ΤΑ ΣΤΡΩΜΑΤΑ ΠΡΟΗΓΟΥΝΤΑΙ: όσο είναι ανοιχτό έστω ένα συρτάρι, παράθυρο
// επιβεβαίωσης ή το μενού «Περισσότερα», το «πίσω» κλείνει ΑΥΤΟ και δεν αγγίζει
// την ενότητα από κάτω. Κλείνει πάντα το τελευταίο που άνοιξε.
//
// Ο μηχανισμός: το «πίσω» πάνω σε στρώμα καταναλώνει μία στάση, την οποία
// ξαναγράφουμε αμέσως — έτσι το βάθος του ιστορικού μένει ίδιο και το κλείσιμο
// με το Χ δεν χρειάζεται καμία ασύγχρονη history.back() (που θα κόντραρε με τα
// pushState της πλοήγησης).

// Τα ανοιχτά στρώματα, με σειρά ανοίγματος. Ζουν σε module scope γιατί τα
// σηκώνουν components σε τελείως διαφορετικά σημεία του δέντρου (ConfirmDialog,
// συρτάρια, μενού) και το «πίσω» τα χρειάζεται όλα σε μία στοίβα.
const layers = [];
let seq = 0;

// Ποια ενότητα δείχνει τώρα η οθόνη — το γεμίζει το useSectionHistory.
let getTab = () => null;

// ── ΤΟ ΤΡΑΒΗΓΜΑ ΠΡΟΣ ΤΑ ΚΑΤΩ ΔΕΝ ΕΠΙΣΤΡΕΦΕΙ ΣΤΗΝ ΑΡΧΙΚΗ ────────────────────
// Αίτημα πελάτη 06/09/2026: στο κινητό το pull-to-refresh κάνει κανονικό reload
// της σελίδας. Η React ξαναξεκινούσε από τον χάρτη, οπότε ο διαχειριστής έχανε
// τη θέση του κάθε φορά που ήθελε απλώς φρέσκα δεδομένα.
//
// ΔΥΟ ΠΗΓΕΣ, ΜΕ ΑΥΤΗ ΤΗ ΣΕΙΡΑ:
//   1. `history.state` — επιβιώνει του reload και είναι η ΑΚΡΙΒΗΣ στάση όπου
//      βρισκόταν ο browser, άρα συμφωνεί με το τι θα κάνει το «πίσω».
//   2. `sessionStorage` — εφεδρικό για όποιον browser καθαρίζει το history.state
//      (και για την περίπτωση που η στάση δεν είναι δική μας).
// Και οι δύο ζουν όσο η καρτέλα: νέα καρτέλα ξεκινά κανονικά από τον χάρτη.
const TAB_KEY = 'vtx.admin.tab';

function rememberTab(tab) {
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    /* Ιδιωτική περιήγηση ή γεμάτος αποθηκευτικός χώρος — δεν είναι κρίσιμο. */
  }
}

/**
 * Η ενότητα με την οποία πρέπει να ξεκινήσει η εφαρμογή μετά από reload.
 *
 * @param {string}   fallback Πού πάμε όταν δεν υπάρχει τίποτα αποθηκευμένο.
 * @param {string[]} [valid]  Τα αποδεκτά id· φράχτης ώστε μια παλιά αποθηκευμένη
 *                            τιμή (από προηγούμενη έκδοση) να μη δείξει κενή οθόνη.
 */
export function restoreTab(fallback, valid) {
  if (typeof window === 'undefined') return fallback;

  const state = window.history.state;
  let tab = state?.vtx === 'tab' ? state.tab : null;

  if (!tab) {
    try {
      tab = sessionStorage.getItem(TAB_KEY);
    } catch {
      tab = null;
    }
  }

  if (!tab) return fallback;
  if (valid && !valid.includes(tab)) return fallback;
  return tab;
}

// Κάθε δική μας στάση φέρει { vtx: 'tab', tab }. Η ρίζα είναι επιπλέον
// σημαδεμένη με root:true: από εκεί και πίσω φεύγουμε από την εφαρμογή.
function tagRootEntry(tab) {
  rememberTab(tab);
  const state = window.history.state;
  if (state?.vtx === 'tab') {
    // Refresh: η στάση υπάρχει ήδη από πριν. Η React ξεκινά πλέον από ΤΗΝ ΙΔΙΑ
    // ενότητα (βλ. restoreTab), οπότε εδώ απλώς επιβεβαιώνεται η ταμπέλα.
    window.history.replaceState({ ...state, tab }, '');
    return;
  }
  window.history.replaceState({ vtx: 'tab', tab, root: true }, '');
}

// Ένα στρώμα δεν επιτρέπεται να ανοίξει ενώ πατάμε στη ρίζα: το «πίσω» θα
// κατανάλωνε τη ρίζα και η εφαρμογή θα έκλεινε αντί να κλείσει το στρώμα.
// Σπρώχνουμε μια εφεδρική στάση της ίδιας ενότητας για να έχει τι να φάει. Είναι
// σημαδεμένη ως `filler` γιατί δεν αντιστοιχεί σε πραγματική πλοήγηση: η πρώτη
// αλλαγή ενότητας την ΑΝΤΙΚΑΘΙΣΤΑ αντί να στοιβάξει από πάνω της, ώστε να μη
// μένει πίσω μια στάση που δεν αλλάζει τίποτα στην οθόνη.
function ensureNotOnRoot() {
  const state = window.history.state;
  if (state?.vtx === 'tab' && !state.root) return;
  const tab = getTab();
  if (!tab) return;
  window.history.pushState({ vtx: 'tab', tab, filler: true }, '');
}

// ── Για τα στρώματα: συρτάρια, modals, αναδυόμενα μενού ────────────────────
// Καλείται με το flag «είναι ανοιχτό» και τη συνάρτηση που το κλείνει. Όσο
// είναι ανοιχτό, το «πίσω» καλεί το onClose αντί να αλλάξει ενότητα. Το
// κλείσιμο με το Χ ή με κλικ έξω δεν χρειάζεται τίποτα — η αποδέσμευση γίνεται
// μόνη της.
export function useBackClose(open, onClose) {
  // Το onClose φτάνει σαν inline arrow και αλλάζει σε κάθε render· το κρατάμε σε
  // ref ώστε το στρώμα να μη χρειάζεται ξαναγράψιμο σε κάθε render.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    ensureNotOnRoot();
    const id = ++seq;
    layers.push({ id, close: () => closeRef.current?.() });
    return () => {
      const i = layers.findIndex((l) => l.id === id);
      if (i !== -1) layers.splice(i, 1);
    };
  }, [open]);
}

// ── Για το App: η στοίβα των ενοτήτων ──────────────────────────────────────
// Επιστρέφει το goToTab, που πρέπει να αντικαταστήσει ΚΑΘΕ setActiveTab στα
// κουμπιά του μενού — αλλιώς η ενότητα αλλάζει χωρίς να γραφτεί στο ιστορικό.
export function useSectionHistory({ enabled, activeTab, setActiveTab }) {
  const tabRef = useRef(activeTab);
  useEffect(() => { tabRef.current = activeTab; });

  useEffect(() => {
    getTab = () => tabRef.current;
    return () => { getTab = () => null; };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    tagRootEntry(tabRef.current);

    const onPopState = (event) => {
      // 1) Πρώτα τα στρώματα — κλείνει το τελευταίο που άνοιξε και ξαναγράφουμε
      //    τη στάση που μόλις καταναλώθηκε, ώστε να μη χαθεί βάθος.
      const layer = layers.pop();
      if (layer) {
        window.history.pushState(
          { vtx: 'tab', tab: tabRef.current, filler: event.state?.root === true },
          '',
        );
        layer.close();
        return;
      }
      // 2) Αλλιώς γυρνάμε στην ενότητα της στάσης. Αν η στάση δεν είναι δική
      //    μας, ο browser φεύγει έτσι κι αλλιώς — δεν έχουμε τι να κάνουμε.
      if (event.state?.vtx === 'tab' && event.state.tab) {
        rememberTab(event.state.tab);
        setActiveTab(event.state.tab);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [enabled, setActiveTab]);

  return useCallback((tab) => {
    if (tab === tabRef.current) return;
    rememberTab(tab);
    const state = { vtx: 'tab', tab };
    // Πάνω σε εφεδρική στάση γράφουμε από πάνω της — δεν είναι στάση που άξιζε
    // να επισκεφτεί κανείς με το «πίσω».
    if (window.history.state?.filler) window.history.replaceState(state, '');
    else window.history.pushState(state, '');
    setActiveTab(tab);
  }, [setActiveTab]);
}
