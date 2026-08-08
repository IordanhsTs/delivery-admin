import { useState, useEffect, useCallback } from 'react';
import { supabase, getTenantSchema } from './supabaseClient';
import {
  Building2, Bike, X, Plus, Save, Phone, Mail, Edit2, LogOut, MapPin,
  AlertTriangle, Ban, ShieldCheck, RefreshCcw, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from './ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';

// ── Καταστήματα & διανομείς σε καρτέλες (αίτημα πελάτη 08/08/2026) ───────────
// Ίδια γλώσσα με τον «Στόλο μηχανών»: πλέγμα από τετράγωνες κάρτες, ένα κουμπί
// «Επεξεργασία» ανοίγει συρτάρι με ΟΛΑ τα στοιχεία και τις ενέργειες. Ο πίνακας
// με τις 5 στήλες έσπαγε στο κινητό και έκρυβε τη μισή πληροφορία σε truncate.

// ── Παρουσία διανομέα: «συνδεδεμένος» ≠ «στέλνει στίγμα» ─────────────────────
// Το is_active λέει μόνο ότι η βάρδια είναι ανοιχτή· καθαρίζει σε κανονική
// αποσύνδεση. Αν το κινητό σωπάσει (χωρίς σήμα, κλειστό, εκτός μπαταρίας) το
// flag μένει true και ο διανομέας δείχνει για πάντα ενεργός. Η αλήθεια είναι
// στο last_seen, που ανεβαίνει με κάθε στίγμα του native service.
//
// ΠΡΟΣΟΧΗ: εδώ ΜΟΝΟ ΕΜΦΑΝΙΖΟΥΜΕ. Δεν πειράζουμε ποτέ αυτόματα το is_active —
// θα σήμαινε αποσύνδεση του διανομέα από την εφαρμογή του (βλ. status listener
// στο App.js του final-app), δηλαδή ακριβώς το πρόβλημα που λύνουμε.
const SIGNAL_FRESH_MIN = 2;    // ίδια κατώφλια με τον χάρτη (LiveMap.jsx)
const SIGNAL_OFFLINE_MIN = 20;

function driverPresence(courier, now) {
  if (courier.is_blocked) return { label: 'Μπλοκαρισμένος', tone: 'danger' };
  if (courier.is_active === false) return { label: 'Αποσυνδεδεμένος', tone: 'muted' };
  const ageMin = courier.last_seen
    ? (now - new Date(courier.last_seen).getTime()) / 60000
    : Infinity;
  if (ageMin <= SIGNAL_FRESH_MIN) return { label: 'Σε βάρδια', tone: 'success' };
  if (ageMin <= SIGNAL_OFFLINE_MIN) return { label: `Χωρίς σήμα ${Math.floor(ageMin)}′`, tone: 'warning' };
  if (ageMin === Infinity) return { label: 'Χωρίς στίγμα', tone: 'danger' };
  const hours = Math.floor(ageMin / 60);
  return { label: hours >= 1 ? `Χωρίς σήμα ${hours}ω` : `Χωρίς σήμα ${Math.floor(ageMin)}′`, tone: 'danger' };
}

// ── Κοινά κομμάτια εμφάνισης (ίδια με FleetVehicles.jsx) ─────────────────────
const TONE = {
  danger:  { color: 'var(--danger)',  bg: 'var(--danger-bg)',  border: 'var(--danger-border)' },
  warning: { color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'var(--warning-border)' },
  success: { color: 'var(--success)', bg: 'var(--success-bg)', border: 'var(--success-border)' },
  muted:   { color: 'var(--text-muted)', bg: 'var(--bg-tertiary)', border: 'var(--border-subtle)' },
};

function Pill({ tone, children, icon: Icon, title, dot }) {
  const t = TONE[tone] || TONE.muted;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap"
      style={{ color: t.color, backgroundColor: t.bg, border: `1px solid ${t.border}` }}
    >
      {dot ? <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: t.color }} /> : null}
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}

const cardStyle = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg, 14px)',
  boxShadow: 'var(--shadow-sm)',
};

const inputStyle = {
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
};

const subtleBtn = {
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-default)',
};

const accentBtn = { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' };

function toneBtn(tone) {
  const t = TONE[tone] || TONE.muted;
  return { backgroundColor: t.bg, color: t.color, border: `1px solid ${t.border}` };
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>{hint}</p>
      ) : null}
    </div>
  );
}

/** Ποσά με ελληνική μορφή: 1,50 και όχι 1.50. */
function eur(v) {
  return Number(v || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StoreManagement() {
  const [activeTab, setActiveTab] = useState('stores'); // 'stores' | 'couriers'
  // Ξεχωριστό flag ανά λίστα: φορτώνουν παράλληλα στο άνοιγμα, οπότε ένα κοινό
  // `loading` θα έσβηνε τον σκελετό της μιας μόλις τελείωνε η άλλη.
  const [loading, setLoading] = useState({ stores: true, couriers: true });

  const [stores, setStores] = useState([]);
  const [couriers, setCouriers] = useState([]);

  // Ό,τι είναι ανοιχτό στο συρτάρι: μια καρτέλα προς επεξεργασία ή μια νέα εγγραφή.
  const [openStore, setOpenStore] = useState(null);
  const [openCourier, setOpenCourier] = useState(null);
  const [creating, setCreating] = useState(null); // 'store' | 'courier' | null

  const fetchStores = useCallback(async () => {
    setLoading(l => ({ ...l, stores: true }));
    const { data, error } = await supabase.from('stores').select('*').order('name', { ascending: true });
    if (data) setStores(data);
    if (error) console.error('Σφάλμα φόρτωσης καταστημάτων:', error);
    setLoading(l => ({ ...l, stores: false }));
  }, []);

  const fetchCouriers = useCallback(async () => {
    setLoading(l => ({ ...l, couriers: true }));
    const { data, error } = await supabase.from('drivers').select('*').order('full_name', { ascending: true });
    if (data) setCouriers(data);
    if (error && error.code !== '42P01') { // Αγνοούμε το σφάλμα αν δεν υπάρχει ακόμα ο πίνακας
      console.error('Σφάλμα φόρτωσης διανομέων:', error);
    }
    setLoading(l => ({ ...l, couriers: false }));
  }, []);

  // Και οι δύο λίστες φορτώνουν μία φορά στο άνοιγμα — ο αριθμός δίπλα στο tab
  // πρέπει να είναι σωστός πριν το πατήσει κανείς, και η εναλλαγή να είναι ακαριαία.
  useEffect(() => {
    fetchStores();
    fetchCouriers();
  }, [fetchStores, fetchCouriers]);

  // Το «πριν X λεπτά» πρέπει να μεγαλώνει μόνο του, αλλιώς η καρτέλα θα έδειχνε
  // για ώρες τη φρεσκάδα της στιγμής που φορτώθηκε.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (activeTab !== 'couriers') return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [activeTab]);

  // Τα στίγματα φτάνουν ανά 10", οπότε η κατάσταση παρουσίας αλλάζει χωρίς καμία
  // ενέργεια του διαχειριστή — χωρίς realtime η λίστα θα έμενε παγωμένη.
  useEffect(() => {
    if (activeTab !== 'couriers') return;
    const channel = supabase
      .channel('admin:couriers_presence')
      .on('postgres_changes', { event: 'UPDATE', schema: getTenantSchema(), table: 'drivers' }, (payload) => {
        if (!payload.new) return;
        setCouriers(prev => prev.map(c => (c.id === payload.new.id ? { ...c, ...payload.new } : c)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTab]);

  const refresh = () => (activeTab === 'stores' ? fetchStores() : fetchCouriers());
  const busy = activeTab === 'stores' ? loading.stores : loading.couriers;

  // Το ανοιχτό συρτάρι διαβάζει πάντα από τη λίστα, ώστε μετά την αποθήκευση να
  // δείχνει τα φρέσκα δεδομένα αντί για ένα παγωμένο αντίγραφο.
  const openStoreRow = stores.find(s => s.id === openStore) || null;
  const openCourierRow = couriers.find(c => c.id === openCourier) || null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      {/* ── Κεφαλίδα ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={accentBtn}>
            <Building2 size={22} color="#fff" />
          </div>
          <div>
            <h1 className="text-2xl font-bold m-0" style={{ color: 'var(--text-primary)' }}>
              Διαχείριση Συστήματος
            </h1>
            <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>
              Καταστήματα, χρεώσεις και διανομείς — μία καρτέλα για τον καθένα
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={busy}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50"
            style={subtleBtn}>
            <RefreshCcw size={16} className={busy ? 'animate-spin' : ''} /> Ανανέωση
          </button>
          <button onClick={() => setCreating(activeTab === 'stores' ? 'store' : 'courier')}
            className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white transition"
            style={accentBtn}>
            <Plus size={16} /> {activeTab === 'stores' ? 'Νέο Κατάστημα' : 'Νέος Διανομέας'}
          </button>
        </div>
      </div>

      {/* ── Εναλλαγή ────────────────────────────────────────────────────── */}
      <div className="inline-flex gap-1 p-1 rounded-xl mb-6"
           style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}>
        {[
          { key: 'stores',   label: 'Καταστήματα',       icon: Building2, count: stores.length },
          { key: 'couriers', label: 'Διανομείς (Οδηγοί)', icon: Bike,     count: couriers.length },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="px-3.5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition"
            style={activeTab === t.key
              ? { ...accentBtn, color: '#fff' }
              : { backgroundColor: 'transparent', color: 'var(--text-secondary)' }}>
            <t.icon size={15} /> {t.label}
            {t.count ? (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md"
                    style={activeTab === t.key
                      ? { backgroundColor: 'rgba(255,255,255,0.22)' }
                      : { backgroundColor: 'var(--bg-card)' }}>
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {busy ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="h-44 skeleton rounded-[14px]" />)}
        </div>
      ) : activeTab === 'stores' ? (
        stores.length === 0 ? (
          <EmptyState icon={Building2} title="Δεν υπάρχουν καταστήματα"
            text="Πρόσθεσε το πρώτο κατάστημα για να μπορεί να στέλνει παραγγελίες." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store, i) => (
              <StoreCard key={store.id} store={store} index={i} onEdit={() => setOpenStore(store.id)} />
            ))}
          </div>
        )
      ) : (
        couriers.length === 0 ? (
          <EmptyState icon={Bike} title="Δεν υπάρχουν διανομείς"
            text="Πρόσθεσε τον πρώτο διανομέα για να μπορεί να συνδεθεί στην εφαρμογή." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {couriers.map((courier, i) => (
              <CourierCard key={courier.id} courier={courier} now={now} index={i}
                onEdit={() => setOpenCourier(courier.id)} />
            ))}
          </div>
        )
      )}

      <AnimatePresence>
        {openStoreRow ? (
          <StoreDrawer key="store" store={openStoreRow}
            onClose={() => setOpenStore(null)} onChanged={fetchStores} />
        ) : null}
        {openCourierRow ? (
          <CourierDrawer key="courier" courier={openCourierRow} now={now}
            onClose={() => setOpenCourier(null)} onChanged={fetchCouriers} />
        ) : null}
        {creating ? (
          <CreateDrawer key="create" kind={creating}
            onClose={() => setCreating(null)}
            onCreated={() => { setCreating(null); creating === 'store' ? fetchStores() : fetchCouriers(); }} />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="p-12 text-center" style={cardStyle}>
      <Icon size={34} style={{ color: 'var(--text-muted)' }} className="mx-auto mb-3" />
      <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</p>
      <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>{text}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Οι κάρτες
// ════════════════════════════════════════════════════════════════════════════
function EditButton({ onClick }) {
  return (
    <button onClick={onClick}
      className="w-full px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition text-white"
      style={accentBtn}>
      <Edit2 size={15} /> Επεξεργασία
    </button>
  );
}

function StoreCard({ store, index, onEdit }) {
  const hasPos = store.latitude != null && store.longitude != null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03 }}
      className="p-4 flex flex-col gap-3 transition hover:shadow-md"
      style={{ ...cardStyle, opacity: store.is_blocked ? 0.6 : 1 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{store.name}</span>
            {store.is_blocked ? <Pill tone="danger" icon={Ban}>Μπλοκαρισμένο</Pill> : null}
          </div>
          {/* Τηλέφωνο/email είναι πληροφορία που διαβάζεται, όχι υποσημείωση —
              με `--text-muted` στο σκούρο θέμα έπεφταν κάτω από 3:1. */}
          <div className="text-xs mt-1.5 flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1.5"><Phone size={12} /> {store.phone || '—'}</span>
            <span className="flex items-center gap-1.5 truncate" title={store.email || ''}>
              <Mail size={12} /> {store.email || '—'}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black" style={{ color: 'var(--accent)' }}>{eur(store.delivery_fee)} €</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            ανά παραγγελία
          </div>
        </div>
      </div>

      {/* Θέση καταστήματος: αφετηρία για απόσταση/χρέωση — χωρίς αυτή δεν
          υπολογίζεται τίποτα, οπότε φαίνεται πάνω στην κάρτα. */}
      <div className="flex flex-wrap gap-1.5">
        {hasPos ? (
          <Pill tone="success" icon={MapPin} title="Θέση καταστήματος">
            {Number(store.latitude).toFixed(5)}, {Number(store.longitude).toFixed(5)}
          </Pill>
        ) : (
          <Pill tone="warning" icon={MapPin}>Χωρίς θέση — δεν υπολογίζεται απόσταση</Pill>
        )}
      </div>

      <div className="mt-auto pt-1"><EditButton onClick={onEdit} /></div>
    </motion.div>
  );
}

function CourierCard({ courier, now, index, onEdit }) {
  const presence = driverPresence(courier, now);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03 }}
      className="p-4 flex flex-col gap-3 transition hover:shadow-md"
      style={{ ...cardStyle, opacity: courier.is_blocked ? 0.6 : 1 }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
             style={{ backgroundColor: 'var(--accent-muted)' }}>
          <Bike size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-black leading-tight" style={{ color: 'var(--text-primary)' }}>
            {courier.full_name}
          </div>
          {/* Τηλέφωνο/email είναι πληροφορία που διαβάζεται, όχι υποσημείωση —
              με `--text-muted` στο σκούρο θέμα έπεφταν κάτω από 3:1. */}
          <div className="text-xs mt-1.5 flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1.5"><Phone size={12} /> {courier.phone || '—'}</span>
            <span className="flex items-center gap-1.5 truncate" title={courier.email || ''}>
              <Mail size={12} /> {courier.email || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Pill
          tone={presence.tone}
          dot={presence.tone === 'success'}
          icon={presence.tone === 'warning' || (presence.tone === 'danger' && !courier.is_blocked) ? AlertTriangle : undefined}
          title="Βασίζεται στο τελευταίο στίγμα GPS του κινητού"
        >
          {presence.label}
        </Pill>
      </div>

      <div className="mt-auto pt-1"><EditButton onClick={onEdit} /></div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Το συρτάρι — κοινό κέλυφος για επεξεργασία και νέα εγγραφή
// ════════════════════════════════════════════════════════════════════════════
function Drawer({ icon: Icon, title, subtitle, onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[900] flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl h-full overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between gap-3"
             style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={accentBtn}>
              <Icon size={20} color="#fff" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black truncate m-0" style={{ color: 'var(--text-primary)' }}>{title}</h2>
              <p className="text-xs truncate m-0" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}

/** Μπλοκάρισμα/ξεμπλοκάρισμα — ίδια λογική για καταστήματα και διανομείς. */
async function setBlocked(table, row, label, onChanged) {
  const blocking = !row.is_blocked;
  if (blocking) {
    const ok = await confirmDialog(
      `Μπλοκάρισμα «${label}»; Η πρόσβαση διακόπτεται αμέσως.`,
      { title: 'Μπλοκάρισμα', confirmLabel: 'Μπλοκάρισμα', danger: true }
    );
    if (!ok) return;
  }
  const { error } = await supabase.from(table).update({ is_blocked: blocking }).eq('id', row.id);
  if (error) {
    toast.error('Σφάλμα κατά την αλλαγή κατάστασης μπλοκαρίσματος.');
    console.error(error);
    return;
  }
  toast.success(blocking ? 'Το μπλοκάρισμα εφαρμόστηκε.' : 'Το μπλοκάρισμα αφαιρέθηκε.');
  onChanged();
}

function BlockButton({ blocked, onClick }) {
  return (
    <button onClick={onClick}
      className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
      style={toneBtn(blocked ? 'success' : 'danger')}>
      {blocked ? <><ShieldCheck size={16} /> Ξεμπλοκάρισμα</> : <><Ban size={16} /> Μπλοκάρισμα</>}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Καρτέλα καταστήματος
// ════════════════════════════════════════════════════════════════════════════
function StoreDrawer({ store, onClose, onChanged }) {
  const [form, setForm] = useState(() => ({
    name: store.name || '',
    phone: store.phone || '',
    delivery_fee: store.delivery_fee ?? '',
    latitude: store.latitude ?? '',
    longitude: store.longitude ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Αποθηκεύει στοιχεία, χρέωση ΚΑΙ συντεταγμένες του καταστήματος.
  //
  // Οι συντεταγμένες μπαίνουν αυτόματα (γεωκωδικοποίηση της διεύθυνσης από την
  // εφαρμογή του καταστήματος), αλλά ΜΟΝΟ ο διαχειριστής μπορεί να τις διορθώσει
  // — και η διόρθωσή του υπερισχύει, γιατί πάνω τους βασίζεται ο υπολογισμός
  // απόστασης (όριο 15χλμ + επιπλέον χρέωση), άρα λεφτά.
  async function save() {
    if (!form.name.trim()) { toast.error('Το όνομα του καταστήματος είναι υποχρεωτικό.'); return; }

    const fee = Number(String(form.delivery_fee).replace(',', '.'));
    if (!Number.isFinite(fee) || fee < 0) { toast.error('Η χρέωση πρέπει να είναι θετικός αριθμός.'); return; }

    const lat = String(form.latitude).trim() === '' ? null : Number(form.latitude);
    const lng = String(form.longitude).trim() === '' ? null : Number(form.longitude);

    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
      toast.error('Οι συντεταγμένες πρέπει να είναι αριθμοί.');
      return;
    }
    if ((lat === null) !== (lng === null)) {
      toast.error('Συμπληρώστε ΚΑΙ τα δύο πεδία συντεταγμένων ή αφήστε τα κενά.');
      return;
    }
    if (lat !== null && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
      toast.error('Μη έγκυρες συντεταγμένες.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('stores').update({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      delivery_fee: fee,
      latitude: lat,
      longitude: lng,
    }).eq('id', store.id);
    setSaving(false);

    if (error) {
      toast.error('Υπήρξε σφάλμα κατά την αποθήκευση.');
      console.error(error);
      return;
    }
    toast.success('Το κατάστημα ενημερώθηκε!');
    onChanged();
    onClose();
  }

  return (
    <Drawer icon={Building2} title={store.name}
      subtitle={store.email || 'Χωρίς email'} onClose={onClose}>

      <section className="p-4 space-y-4" style={cardStyle}>
        <h3 className="font-bold text-sm m-0" style={{ color: 'var(--text-primary)' }}>Στοιχεία καταστήματος</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Όνομα καταστήματος">
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
          <Field label="Τηλέφωνο">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
        </div>

        {/* Το email είναι το login του καταστήματος — αλλαγή εδώ θα άλλαζε μόνο
            τον πίνακα, όχι τον λογαριασμό, και το μαγαζί δεν θα ξανάμπαινε. */}
        <Field label="Email (login)" hint="Δεν αλλάζει από εδώ — είναι ο λογαριασμός σύνδεσης του καταστήματος.">
          <div className="w-full px-3 py-2 rounded-lg text-sm flex items-center gap-2"
               style={{ ...inputStyle, opacity: 0.75 }}>
            <Lock size={13} style={{ color: 'var(--text-muted)' }} />
            <span className="truncate">{store.email || '—'}</span>
          </div>
        </Field>

        <Field label="Χρέωση ανά παραγγελία (€)">
          <input type="number" step="0.10" min="0" value={form.delivery_fee}
            onChange={(e) => set('delivery_fee', e.target.value)}
            className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
        </Field>
      </section>

      <section className="p-4 space-y-4" style={cardStyle}>
        <h3 className="font-bold text-sm flex items-center gap-2 m-0" style={{ color: 'var(--text-primary)' }}>
          <MapPin size={16} /> Θέση στον χάρτη
        </h3>

        {store.address ? (
          <p className="text-xs m-0" style={{ color: 'var(--text-muted)' }}>
            Διεύθυνση: <span style={{ color: 'var(--text-secondary)' }}>{store.address}</span>
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Πλάτος (lat)">
            <input type="number" step="0.000001" value={form.latitude}
              onChange={(e) => set('latitude', e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
          <Field label="Μήκος (lng)">
            <input type="number" step="0.000001" value={form.longitude}
              onChange={(e) => set('longitude', e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
        </div>
        <p className="text-[11px] m-0 leading-snug" style={{ color: 'var(--text-muted)' }}>
          Αφετηρία για τον υπολογισμό απόστασης και της επιπλέον χρέωσης. Χωρίς
          συντεταγμένες δεν υπολογίζεται απόσταση.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-50"
          style={accentBtn}>
          <Save size={16} /> {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        <BlockButton blocked={store.is_blocked}
          onClick={() => setBlocked('stores', store, store.name, onChanged)} />
      </div>
    </Drawer>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Καρτέλα διανομέα
// ════════════════════════════════════════════════════════════════════════════
function CourierDrawer({ courier, now, onClose, onChanged }) {
  const [form, setForm] = useState(() => ({
    full_name: courier.full_name || '',
    phone: courier.phone || '',
    email: courier.email || '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.full_name.trim()) { toast.error('Το ονοματεπώνυμο είναι υποχρεωτικό.'); return; }
    setSaving(true);
    const { error } = await supabase.from('drivers').update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    }).eq('id', courier.id);
    setSaving(false);

    if (error) {
      toast.error('Σφάλμα κατά την αποθήκευση στοιχείων.');
      console.error(error);
      return;
    }
    toast.success('Τα στοιχεία του διανομέα ενημερώθηκαν!');
    onChanged();
    onClose();
  }

  // Force-logout: κλείνει τη σύνδεση του διανομέα σε όποια συσκευή κι αν είναι.
  // is_active=false → το κινητό (αν online) αυτο-αποσυνδέεται μέσω του listener·
  // fcm_token=null → σταματούν οι ειδοποιήσεις· active_device_id=null → καθαρή
  // κατάσταση για επόμενο login. Αν είναι offline, αποσυνδέεται μόλις ξανανοίξει.
  async function forceLogout() {
    const ok = await confirmDialog(
      `Αποσύνδεση του διανομέα «${courier.full_name || ''}» από τη συσκευή του;`,
      { danger: true, confirmLabel: 'Αποσύνδεση' }
    );
    if (!ok) return;
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: false, fcm_token: null, active_device_id: null })
      .eq('id', courier.id);
    if (error) {
      toast.error('Σφάλμα κατά την αποσύνδεση.');
      console.error(error);
      return;
    }
    toast.success('Ο διανομέας αποσυνδέθηκε από τη συσκευή του.');
    onChanged();
  }

  const presence = driverPresence(courier, now);

  return (
    <Drawer icon={Bike} title={courier.full_name}
      subtitle={courier.email || 'Χωρίς email'} onClose={onClose}>

      <div className="flex flex-wrap gap-2">
        <Pill tone={presence.tone} dot={presence.tone === 'success'}
          title="Βασίζεται στο τελευταίο στίγμα GPS του κινητού">
          {presence.label}
        </Pill>
        {courier.is_blocked ? <Pill tone="danger" icon={Ban}>Μπλοκαρισμένος</Pill> : null}
      </div>

      <section className="p-4 space-y-4" style={cardStyle}>
        <h3 className="font-bold text-sm m-0" style={{ color: 'var(--text-primary)' }}>Στοιχεία διανομέα</h3>

        <Field label="Ονοματεπώνυμο">
          <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)}
            className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Τηλέφωνο">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
          <Field label="Email" hint="Μόνο για εμφάνιση — η σύνδεση γίνεται με τον λογαριασμό του.">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-50"
          style={accentBtn}>
          <Save size={16} /> {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        <BlockButton blocked={courier.is_blocked}
          onClick={() => setBlocked('drivers', courier, courier.full_name, onChanged)} />
        <button onClick={forceLogout}
          title="Αποσύνδεση από τη συσκευή του"
          className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
          style={subtleBtn}>
          <LogOut size={16} /> Αποσύνδεση συσκευής
        </button>
      </div>
    </Drawer>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Νέα εγγραφή — καταστήματος ή διανομέα
// ════════════════════════════════════════════════════════════════════════════
function CreateDrawer({ kind, onClose, onCreated }) {
  const isStore = kind === 'store';
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', fee: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim() || !form.password.trim()) {
      toast.warning('Παρακαλώ συμπληρώστε όλα τα υποχρεωτικά πεδία.');
      return;
    }
    setSaving(true);

    const body = {
      email: form.email.trim(),
      password: form.password.trim(),
      role: isStore ? 'store' : 'driver',
      name: form.name.trim(),
      phone: form.phone.trim(),
    };
    if (isStore) body.fee = parseFloat(String(form.fee).replace(',', '.')) || 0;

    const { data, error } = await supabase.functions.invoke('create-user-admin', { body });
    setSaving(false);

    if (data?.error) {
      toast.error(`Σφάλμα backend: ${data.error}`);
      return;
    }
    if (error) {
      if (error.code === '42P01') {
        toast.error("Πρέπει να δημιουργήσετε τον πίνακα 'drivers' στο Supabase πρώτα!");
      } else {
        toast.error(`Σφάλμα: ${error.message}`);
      }
      console.error(error);
      return;
    }
    toast.success(isStore ? 'Το κατάστημα δημιουργήθηκε επιτυχώς!' : 'Ο διανομέας δημιουργήθηκε επιτυχώς!');
    onCreated();
  }

  return (
    <Drawer icon={isStore ? Building2 : Bike}
      title={isStore ? 'Νέο κατάστημα' : 'Νέος διανομέας'}
      subtitle="Δημιουργείται και ο λογαριασμός σύνδεσης"
      onClose={onClose}>

      <form onSubmit={submit} className="space-y-6">
        <section className="p-4 space-y-4" style={cardStyle}>
          <Field label={isStore ? 'Όνομα καταστήματος *' : 'Ονοματεπώνυμο *'}>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder={isStore ? 'π.χ. Burger House' : 'π.χ. Γιάννης Παπ.'}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} required />
          </Field>
          <Field label="Τηλέφωνο *">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
              placeholder={isStore ? 'π.χ. 2385012345' : 'π.χ. 6901234567'}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} required />
          </Field>
          {isStore ? (
            <Field label="Χρέωση ανά παραγγελία (€)">
              <input type="number" step="0.10" min="0" value={form.fee}
                onChange={(e) => set('fee', e.target.value)} placeholder="π.χ. 1.50"
                className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
            </Field>
          ) : null}
        </section>

        <section className="p-4 space-y-4" style={cardStyle}>
          <h3 className="font-bold text-sm m-0" style={{ color: 'var(--text-primary)' }}>Λογαριασμός σύνδεσης</h3>
          <Field label="Email (login) *">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
              placeholder={isStore ? 'π.χ. store@test.com' : 'π.χ. driver@test.com'}
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} required />
          </Field>
          <Field label="Κωδικός *">
            <input type="text" value={form.password} onChange={(e) => set('password', e.target.value)}
              placeholder={isStore ? 'π.χ. StorePass123!' : 'π.χ. DriverPass123!'}
              autoComplete="off"
              className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} required />
          </Field>
        </section>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-50"
            style={accentBtn}>
            <Plus size={16} /> {saving ? 'Δημιουργία…' : 'Δημιουργία'}
          </button>
          <button type="button" onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2" style={subtleBtn}>
            <X size={16} /> Ακύρωση
          </button>
        </div>
      </form>
    </Drawer>
  );
}
