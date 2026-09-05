import { createClient } from '@supabase/supabase-js';

// ─── FAILOVER: primary + standby backend ─────────────────────────────────────
// Αν δεν οριστεί VITE_SUPABASE_STANDBY_URL, δουλεύει όπως πριν (χωρίς failover).
// Σε μετάβαση κάνουμε window.location.reload(): το session μένει στο
// localStorage (κοινό storageKey) και όλα τα realtime channels ξαναχτίζονται.

const BACKENDS = [
  {
    name: 'primary',
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
  {
    name: 'standby',
    url: import.meta.env.VITE_SUPABASE_STANDBY_URL,
    anonKey:
      import.meta.env.VITE_SUPABASE_STANDBY_ANON_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
].filter((b) => !!b.url);

const CONFIG_URLS = (import.meta.env.VITE_FAILOVER_CONFIG_URLS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const STORAGE_KEY = 'vertex-auth';
const ACTIVE_CACHE_KEY = 'vertex-active-backend';
const TENANT_KEY = 'vertex-tenant';   // MULTI-TENANT: το schema της εταιρίας του χρήστη
const CHECK_INTERVAL_MS = 30000;
// ΤΑ 4 ΔΕΥΤΕΡΟΛΕΠΤΑ ΗΤΑΝ ΛΙΓΑ (05/09/2026): σε κινητό με το ραδιόφωνο σε ύπνο ή
// με αδύναμο σήμα, το πρώτο αίτημα μετά από αδράνεια αργεί κανονικά 3-6 δευτ.
// Έτσι ένα υγιέστατο primary «έπεφτε» και η συσκευή γύριζε μόνη της στο εφεδρικό.
const CONFIG_TIMEOUT_MS = 8000;
const HEALTH_TIMEOUT_MS = 6000;
const FAILURES_BEFORE_SWITCH = 3;
// Οι browsers στραγγαλίζουν τα setInterval σε καρτέλα που δεν είναι μπροστά: δύο
// «συνεχόμενες» αποτυχίες μπορεί να απέχουν ώρες. Ξεχνάμε ό,τι είναι παλιό.
const FAILURE_MEMORY_MS = 5 * 60 * 1000;

function savedIndex() {
  try {
    const i = parseInt(localStorage.getItem(ACTIVE_CACHE_KEY) || '0', 10);
    return BACKENDS[i] ? i : 0;
  } catch (_) {
    return 0;
  }
}

const activeIndex = savedIndex();
const active = BACKENDS[activeIndex];

// MULTI-TENANT: το schema της εταιρίας (μπαίνει μετά το login, βλ. applyTenantFromSession).
// Αν λείπει (π.χ. σημερινό production χωρίς hook) → undefined → default schema 'public'.
function savedTenant() {
  try { return localStorage.getItem(TENANT_KEY) || undefined; } catch (_) { return undefined; }
}

const tenantSchema = savedTenant();

export const supabase = createClient(active.url, active.anonKey, {
  auth: { storageKey: STORAGE_KEY },
  ...(tenantSchema ? { db: { schema: tenantSchema } } : {}),
});

// Καλείται σε κάθε αλλαγή session: διαβάζει το `tenant` claim από το JWT,
// το αποθηκεύει, και κάνει reload αν άλλαξε (ώστε ο client να ξαναστηθεί με το
// σωστό schema). Ίδιο μοτίβο με το failover reload.
export function applyTenantFromSession(session) {
  if (!session || !session.access_token) return;
  try {
    const b64 = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64));
    const t = claims.tenant;
    if (t && t !== savedTenant()) {
      localStorage.setItem(TENANT_KEY, t);
      window.location.reload();
    }
  } catch (e) {
    console.error('[tenant] αδυναμία ανάγνωσης claim:', e);
  }
}

// Συνδέουμε αυτόματα: σε login/refresh εφαρμόζουμε το tenant, σε logout το καθαρίζουμε.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    try { localStorage.removeItem(TENANT_KEY); } catch (_) {}
    return;
  }
  applyTenantFromSession(session);
});

export function getActiveBackend() {
  return active;
}

// MULTI-TENANT: το schema στο οποίο ζουν τα δεδομένα του χρήστη. Τα realtime κανάλια
// ΠΡΕΠΕΙ να το χρησιμοποιούν (όχι καρφωτό 'public'), αλλιώς σε co_* tenant τα live
// updates σπάνε σιωπηλά. Fallback 'public' → backward-compatible με το σημερινό setup.
export function getTenantSchema() {
  return tenantSchema || 'public';
}

// Τρέχουμε στο εφεδρικό backend; Χρησιμεύει ΜΟΝΟ για ενημερωτική ένδειξη.
//
// ΤΙ ΑΛΛΑΞΕ (27/08/2026): παλιότερα αυτό λεγόταν isReadOnly() και έκλεινε τις
// εγγραφές σε failover, ώστε να μην αποκλίνουν τα δεδομένα. Το τίμημα ήταν ότι
// σε βλάβη η εταιρία δεν μπορούσε να δουλέψει — δεν έμπαινε ούτε μία παραγγελία.
// Πλέον το standby έχει ΑΚΡΙΒΩΣ τα ίδια δικαιώματα με το primary και δέχεται τα
// πάντα· η απόκλιση λύνεται με την αυτόματη επαναφορά standby→primary στις 02:00
// (merge-to-primary.sh στον standby server), όχι με το να κλείνουμε τη δουλειά.
//
// ΤΙ ΕΣΠΑΣΕ (05/09/2026): η μπάρα ζωγραφιζόταν κατευθείαν από το localStorage,
// πριν προλάβει να ρωτήσει κανείς. Ένα κινητό που είχε γυρίσει λάθος στο standby
// (βλ. tick() παρακάτω) έγραφε «εφεδρική λειτουργία» σε ΚΑΘΕ άνοιγμα, για μισό
// λεπτό, μέχρι το πρώτο tick. Πλέον η κατάσταση ξεκινά 'unknown' και γίνεται
// 'standby' μόνο όταν το επιβεβαιώσει ο κεντρικός τροχονόμος — ή, αν εκείνος δεν
// απαντά, όταν το κύριο αποδεδειγμένα δεν αποκρίνεται.
let backupState = 'unknown';        // 'unknown' | 'primary' | 'standby'
const backupListeners = new Set();

function setBackupState(next) {
  if (next === backupState) return;
  backupState = next;
  backupListeners.forEach((fn) => { try { fn(next); } catch (_) {} });
}

export function getBackupState() {
  return backupState;
}

export function subscribeBackupState(fn) {
  backupListeners.add(fn);
  return () => backupListeners.delete(fn);
}

export function isBackupMode() {
  return backupState === 'standby';
}

function switchTo(index, reason) {
  if (index === activeIndex || !BACKENDS[index]) return;
  console.log(`🔄 [Failover] Μετάβαση στο backend "${BACKENDS[index].name}" (${reason})`);
  try { localStorage.setItem(ACTIVE_CACHE_KEY, String(index)); } catch (_) {}
  window.location.reload();
}

function fetchWithTimeout(url, options = {}, timeoutMs = HEALTH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function isHealthy(backend) {
  try {
    const res = await fetchWithTimeout(`${backend.url}/auth/v1/health`, {
      headers: { apikey: backend.anonKey },
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function readRemoteConfig() {
  for (const base of CONFIG_URLS) {
    try {
      const sep = base.includes('?') ? '&' : '?';
      const res = await fetchWithTimeout(`${base}${sep}t=${Date.now()}`, {}, CONFIG_TIMEOUT_MS);
      if (res.ok) {
        const cfg = await res.json();
        if (cfg && (cfg.active === 'primary' || cfg.active === 'standby')) {
          return cfg.active;
        }
      }
    } catch (_) {}
  }
  return null;
}

let consecutiveFailures = 0;
let lastFailureAt = 0;

async function tick() {
  // 0) Αν η ΙΔΙΑ η συσκευή είναι εκτός δικτύου, δεν κρίνουμε κανένα backend:
  //    κάθε αίτημα θα σκάσει και θα κατηγορούσαμε άδικα το κύριο.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  // 1) Κεντρική εντολή (Cloudflare Worker) — όλοι οι clients συμφωνούν.
  const desired = await readRemoteConfig();
  if (desired) {
    const idx = desired === 'standby' ? 1 : 0;
    consecutiveFailures = 0;
    if (idx !== activeIndex) {
      switchTo(idx, 'κεντρική εντολή');
      return;
    }
    setBackupState(desired);
    return;
  }

  // 2) Ο τροχονόμος δεν απαντά. Ελέγχουμε ΚΑΙ ΤΑ ΔΥΟ backends ΤΑΥΤΟΧΡΟΝΑ.
  //    Εδώ ήταν το βασικό λάθος: παλιότερα μετρούσαμε αποτυχίες του κύριου σε
  //    άλλη στιγμή από τον έλεγχο του εφεδρικού. Ένα κινητό που ξυπνούσε με
  //    νεκρό δίκτυο μάζευε 2 «αποτυχίες» και μετά — με το δίκτυο πια ζωντανό —
  //    έβρισκε το εφεδρικό υγιές και γύριζε εκεί. Ψεύτικο failover.
  const other = activeIndex === 0 ? 1 : 0;
  const [activeOk, otherOk] = await Promise.all([
    isHealthy(BACKENDS[activeIndex]),
    BACKENDS[other] ? isHealthy(BACKENDS[other]) : Promise.resolve(false),
  ]);

  if (activeOk) {
    consecutiveFailures = 0;
    // Είμαστε στο εφεδρικό ΚΑΙ το κύριο όντως δεν αποκρίνεται → αληθινό failover.
    if (activeIndex === 1 && !otherOk) setBackupState('standby');
    return;
  }

  // Δεν αποκρίνεται ΚΑΝΕΝΑ από τα δύο → το πρόβλημα είναι το δικό μας δίκτυο.
  if (!otherOk) {
    consecutiveFailures = 0;
    return;
  }

  const now = Date.now();
  if (now - lastFailureAt > FAILURE_MEMORY_MS) consecutiveFailures = 0;
  lastFailureAt = now;
  consecutiveFailures += 1;

  if (consecutiveFailures >= FAILURES_BEFORE_SWITCH) {
    switchTo(other, 'το ενεργό backend δεν αποκρίνεται');
  }
}

if (BACKENDS.length > 1) {
  // ΑΜΕΣΩΣ, όχι σε 30 δευτ.: χωρίς αυτό, μια αποθηκευμένη (και πιθανώς λάθος)
  // επιλογή backend ίσχυε ανενόχλητη για μισό λεπτό σε κάθε φόρτωση.
  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
  window.addEventListener('online', tick);
  // Οι browsers περιορίζουν τα setInterval σε καρτέλες που δεν είναι ενεργές·
  // ξανα-ελέγχουμε τον τροχονόμο μόλις η καρτέλα ξαναγίνει ορατή, ώστε μετά
  // από failback να μη μείνει κολλημένη σε λάθος backend.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
} else {
  setBackupState(active?.name === 'standby' ? 'standby' : 'primary');
}
