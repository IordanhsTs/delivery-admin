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
const FETCH_TIMEOUT_MS = 4000;
const FAILURES_BEFORE_SWITCH = 2;

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

function switchTo(index, reason) {
  if (index === activeIndex || !BACKENDS[index]) return;
  console.log(`🔄 [Failover] Μετάβαση στο backend "${BACKENDS[index].name}" (${reason})`);
  try { localStorage.setItem(ACTIVE_CACHE_KEY, String(index)); } catch (_) {}
  window.location.reload();
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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
      const res = await fetchWithTimeout(`${base}${sep}t=${Date.now()}`);
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

async function tick() {
  // 1) Κεντρική εντολή (Cloudflare Worker) — όλοι οι clients συμφωνούν.
  const desired = await readRemoteConfig();
  if (desired) {
    const idx = desired === 'standby' ? 1 : 0;
    if (idx !== activeIndex) switchTo(idx, 'κεντρική εντολή');
    consecutiveFailures = 0;
    return;
  }
  // 2) Fallback: τοπικός έλεγχος υγείας.
  if (await isHealthy(BACKENDS[activeIndex])) {
    consecutiveFailures = 0;
    return;
  }
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURES_BEFORE_SWITCH) {
    const other = activeIndex === 0 ? 1 : 0;
    if (BACKENDS[other] && (await isHealthy(BACKENDS[other]))) {
      switchTo(other, 'το ενεργό backend δεν αποκρίνεται');
    }
  }
}

if (BACKENDS.length > 1) {
  setInterval(tick, CHECK_INTERVAL_MS);
  window.addEventListener('online', tick);
  // Οι browsers περιορίζουν τα setInterval σε καρτέλες που δεν είναι ενεργές·
  // ξανα-ελέγχουμε τον τροχονόμο μόλις η καρτέλα ξαναγίνει ορατή, ώστε μετά
  // από failback να μη μείνει κολλημένη σε λάθος backend.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
}
