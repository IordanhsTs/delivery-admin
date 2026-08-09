import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { confirmDialog } from './ConfirmDialog';
import {
  Bike, Plus, RefreshCcw, X, Save, Trash2, Wrench, ShieldCheck, ClipboardCheck,
  Gauge, Route, User, AlertTriangle, StickyNote, Euro, Calendar, Archive,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// ── Στόλος εταιρικών μηχανών (αίτημα πελάτη 05/08/2026) ─────────────────────
// Μία καρτέλα ανά μηχανάκι. Τα χιλιόμετρα ΔΕΝ πληκτρολογούνται: βγαίνουν από τις
// βάρδιες που δήλωσαν οι διανομείς στο driver app, πάνω στο GPS του 0013.
//
// ΓΙΑΤΙ ΟΛΟΙ ΟΙ ΥΠΟΛΟΓΙΣΜΟΙ ΕΡΧΟΝΤΑΙ ΑΠΟ ΤΟ `fleet_overview()`: το «πόσα χλμ
// μέχρι το service» και το «πόσες μέρες ως τη λήξη» τα βγάζει η βάση. Αν τα
// ξαναϋπολόγιζε το JS, θα υπήρχαν δύο ορισμοί του «εκπρόθεσμη» που θα
// διαφωνούσαν στην πρώτη αλλαγή.

const KINDS = [
  { value: 'note',    label: 'Σημείωση', icon: StickyNote },
  { value: 'service', label: 'Service',  icon: Wrench },
  { value: 'repair',  label: 'Επισκευή', icon: Wrench },
  { value: 'damage',  label: 'Ζημιά',    icon: AlertTriangle },
];

// Πόσο πριν το κατώφλι θεωρείται «πλησιάζει». 300 χλμ ≈ λίγες μέρες δουλειάς —
// αρκετός χρόνος για να κλειστεί ραντεβού στο συνεργείο.
const SERVICE_WARN_KM = 300;
const EXPIRY_WARN_DAYS = 30;

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function num(v) {
  return v === '' || v === null || v === undefined ? null : Number(v);
}

/** Κατάσταση service/εγγράφου → χρώμα + κείμενο. Ένας ορισμός, τρεις χρήσεις. */
function serviceStatus(v) {
  if (v.service_interval_km === null) return { tone: 'muted', text: 'Χωρίς κατώφλι' };
  const left = Number(v.service_due_in_km);
  if (left <= 0) return { tone: 'danger', text: `Ξεπερασμένο κατά ${Math.abs(left).toFixed(0)} χλμ` };
  if (left <= SERVICE_WARN_KM) return { tone: 'warning', text: `Σε ${left.toFixed(0)} χλμ` };
  return { tone: 'success', text: `Σε ${left.toFixed(0)} χλμ` };
}

function expiryStatus(dateStr, daysLeft) {
  if (!dateStr) return { tone: 'muted', text: 'Δεν έχει οριστεί' };
  const d = Number(daysLeft);
  if (d < 0) return { tone: 'danger', text: `Έληξε πριν ${Math.abs(d)} μέρες` };
  if (d <= EXPIRY_WARN_DAYS) return { tone: 'warning', text: `Σε ${d} μέρες` };
  return { tone: 'success', text: fmtDate(dateStr) };
}

const TONE = {
  danger:  { color: 'var(--danger)',  bg: 'var(--danger-bg)',  border: 'var(--danger-border)' },
  warning: { color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'var(--warning-border)' },
  success: { color: 'var(--success)', bg: 'var(--success-bg)', border: 'var(--success-border)' },
  muted:   { color: 'var(--text-muted)', bg: 'var(--bg-tertiary)', border: 'var(--border-subtle)' },
};

function Pill({ tone, children, icon: Icon, title }) {
  const t = TONE[tone] || TONE.muted;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap"
      style={{ color: t.color, backgroundColor: t.bg, border: `1px solid ${t.border}` }}
    >
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}

/** «1 σημείωση» / «4 σημειώσεις» — ο ενικός διαβαζόταν λάθος στις κάρτες. */
function plural(n, one, many) {
  return `${n} ${Number(n) === 1 ? one : many}`;
}

/** Ποσά με ελληνική μορφή: 118,40 € και όχι 118.40. */
function eur(v) {
  return Number(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export default function FleetVehicles() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);

  const fetchFleet = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('fleet_overview');
    if (error) {
      console.error(error);
      toast.error('Σφάλμα ανάκτησης στόλου: ' + error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFleet(); }, [fetchFleet]);

  async function addVehicle() {
    // Ο κωδικός είναι το μόνο υποχρεωτικό: ο πελάτης θέλει να προσθέσει τη
    // μηχανή τώρα και να συμπληρώσει ασφάλεια/ΚΤΕΟ όταν βρει τα χαρτιά.
    //
    // Ο επόμενος ΕΛΕΥΘΕΡΟΣ αριθμός, όχι το πλήθος+1: αν σβηστεί το moto2, το
    // πλήθος θα πρότεινε «moto3» που υπάρχει ήδη, και η προσθήκη θα έσκαγε.
    const used = rows
      .map((r) => /^moto(\d+)$/i.exec(r.code || ''))
      .filter(Boolean)
      .map((m) => Number(m[1]));
    const next = `moto${used.length ? Math.max(...used) + 1 : rows.length + 1}`;
    const { data, error } = await supabase
      .from('fleet_vehicles').insert({ code: next }).select('id').single();
    if (error) {
      toast.error(
        error.code === '23505'
          ? `Υπάρχει ήδη μηχανή με κωδικό «${next}».`
          : 'Δεν προστέθηκε: ' + error.message
      );
      return;
    }
    toast.success(`Προστέθηκε «${next}».`);
    await fetchFleet();
    setOpenId(data.id);
  }

  const open = rows.find((r) => r.id === openId) || null;

  // Σύνοψη κορυφής: μόνο ό,τι απαιτεί ενέργεια. Χωρίς αυτό ο πελάτης θα έπρεπε
  // να ανοίγει μία-μία τις καρτέλες για να δει αν κάτι έληξε.
  const alerts = rows.filter((r) => r.is_active).reduce(
    (a, r) => {
      if (r.service_interval_km !== null && Number(r.service_due_in_km) <= 0) a.service += 1;
      if (r.insurance_expires_at && Number(r.insurance_days_left) <= EXPIRY_WARN_DAYS) a.insurance += 1;
      if (r.kteo_expires_at && Number(r.kteo_days_left) <= EXPIRY_WARN_DAYS) a.kteo += 1;
      return a;
    },
    { service: 0, insurance: 0, kteo: 0 }
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Κεφαλίδα ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            <Bike size={22} color="#fff" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Στόλος μηχανών
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Χιλιόμετρα από τις βάρδιες των διανομέων — service, ασφάλεια, ΚΤΕΟ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchFleet} disabled={loading}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> Ανανέωση
          </button>
          <button onClick={addVehicle}
            className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white transition"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            <Plus size={16} /> Νέα μηχανή
          </button>
        </div>
      </div>

      {/* ── Τι χρειάζεται προσοχή ───────────────────────────────────────── */}
      {(alerts.service || alerts.insurance || alerts.kteo) ? (
        <div className="flex flex-wrap gap-2 mb-6">
          {alerts.service ? (
            <Pill tone="danger" icon={Wrench}>
              {plural(alerts.service, 'μηχανή θέλει service', 'μηχανές θέλουν service')}
            </Pill>
          ) : null}
          {alerts.insurance ? (
            <Pill tone="warning" icon={ShieldCheck}>
              {plural(alerts.insurance, 'ασφάλεια λήγει', 'ασφάλειες λήγουν')}
            </Pill>
          ) : null}
          {alerts.kteo ? (
            <Pill tone="warning" icon={ClipboardCheck}>
              {plural(alerts.kteo, 'ΚΤΕΟ λήγει', 'ΚΤΕΟ λήγουν')}
            </Pill>
          ) : null}
        </div>
      ) : null}

      {/* ── Οι μηχανές ──────────────────────────────────────────────────── */}
      {loading && !rows.length ? (
        <div className="p-10 text-center card-surface" style={{ ...cardStyle, color: 'var(--text-muted)' }}>Φόρτωση…</div>
      ) : !rows.length ? (
        <div className="p-12 text-center card-surface" style={cardStyle}>
          <Bike size={34} style={{ color: 'var(--text-muted)' }} className="mx-auto mb-3" />
          <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Δεν υπάρχουν καταχωρημένες μηχανές</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Πρόσθεσε τα εταιρικά μηχανάκια ώστε να μπορούν να τα δηλώνουν οι διανομείς.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((v, i) => {
            const svc = serviceStatus(v);
            const ins = expiryStatus(v.insurance_expires_at, v.insurance_days_left);
            const kteo = expiryStatus(v.kteo_expires_at, v.kteo_days_left);
            return (
              <motion.button
                key={v.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                onClick={() => setOpenId(v.id)}
                className="p-4 text-left transition hover:shadow-md card-surface"
                style={{ ...cardStyle, opacity: v.is_active ? 1 : 0.55 }}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{v.code}</span>
                      {!v.is_active ? <Pill tone="muted" icon={Archive}>Ανενεργή</Pill> : null}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {[v.make_model, v.plate].filter(Boolean).join(' · ') || 'Χωρίς στοιχεία'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black" style={{ color: 'var(--accent)' }}>
                      {Number(v.total_km).toLocaleString('el-GR', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      χλμ σύνολο
                    </div>
                  </div>
                </div>

                {v.current_driver_name ? (
                  <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold" style={{ color: 'var(--success)' }}>
                    <User size={13} /> Σε χρήση: {v.current_driver_name}
                  </div>
                ) : null}

                {/* Τα εικονίδια από μόνα τους δεν λένε ποιο νούμερο είναι ποιο —
                    το `title` το ξεκαθαρίζει χωρίς να φουσκώσει η κάρτα. */}
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone={svc.tone} icon={Wrench} title="Service">{svc.text}</Pill>
                  <Pill tone={ins.tone} icon={ShieldCheck} title="Ασφάλεια">{ins.text}</Pill>
                  <Pill tone={kteo.tone} icon={ClipboardCheck} title="ΚΤΕΟ">{kteo.text}</Pill>
                </div>

                {Number(v.notes_count) > 0 ? (
                  <div className="mt-3 text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <StickyNote size={12} /> {plural(v.notes_count, 'σημείωση', 'σημειώσεις')}
                  </div>
                ) : null}
              </motion.button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {open ? (
          <VehicleDetail
            vehicle={open}
            onClose={() => setOpenId(null)}
            onChanged={fetchFleet}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Η καρτέλα της μηχανής — συρτάρι από δεξιά
// ════════════════════════════════════════════════════════════════════════════
function VehicleDetail({ vehicle, onClose, onChanged }) {
  const [form, setForm] = useState(() => ({
    code: vehicle.code || '',
    plate: vehicle.plate || '',
    make_model: vehicle.make_model || '',
    model_year: vehicle.model_year ?? '',
    is_active: vehicle.is_active,
    odometer_base_km: vehicle.odometer_base_km ?? '',
    service_interval_km: vehicle.service_interval_km ?? '',
    service_last_km: vehicle.service_last_km ?? '',
    service_last_at: vehicle.service_last_at || '',
    insurance_expires_at: vehicle.insurance_expires_at || '',
    kteo_expires_at: vehicle.kteo_expires_at || '',
    fuel_l_per_100km: vehicle.fuel_l_per_100km ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const fetchNotes = useCallback(async () => {
    setNotesLoading(true);
    const { data, error } = await supabase
      .from('vehicle_notes')
      .select('*')
      .eq('vehicle_id', vehicle.id)
      .order('happened_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) toast.error('Σφάλμα ανάκτησης σημειώσεων: ' + error.message);
    setNotes(data || []);
    setNotesLoading(false);
  }, [vehicle.id]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function save() {
    if (!form.code.trim()) {
      toast.error('Ο κωδικός της μηχανής είναι υποχρεωτικός.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('fleet_vehicles').update({
      code: form.code.trim(),
      plate: form.plate.trim() || null,
      make_model: form.make_model.trim() || null,
      model_year: num(form.model_year),
      is_active: form.is_active,
      odometer_base_km: num(form.odometer_base_km) ?? 0,
      service_interval_km: num(form.service_interval_km),
      service_last_km: num(form.service_last_km),
      service_last_at: form.service_last_at || null,
      insurance_expires_at: form.insurance_expires_at || null,
      kteo_expires_at: form.kteo_expires_at || null,
      fuel_l_per_100km: num(form.fuel_l_per_100km),
      updated_at: new Date().toISOString(),
    }).eq('id', vehicle.id);
    setSaving(false);
    if (error) {
      toast.error(
        error.code === '23505'
          ? 'Υπάρχει ήδη μηχανή με αυτόν τον κωδικό.'
          : 'Δεν αποθηκεύτηκε: ' + error.message
      );
      return;
    }
    toast.success('Η καρτέλα αποθηκεύτηκε.');
    onChanged();
  }

  async function removeVehicle() {
    const ok = await confirmDialog(
      `Θα διαγραφεί η μηχανή «${vehicle.code}» και όλες οι σημειώσεις της. Οι βάρδιες και τα χιλιόμετρα παραμένουν, αλλά χάνουν την αντιστοίχιση. Αν η μηχανή απλώς αποσύρθηκε, προτίμησε το «Ανενεργή».`,
      { title: 'Διαγραφή μηχανής', confirmLabel: 'Διαγραφή', danger: true }
    );
    if (!ok) return;
    const { error } = await supabase.from('fleet_vehicles').delete().eq('id', vehicle.id);
    if (error) { toast.error('Δεν διαγράφηκε: ' + error.message); return; }
    toast.success('Η μηχανή διαγράφηκε.');
    onChanged();
    onClose();
  }

  const svc = serviceStatus(vehicle);
  const ins = expiryStatus(vehicle.insurance_expires_at, vehicle.insurance_days_left);
  const kteo = expiryStatus(vehicle.kteo_expires_at, vehicle.kteo_days_left);

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
        {/* ── Κεφαλίδα καρτέλας ─────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between gap-3"
             style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
              <Bike size={20} color="#fff" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black truncate" style={{ color: 'var(--text-primary)' }}>{vehicle.code}</h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {[vehicle.make_model, vehicle.plate].filter(Boolean).join(' · ') || 'Χωρίς στοιχεία'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* ── Τι λένε τα χιλιόμετρα ───────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Route, label: 'Σύνολο χλμ', value: Number(vehicle.total_km).toLocaleString('el-GR', { maximumFractionDigits: 0 }), accent: true },
              { icon: Gauge, label: 'Από GPS', value: Number(vehicle.gps_km).toLocaleString('el-GR', { maximumFractionDigits: 0 }) },
              { icon: Wrench, label: 'Από το τελ. service', value: `${Number(vehicle.km_since_service).toLocaleString('el-GR', { maximumFractionDigits: 0 })} χλμ` },
              { icon: Calendar, label: 'Βάρδιες', value: vehicle.shifts },
            ].map((s) => (
              <div key={s.label} className="p-3 card-surface" style={cardStyle}>
                <div className="flex items-center gap-1.5 mb-1">
                  <s.icon size={13} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {s.label}
                  </span>
                </div>
                <div className="text-xl font-black" style={{ color: s.accent ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill tone={svc.tone} icon={Wrench}>Service: {svc.text}</Pill>
            <Pill tone={ins.tone} icon={ShieldCheck}>Ασφάλεια: {ins.text}</Pill>
            <Pill tone={kteo.tone} icon={ClipboardCheck}>ΚΤΕΟ: {kteo.text}</Pill>
            {vehicle.current_driver_name ? (
              <Pill tone="success" icon={User}>{vehicle.current_driver_name}</Pill>
            ) : null}
          </div>

          {/* ── Στοιχεία μηχανής ────────────────────────────────────────── */}
          <section className="p-4 space-y-4 card-surface" style={cardStyle}>
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Στοιχεία μηχανής</h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Κωδικός">
                <input value={form.code} onChange={(e) => set('code', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Πινακίδα">
                <input value={form.plate} onChange={(e) => set('plate', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Μάρκα / μοντέλο">
                <input value={form.make_model} onChange={(e) => set('make_model', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Έτος">
                <input type="number" value={form.model_year} onChange={(e) => set('model_year', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
            </div>

            <Field
              label="Χιλιόμετρα κοντέρ κατά την καταχώρηση"
              hint="Τα χιλιόμετρα του GPS προστίθενται πάνω σε αυτόν τον αριθμό. Αν μείνει 0, η μηχανή μετράει σαν καινούργια."
            >
              <input type="number" step="1" min="0" value={form.odometer_base_km}
                onChange={(e) => set('odometer_base_km', e.target.value)}
                className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
            </Field>

            <Field
              label="Κατανάλωση (λίτρα / 100 χλμ)"
              hint="Άδειο = η προεπιλογή του στόλου από την καρτέλα «Χιλιόμετρα & Καύσιμα»."
            >
              <input type="number" step="0.1" min="0" value={form.fuel_l_per_100km}
                onChange={(e) => set('fuel_l_per_100km', e.target.value)}
                className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
            </Field>

            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => set('is_active', e.target.checked)} />
              Ενεργή — εμφανίζεται στη λίστα των διανομέων
            </label>
          </section>

          {/* ── Service & έγγραφα ───────────────────────────────────────── */}
          <section className="p-4 space-y-4 card-surface" style={cardStyle}>
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Service &amp; έγγραφα</h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Service κάθε (χλμ)" hint="Άδειο = χωρίς αυτόματη προειδοποίηση.">
                <input type="number" step="100" min="0" value={form.service_interval_km}
                  onChange={(e) => set('service_interval_km', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Τελευταίο service στα (χλμ)">
                <input type="number" step="1" min="0" value={form.service_last_km}
                  onChange={(e) => set('service_last_km', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Ημ/νία τελευταίου service">
                <input type="date" value={form.service_last_at}
                  onChange={(e) => set('service_last_at', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
              <div />
              <Field label="Λήξη ασφάλειας">
                <input type="date" value={form.insurance_expires_at}
                  onChange={(e) => set('insurance_expires_at', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Λήξη ΚΤΕΟ">
                <input type="date" value={form.kteo_expires_at}
                  onChange={(e) => set('kteo_expires_at', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={inputStyle} />
              </Field>
            </div>
          </section>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
              <Save size={16} /> {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>
            <button onClick={removeVehicle}
              className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
              style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>
              <Trash2 size={16} /> Διαγραφή
            </button>
          </div>

          {/* ── Σημειώσεις ──────────────────────────────────────────────── */}
          <NotesSection
            vehicle={vehicle}
            notes={notes}
            loading={notesLoading}
            onSaved={async () => { await fetchNotes(); onChanged(); }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Ιστορικό σημειώσεων — «αλλάξαμε τακάκια», «στο service μπήκε και πίσω λάστιχο»
// ════════════════════════════════════════════════════════════════════════════
function NotesSection({ vehicle, notes, loading, onSaved }) {
  const [kind, setKind] = useState('note');
  const [body, setBody] = useState('');
  const [atKm, setAtKm] = useState('');
  const [cost, setCost] = useState('');
  const [day, setDay] = useState(() => ymd(new Date()));
  // Όταν καταχωρείται service, το λογικό είναι να μηδενίσει και ο μετρητής —
  // αλλιώς ο πελάτης θα έγραφε τη σημείωση και η καρτέλα θα συνέχιζε να φωνάζει
  // «θέλει service». Προτεινόμενο, όχι υποχρεωτικό.
  const [resetService, setResetService] = useState(true);
  const [saving, setSaving] = useState(false);

  async function addNote() {
    if (!body.trim()) { toast.error('Γράψε τι έγινε.'); return; }
    setSaving(true);

    const { data: sess } = await supabase.auth.getSession();
    const km = num(atKm) ?? Number(vehicle.total_km);

    const { error } = await supabase.from('vehicle_notes').insert({
      vehicle_id: vehicle.id,
      kind,
      body: body.trim(),
      at_km: km,
      cost: num(cost),
      happened_on: day,
      created_by: sess?.session?.user?.id ?? null,
    });

    if (error) {
      setSaving(false);
      toast.error('Δεν αποθηκεύτηκε: ' + error.message);
      return;
    }

    if (kind === 'service' && resetService) {
      const { error: e2 } = await supabase.from('fleet_vehicles')
        .update({ service_last_km: km, service_last_at: day, updated_at: new Date().toISOString() })
        .eq('id', vehicle.id);
      if (e2) toast.error('Η σημείωση μπήκε, αλλά ο μετρητής service δεν ενημερώθηκε: ' + e2.message);
    }

    setSaving(false);
    setBody(''); setAtKm(''); setCost('');
    toast.success('Η σημείωση καταχωρήθηκε.');
    onSaved();
  }

  return (
    <section className="p-4 space-y-4 card-surface" style={cardStyle}>
      <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <StickyNote size={16} /> Σημειώσεις &amp; ιστορικό
      </h3>

      {/* Νέα σημείωση */}
      <div className="space-y-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.value} onClick={() => setKind(k.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
              style={kind === k.value
                ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff' }
                : { backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
              <k.icon size={13} /> {k.label}
            </button>
          ))}
        </div>

        <textarea
          value={body} onChange={(e) => setBody(e.target.value)} rows={3}
          placeholder="π.χ. Αλλαγή λαδιών και πίσω λάστιχο. Τακάκια εμπρός θέλουν έλεγχο στο επόμενο."
          className="w-full px-3 py-2 rounded-lg outline-none text-sm resize-y" style={inputStyle}
        />

        <div className="grid grid-cols-3 gap-2">
          <Field label="Ημερομηνία">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
          <Field label="Στα χλμ">
            <input type="number" step="1" min="0" value={atKm} onChange={(e) => setAtKm(e.target.value)}
              placeholder={String(Math.round(Number(vehicle.total_km)))}
              className="w-full px-2 py-1.5 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
          <Field label="Κόστος (€)">
            <input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg outline-none text-sm" style={inputStyle} />
          </Field>
        </div>

        {kind === 'service' ? (
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={resetService} onChange={(e) => setResetService(e.target.checked)} />
            Μέτρα αυτό ως το τελευταίο service (μηδενίζει τον μετρητή χιλιομέτρων)
          </label>
        ) : null}

        <button onClick={addNote} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
          <Plus size={16} /> {saving ? 'Καταχώρηση…' : 'Καταχώρηση'}
        </button>
      </div>

      {/* Ιστορικό */}
      {loading ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Φόρτωση…</p>
      ) : !notes.length ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
          Καμία σημείωση ακόμα.
        </p>
      ) : (
        <ul className="space-y-2 list-none p-0 m-0">
          {notes.map((n) => {
            const meta = KINDS.find((k) => k.value === n.kind) || KINDS[0];
            return (
              <li key={n.id} className="p-3 rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <Pill tone={n.kind === 'damage' ? 'danger' : n.kind === 'service' ? 'success' : 'muted'} icon={meta.icon}>
                    {meta.label}
                  </Pill>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {fmtDate(n.happened_on)}
                  </span>
                </div>
                <p className="text-sm m-0 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{n.body}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {n.at_km !== null ? (
                    <span className="flex items-center gap-1"><Gauge size={11} /> {Number(n.at_km).toLocaleString('el-GR')} χλμ</span>
                  ) : null}
                  {n.cost !== null ? (
                    <span className="flex items-center gap-1"><Euro size={11} /> {eur(n.cost)}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
