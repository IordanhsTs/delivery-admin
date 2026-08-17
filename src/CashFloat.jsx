import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useCashFloat } from './useCashFloat';
import { confirmDialog } from './ConfirmDialog';
import {
  Wallet, Fuel, PlusCircle, Settings2, Save, ChevronLeft, ChevronRight,
  AlertTriangle, RefreshCcw, User, Banknote, CircleDollarSign, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

// ── Εβδομάδα Δευτέρα→Κυριακή — ίδια λογική με FuelReport.jsx ────────────────
function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const GREEK_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
function prettyRange(from, to) {
  const f = `${from.getDate()} ${GREEK_MONTHS[from.getMonth()]}`;
  const t = `${to.getDate()} ${GREEK_MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  return `${f} – ${t}`;
}
function eur(v) {
  return Number(v || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function prettyDateTime(iso) {
  return new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const card = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg, 12px)',
  boxShadow: 'var(--shadow-sm)',
};
const inputStyle = {
  backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)',
};
const accentBtn = { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' };
const subtleBtn = {
  backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)',
};

export default function CashFloat() {
  const { balance, standardAmount, threshold, isLow, refresh: refreshOverview } = useCashFloat();

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = ymd(weekStart) === ymd(mondayOf(new Date()));

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_cash_ledger_history', {
      p_from: ymd(weekStart), p_to: ymd(weekEnd),
    });
    if (error) {
      toast.error('Σφάλμα ανάκτησης ιστορικού: ' + error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // ── Εκκρεμείς οφειλές σε διανομείς (ταμείο + βενζίνη, μαζί — βλ. 0023) ─────
  // Δεν υπάρχει "για την εβδομάδα" φίλτρο εδώ, σκόπιμα: το «τι εκκρεμεί» δεν
  // έχει σχέση με ποια εβδομάδα κοιτάει ο admin στο ιστορικό από κάτω.
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [settlingId, setSettlingId] = useState(null);
  const pendingTotal = pending.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    const { data, error } = await supabase.rpc('admin_pending_expenses');
    setPendingLoading(false);
    if (error) { toast.error('Σφάλμα ανάκτησης εκκρεμών οφειλών: ' + error.message); return; }
    setPending(data || []);
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  async function settlePending(p) {
    const ok = await confirmDialog(
      `Είστε σίγουροι ότι ο/η ${p.driver_name} έλαβε ${eur(p.amount)} € (${p.kind === 'cash' ? 'POS' : 'Βενζίνη'});`,
      { confirmLabel: 'Ναι, το έλαβε' },
    );
    if (!ok) return;

    setSettlingId(p.id);
    const { error } = await supabase.rpc('admin_set_expense_received', {
      p_kind: p.kind, p_id: p.id, p_received: true,
    });
    setSettlingId(null);
    if (error) { toast.error('Δεν ενημερώθηκε: ' + error.message); return; }
    toast.success('Καταχωρήθηκε ως πληρωμένο.');
    fetchPending();
    fetchSettled();
  }

  // ── Πρόσφατα διευθετημένες — για αναίρεση κατά λάθος tick (kiosk ή admin) ──
  const [settled, setSettled] = useState([]);
  const [settledLoading, setSettledLoading] = useState(true);
  const [showSettled, setShowSettled] = useState(false);
  const [undoingId, setUndoingId] = useState(null);

  const fetchSettled = useCallback(async () => {
    setSettledLoading(true);
    const { data, error } = await supabase.rpc('admin_settled_expenses', { p_limit: 20 });
    setSettledLoading(false);
    if (error) { toast.error('Σφάλμα ανάκτησης πληρωμένων: ' + error.message); return; }
    setSettled(data || []);
  }, []);

  useEffect(() => { fetchSettled(); }, [fetchSettled]);

  async function undoSettled(s) {
    setUndoingId(s.id);
    const { error } = await supabase.rpc('admin_set_expense_received', {
      p_kind: s.kind, p_id: s.id, p_received: false,
    });
    setUndoingId(null);
    if (error) { toast.error('Δεν αναιρέθηκε: ' + error.message); return; }
    toast.success('Η δήλωση επανήλθε σε εκκρεμή.');
    fetchSettled();
    fetchPending();
  }

  // ── Ανεφοδιασμός ──────────────────────────────────────────────────────────
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [addingTopup, setAddingTopup] = useState(false);

  async function addTopup(e) {
    e.preventDefault();
    const amount = parseFloat(String(topupAmount).replace(',', '.'));
    if (!(amount > 0)) { toast.error('Βάλε ένα έγκυρο ποσό.'); return; }
    setAddingTopup(true);
    const { error } = await supabase.rpc('admin_add_cash_topup', {
      p_amount: amount, p_note: topupNote.trim() || null,
    });
    setAddingTopup(false);
    if (error) { toast.error('Ο ανεφοδιασμός απέτυχε: ' + error.message); return; }
    toast.success('Ο ανεφοδιασμός καταχωρήθηκε.');
    setTopupAmount('');
    setTopupNote('');
    refreshOverview();
    fetchHistory();
  }

  // ── Ρυθμίσεις ─────────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ standard_amount: '', low_balance_threshold: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setSettings({ standard_amount: String(standardAmount || ''), low_balance_threshold: String(threshold || '') });
  }, [standardAmount, threshold]);

  async function saveSettings() {
    const std = parseFloat(String(settings.standard_amount).replace(',', '.'));
    const thr = parseFloat(String(settings.low_balance_threshold).replace(',', '.'));
    if (!(std >= 0) || !(thr >= 0)) { toast.error('Οι τιμές πρέπει να είναι μη αρνητικοί αριθμοί.'); return; }
    setSavingSettings(true);
    const { error } = await supabase.rpc('admin_update_cash_float_settings', {
      p_standard_amount: std, p_low_balance_threshold: thr,
    });
    setSavingSettings(false);
    if (error) { toast.error('Δεν αποθηκεύτηκε: ' + error.message); return; }
    toast.success('Οι ρυθμίσεις ταμείου αποθηκεύτηκαν.');
    refreshOverview();
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Κεφαλίδα ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={accentBtn}>
            <Wallet size={22} color="#fff" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Ταμείο</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Δηλώσεις POS από το κιόσκ των διανομέων
            </p>
          </div>
        </div>
        <button onClick={() => setShowSettings((s) => !s)}
          className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition"
          style={subtleBtn}>
          <Settings2 size={16} /> Ρυθμίσεις
        </button>
      </div>

      {/* ── Υπόλοιπο ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-5 card-surface"
          style={{
            ...card,
            ...(isLow ? { borderColor: 'var(--danger-border)', backgroundColor: 'var(--danger-bg)' } : {}),
          }}>
          <div className="flex items-center gap-2 mb-2">
            <Banknote size={16} style={{ color: isLow ? 'var(--danger)' : 'var(--text-muted)' }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: isLow ? 'var(--danger)' : 'var(--text-muted)' }}>
              Τρέχον υπόλοιπο
            </span>
            {isLow && <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />}
          </div>
          <div className="text-2xl font-black" style={{ color: isLow ? 'var(--danger)' : 'var(--text-primary)' }}>
            {eur(balance)} €
          </div>
          {isLow && (
            <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--danger)' }}>
              Κάτω από το όριο των {eur(threshold)} € — χρειάζεται ανεφοδιασμός
            </p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="p-5 card-surface" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Στάνταρ ταμείο (στόχος)
          </div>
          <div className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{eur(standardAmount)} €</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="p-5 card-surface hidden lg:block" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Ειδοποίηση κάτω από
          </div>
          <div className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{eur(threshold)} €</div>
        </motion.div>
      </div>

      {/* ── Ρυθμίσεις ────────────────────────────────────────────────────── */}
      {showSettings && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 overflow-hidden">
          <div className="p-5 card-surface" style={card}>
            <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Ρυθμίσεις ταμείου</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Στάνταρ ταμείο (€)
                </label>
                <input type="number" step="1" min="0" value={settings.standard_amount}
                  onChange={(e) => setSettings((s) => ({ ...s, standard_amount: e.target.value }))}
                  className="px-3 py-2 rounded-lg w-36 outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Ειδοποίηση κάτω από (€)
                </label>
                <input type="number" step="1" min="0" value={settings.low_balance_threshold}
                  onChange={(e) => setSettings((s) => ({ ...s, low_balance_threshold: e.target.value }))}
                  className="px-3 py-2 rounded-lg w-36 outline-none" style={inputStyle} />
              </div>
              <button onClick={saveSettings} disabled={savingSettings}
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-50" style={accentBtn}>
                <Save size={16} /> Αποθήκευση
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Ανεφοδιασμός ─────────────────────────────────────────────────── */}
      <div className="p-5 mb-6 card-surface" style={card}>
        <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <PlusCircle size={18} /> Προσθήκη ανεφοδιασμού
        </h3>
        <form onSubmit={addTopup} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Ποσό (€)</label>
            <input type="number" step="0.01" min="0" required value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="px-3 py-2 rounded-lg w-32 outline-none" style={inputStyle} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Σημείωση (προαιρετικό)</label>
            <input type="text" value={topupNote} onChange={(e) => setTopupNote(e.target.value)} maxLength={200}
              className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
          </div>
          <button type="submit" disabled={addingTopup}
            className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-50" style={accentBtn}>
            <PlusCircle size={16} /> {addingTopup ? 'Καταχώρηση…' : 'Προσθήκη'}
          </button>
        </form>
      </div>

      {/* ── Εκκρεμείς οφειλές σε διανομείς ──────────────────────────────── */}
      <div className="p-5 mb-6 card-surface" style={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <CircleDollarSign size={18} /> Εκκρεμείς οφειλές σε διανομείς
          </h3>
          {pending.length > 0 && (
            <span className="text-sm font-bold" style={{ color: 'var(--warning)' }}>
              Σύνολο {eur(pendingTotal)} €
            </span>
          )}
        </div>
        {pendingLoading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Φόρτωση…</p>}
        {!pendingLoading && pending.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Καμία εκκρεμής οφειλή αυτή τη στιγμή.</p>
        )}
        <div className="space-y-2">
          {pending.map((p) => {
            const Icon = p.kind === 'cash' ? Wallet : Fuel;
            return (
              <div key={`${p.kind}-${p.id}`} className="flex items-center gap-3 py-2.5 px-3 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <Icon size={16} style={{ color: 'var(--text-muted)' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                    <User size={13} style={{ color: 'var(--text-muted)' }} /> {p.driver_name} — {eur(p.amount)} €
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {prettyDateTime(p.created_at)} · {p.kind === 'cash' ? 'POS' : 'Βενζίνη'}
                  </div>
                </div>
                <button onClick={() => settlePending(p)} disabled={settlingId === p.id}
                  className="px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap disabled:opacity-50"
                  style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                  {settlingId === p.id ? 'Καταχώρηση…' : 'Πλήρωσα'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Πρόσφατα διευθετημένες — αναίρεση κατά λάθος tick ───────────── */}
      <div className="p-5 mb-6 card-surface" style={card}>
        <button onClick={() => setShowSettled((s) => !s)}
          className="w-full flex items-center justify-between gap-2 text-left">
          <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Undo2 size={18} /> Πρόσφατα διευθετημένες
          </h3>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {showSettled ? 'Απόκρυψη' : 'Εμφάνιση'}
          </span>
        </button>
        {showSettled && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="space-y-2 mt-4">
              {settledLoading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Φόρτωση…</p>}
              {!settledLoading && settled.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Καμία πρόσφατη πληρωμή.</p>
              )}
              {settled.map((s) => {
                const Icon = s.kind === 'cash' ? Wallet : Fuel;
                return (
                  <div key={`${s.kind}-${s.id}`} className="flex items-center gap-3 py-2.5 px-3 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <Icon size={16} style={{ color: 'var(--text-muted)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                        <User size={13} style={{ color: 'var(--text-muted)' }} /> {s.driver_name} — {eur(s.amount)} €
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Πληρώθηκε {prettyDateTime(s.received_at)} · {s.kind === 'cash' ? 'POS' : 'Βενζίνη'}
                      </div>
                    </div>
                    <button onClick={() => undoSettled(s)} disabled={undoingId === s.id}
                      className="px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap disabled:opacity-50"
                      style={subtleBtn}>
                      {undoingId === s.id ? 'Αναίρεση…' : 'Αναίρεση'}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Πλοήγηση εβδομάδας ──────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="w-10 h-10 rounded-lg flex items-center justify-center transition card-surface" style={card}>
          <ChevronLeft size={20} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="px-5 py-2 rounded-lg text-center min-w-[240px] card-surface" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Δευτέρα – Κυριακή</div>
          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{prettyRange(weekStart, weekEnd)}</div>
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={isCurrentWeek}
          className="w-10 h-10 rounded-lg flex items-center justify-center transition disabled:opacity-30 card-surface" style={card}>
          <ChevronRight size={20} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={fetchHistory} disabled={loading}
          className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={subtleBtn}>
          <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> Ανανέωση
        </button>
      </div>

      {/* ── Ιστορικό ─────────────────────────────────────────────────────── */}
      <div style={card} className="overflow-hidden card-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 620 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {['Είδος', 'Διανομέας', 'Ποσό', 'Ημερομηνία', 'Σημείωση', ''].map((h) => (
                  <th key={h} className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-left" style={{ color: 'var(--text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>Φόρτωση…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                  Καμία κίνηση ταμείου αυτή την εβδομάδα.
                </td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="px-4 py-3">
                    {r.kind === 'topup' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold" style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
                        <PlusCircle size={12} /> Ανεφοδιασμός
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold" style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-muted)' }}>
                        <Wallet size={12} /> Δήλωση
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {r.driver_name ? (
                      <span className="flex items-center gap-1.5"><User size={13} style={{ color: 'var(--text-muted)' }} /> {r.driver_name}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 font-bold" style={{ color: r.kind === 'topup' ? 'var(--success)' : 'var(--text-primary)' }}>
                    {r.kind === 'topup' ? '+' : '−'}{eur(r.amount)} €
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{prettyDateTime(r.created_at)}</td>
                  <td className="px-4 py-3 truncate max-w-[220px]" style={{ color: 'var(--text-secondary)' }} title={r.note || ''}>
                    {r.note || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {r.original_amount != null && (
                      <span title={`Αρχικό ποσό: ${eur(r.original_amount)} € — διορθώθηκε ${prettyDateTime(r.edited_at)}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap"
                        style={{ color: 'var(--warning)', backgroundColor: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}>
                        <AlertTriangle size={11} />
                        <span className="line-through">{eur(r.original_amount)}€</span> → {eur(r.amount)}€
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
