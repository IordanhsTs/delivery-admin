import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import {
  Fuel, ChevronLeft, ChevronRight, Download, Settings2, Route,
  Clock, Euro, AlertTriangle, Save, RefreshCcw, Gauge,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

// ── Εβδομάδα Δευτέρα→Κυριακή ────────────────────────────────────────────────
// Ο πελάτης κάνει την εκκαθάριση κάθε Κυριακή για τη βδομάδα που πέρασε, οπότε
// αυτή είναι η μονάδα της οθόνης — όχι ημερολογιακός μήνας ή ελεύθερο εύρος.
function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // getDay(): 0=Κυριακή
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
// Τοπική ημερομηνία ως YYYY-MM-DD. ΟΧΙ toISOString() — αυτό μετατρέπει σε UTC
// και τα μεσάνυχτα θερινής ώρας θα γύριζαν την προηγούμενη μέρα.
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Ποιος μέτρησε τα χιλιόμετρα της βάρδιας. Το 'odometer' είναι ο τρόπος από
// 10/08/2026· τα άλλα δύο επιβιώνουν σε ιστορικές βάρδιες μετρημένες με GPS.
const SOURCE_LABELS = { odometer: 'κοντέρ', device: 'συσκευή', server: 'διακομιστής' };

const GREEK_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
function prettyRange(from, to) {
  const f = `${from.getDate()} ${GREEK_MONTHS[from.getMonth()]}`;
  const t = `${to.getDate()} ${GREEK_MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  return `${f} – ${t}`;
}

export default function FuelReport() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({ l_per_100km: '', price_per_l: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = ymd(weekStart) === ymd(mondayOf(new Date()));

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('driver_distance_report', {
      p_from: ymd(weekStart),
      p_to: ymd(weekEnd),
    });
    if (error) {
      console.error(error);
      toast.error('Σφάλμα ανάκτησης χιλιομέτρων: ' + error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('fuel_settings').select('*').maybeSingle();
    if (data) {
      setSettings({ l_per_100km: String(data.l_per_100km), price_per_l: String(data.price_per_l) });
    }
  }, []);

  useEffect(() => { fetchReport(); }, [fetchReport]);
  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  async function saveSettings() {
    const l = parseFloat(settings.l_per_100km);
    const p = parseFloat(settings.price_per_l);
    if (!(l > 0) || !(p > 0)) {
      toast.error('Η κατανάλωση και η τιμή πρέπει να είναι θετικοί αριθμοί.');
      return;
    }
    setSavingSettings(true);
    const { error } = await supabase
      .from('fuel_settings')
      .update({ l_per_100km: l, price_per_l: p, updated_at: new Date().toISOString() })
      .eq('id', true);
    setSavingSettings(false);
    if (error) {
      toast.error('Δεν αποθηκεύτηκε: ' + error.message);
    } else {
      toast.success('Οι ρυθμίσεις καυσίμου αποθηκεύτηκαν.');
      fetchReport();
    }
  }

  async function saveDriverConsumption(driverId, value) {
    const v = value === '' ? null : parseFloat(value);
    if (v !== null && !(v > 0)) {
      toast.error('Μη έγκυρη κατανάλωση.');
      return;
    }
    const { error } = await supabase.from('drivers').update({ fuel_l_per_100km: v }).eq('id', driverId);
    if (error) toast.error('Δεν αποθηκεύτηκε: ' + error.message);
    else {
      toast.success(v === null ? 'Επαναφορά στην προεπιλογή.' : 'Η κατανάλωση αποθηκεύτηκε.');
      fetchReport();
    }
  }

  // Μόνο όσοι πράγματι κινήθηκαν — ένας διανομέας με 0 χλμ δεν έχει θέση σε
  // κατάσταση χρέωσης καυσίμων.
  const active = rows.filter((r) => Number(r.distance_km) > 0);
  const totals = active.reduce(
    (a, r) => ({
      km: a.km + Number(r.distance_km),
      hours: a.hours + Number(r.hours),
      liters: a.liters + Number(r.liters),
      cost: a.cost + Number(r.fuel_cost),
    }),
    { km: 0, hours: 0, liters: 0, cost: 0 }
  );

  function exportExcel() {
    if (!active.length) { toast.info('Δεν υπάρχουν δεδομένα για εξαγωγή.'); return; }
    const data = active.map((r) => ({
      'Διανομέας': r.full_name,
      'Χιλιόμετρα': Number(r.distance_km).toFixed(2),
      'Βάρδιες': r.shifts,
      'Ώρες': Number(r.hours).toFixed(2),
      'Κατανάλωση (L/100km)': Number(r.l_per_100km).toFixed(2),
      'Λίτρα': Number(r.liters).toFixed(2),
      'Κόστος (€)': Number(r.fuel_cost).toFixed(2),
    }));
    data.push({
      'Διανομέας': 'ΣΥΝΟΛΟ',
      'Χιλιόμετρα': totals.km.toFixed(2),
      'Βάρδιες': active.reduce((a, r) => a + Number(r.shifts), 0),
      'Ώρες': totals.hours.toFixed(2),
      'Κατανάλωση (L/100km)': '',
      'Λίτρα': totals.liters.toFixed(2),
      'Κόστος (€)': totals.cost.toFixed(2),
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Καύσιμα');
    XLSX.writeFile(wb, `Καυσιμα_${ymd(weekStart)}_εως_${ymd(weekEnd)}.xlsx`);
    toast.success('Το Excel κατέβηκε.');
  }

  const card = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg, 12px)',
    boxShadow: 'var(--shadow-sm)',
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Κεφαλίδα ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            <Fuel size={22} color="#fff" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Χιλιόμετρα &amp; Καύσιμα
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Πραγματικά χιλιόμετρα από το κοντέρ — όχι άθροισμα παραγγελιών
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings((s) => !s)}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
            <Settings2 size={16} /> Ρυθμίσεις
          </button>
          <button onClick={fetchReport} disabled={loading}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> Ανανέωση
          </button>
          <button onClick={exportExcel}
            className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white transition"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            <Download size={16} /> Excel
          </button>
        </div>
      </div>

      {/* ── Ρυθμίσεις καυσίμου ──────────────────────────────────────────── */}
      {showSettings && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="mb-6 overflow-hidden">
          <div className="p-5 card-surface" style={card}>
            <h3 className="font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Gauge size={18} /> Προεπιλογές στόλου
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Ισχύουν για κάθε διανομέα που δεν έχει δική του κατανάλωση στον πίνακα παρακάτω.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Κατανάλωση (λίτρα / 100 χλμ)
                </label>
                <input type="number" step="0.1" min="0" value={settings.l_per_100km}
                  onChange={(e) => setSettings((s) => ({ ...s, l_per_100km: e.target.value }))}
                  className="px-3 py-2 rounded-lg w-40 outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Τιμή καυσίμου (€ / λίτρο)
                </label>
                <input type="number" step="0.001" min="0" value={settings.price_per_l}
                  onChange={(e) => setSettings((s) => ({ ...s, price_per_l: e.target.value }))}
                  className="px-3 py-2 rounded-lg w-40 outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <button onClick={saveSettings} disabled={savingSettings}
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
                <Save size={16} /> Αποθήκευση
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Πλοήγηση εβδομάδας ──────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="w-10 h-10 rounded-lg flex items-center justify-center transition card-surface"
          style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          title="Προηγούμενη εβδομάδα">
          <ChevronLeft size={20} />
        </button>
        <div className="px-5 py-2 rounded-lg text-center min-w-[240px] card-surface" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Δευτέρα – Κυριακή
          </div>
          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
            {prettyRange(weekStart, weekEnd)}
          </div>
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={isCurrentWeek}
          className="w-10 h-10 rounded-lg flex items-center justify-center transition disabled:opacity-30 card-surface"
          style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          title="Επόμενη εβδομάδα">
          <ChevronRight size={20} />
        </button>
        {!isCurrentWeek && (
          <button onClick={() => setWeekStart(mondayOf(new Date()))}
            className="px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
            Τρέχουσα
          </button>
        )}
      </div>

      {/* ── Σύνοψη ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Route, label: 'Συνολικά χιλιόμετρα', value: `${totals.km.toFixed(1)} χλμ` },
          { icon: Clock, label: 'Ώρες σε βάρδια', value: `${totals.hours.toFixed(1)} ώρες` },
          { icon: Fuel, label: 'Λίτρα καυσίμου', value: `${totals.liters.toFixed(1)} L` },
          { icon: Euro, label: 'Κόστος καυσίμου', value: `${totals.cost.toFixed(2)} €`, accent: true },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }} className="p-4 card-surface" style={card}>
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} style={{ color: s.accent ? 'var(--accent)' : 'var(--text-muted)' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                {s.label}
              </span>
            </div>
            <div className="text-2xl font-black"
              style={{ color: s.accent ? 'var(--accent)' : 'var(--text-primary)' }}>
              {s.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Πίνακας ανά διανομέα ────────────────────────────────────────── */}
      <div style={card} className="overflow-hidden card-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 760 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {['Διανομέας', 'Χιλιόμετρα', 'Βάρδιες', 'Ώρες', 'L/100χλμ', 'Λίτρα', 'Κόστος', ''].map((h, i) => (
                  <th key={h + i}
                    className={`px-4 py-3 font-bold text-xs uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}
                    style={{ color: 'var(--text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                  Φόρτωση…
                </td></tr>
              )}

              {!loading && !active.length && (
                <tr><td colSpan={8} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                  Καμία καταγεγραμμένη διαδρομή αυτή την εβδομάδα.
                </td></tr>
              )}

              {!loading && active.map((r) => {
                // Κενά στη ροή στιγμάτων = διαδρομή που δεν καταγράφηκε. Το
                // νούμερο τότε είναι ΜΙΚΡΟΤΕΡΟ του πραγματικού, ποτέ μεγαλύτερο.
                const hasGaps = Number(r.gap_count) > 0;
                return (
                  <tr key={r.driver_id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-2">
                        {r.full_name}
                        {hasGaps && (
                          <span title={`${r.gap_count} διακοπές στο σήμα GPS — τα χιλιόμετρα μπορεί να είναι λιγότερα από τα πραγματικά`}>
                            <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {Number(r.ping_count).toLocaleString('el-GR')} στίγματα
                        {r.sources ? ` · ${SOURCE_LABELS[r.sources] || r.sources}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--text-primary)' }}>
                      {Number(r.distance_km).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>{r.shifts}</td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                      {Number(r.hours).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number" step="0.1" min="0"
                        defaultValue={Number(r.l_per_100km)}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (parseFloat(v) !== Number(r.l_per_100km)) saveDriverConsumption(r.driver_id, v);
                        }}
                        className="w-20 px-2 py-1 rounded text-right outline-none"
                        style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                        title="Κατανάλωση της συγκεκριμένης μηχανής. Άδειο = προεπιλογή στόλου."
                      />
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                      {Number(r.liters).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-black" style={{ color: 'var(--accent)' }}>
                      {Number(r.fuel_cost).toFixed(2)} €
                    </td>
                    <td className="px-2" />
                  </tr>
                );
              })}

              {!loading && active.length > 0 && (
                <tr style={{ borderTop: '2px solid var(--border-default)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <td className="px-4 py-3 font-black" style={{ color: 'var(--text-primary)' }}>ΣΥΝΟΛΟ</td>
                  <td className="px-4 py-3 text-right font-black" style={{ color: 'var(--text-primary)' }}>
                    {totals.km.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--text-secondary)' }}>
                    {active.reduce((a, r) => a + Number(r.shifts), 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--text-secondary)' }}>
                    {totals.hours.toFixed(1)}
                  </td>
                  <td />
                  <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--text-secondary)' }}>
                    {totals.liters.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-black" style={{ color: 'var(--accent)' }}>
                    {totals.cost.toFixed(2)} €
                  </td>
                  <td className="px-2" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Τι ακριβώς μετράει αυτό το νούμερο ──────────────────────────── */}
      {/* Δεν είναι διακοσμητική υποσημείωση: εξηγεί τι ακριβώς χρεώνεται στον
          διανομέα, οπότε πρέπει να διαβάζεται — text-secondary, όχι muted. */}
      <div className="mt-4 p-4 text-xs leading-relaxed card-surface" style={{ ...card, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Πώς υπολογίζεται (από 10/08/2026):</strong> από το
        <strong> κοντέρ της μηχανής</strong>. Ο διανομέας δηλώνει την ένδειξη όταν παίρνει το μηχανάκι και
        όταν κλείνει τη βάρδια· η διαφορά είναι τα χιλιόμετρα που χρεώνονται. Αν κάποιος ξεχάσει να δηλώσει
        λήξη, τη βάρδιά του την κλείνει η επόμενη μέτρηση της ίδιας μηχανής — τα χιλιόμετρα δεν χάνονται.
        Ανεξήγητες διαφορές εμφανίζονται ως «χιλιόμετρα εκτός βάρδιας» στην καρτέλα
        <strong> Στόλος μηχανών</strong>.
        <br /><br />
        <span style={{ color: 'var(--text-muted)' }}>
          Βάρδιες πριν από τις 10/08/2026 μετρήθηκαν με GPS (μετατόπιση από τα στίγματα, με απόρριψη
          θορύβου κάτω από 20 μέτρα) και παραμένουν όπως καταγράφηκαν τότε.
        </span>
      </div>
    </div>
  );
}
