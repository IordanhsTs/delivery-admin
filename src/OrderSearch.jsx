import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Search, MapPin, User, Building, Calendar, Inbox, RefreshCcw, Route } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { formatKm, formatEuro, orderDurations } from './distance';

// ── Αναζήτηση παραγγελιών ────────────────────────────────────────────────────
// Ξεχωριστή καρτέλα από τα «Στατιστικά» επίτηδες (αίτημα πελάτη):
//   • Τα Στατιστικά κοιτούν ΜΟΝΟ ολοκληρωμένες παραγγελίες, για μετρήσεις απόδοσης.
//   • Εδώ ψάχνουμε ΟΠΟΙΑΔΗΠΟΤΕ παραγγελία (και ακυρωμένη, και εκκρεμή) με λέξεις
//     κλειδιά ή χρόνο, με δικό της εύρος ημερομηνιών.

const STATUS_LABELS = {
  scheduled: 'Προγραμματισμένη',
  pending:   'Εκκρεμής',
  accepted:  'Σε διανομή',
  completed: 'Ολοκληρωμένη',
  cancelled: 'Ακυρωμένη',
};

const STATUS_STYLE = {
  scheduled: { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-default)' },
  pending:   { color: 'var(--accent)',  backgroundColor: 'var(--accent-muted)', borderColor: 'var(--accent)' },
  accepted:  { color: 'var(--success)', backgroundColor: 'var(--success-bg)',   borderColor: 'var(--success-border)' },
  completed: { color: 'var(--info)',    backgroundColor: 'var(--info-bg)',      borderColor: 'var(--info-border)' },
  cancelled: { color: 'var(--danger)',  backgroundColor: 'var(--danger-bg)',    borderColor: 'var(--danger-border)' },
};

// Σύγκριση χωρίς τόνους/κεφαλαία (και ς→σ): «ΠΑΥΛΟΥ ΜΕΛΑ» βρίσκει «Παύλου Μελά».
const norm = (s) =>
  (s || '').toLowerCase().replace(/ς/g, 'σ').normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function OrderSearch() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [driversList, setDriversList] = useState([]);

  const formatDateTimeLocal = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  // Προεπιλογή: σήμερα από τα μεσάνυχτα μέχρι τώρα.
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [startDate, setStartDate] = useState(formatDateTimeLocal(startOfToday));
  const [endDate, setEndDate] = useState(formatDateTimeLocal(now));

  useEffect(() => {
    const fetchDrivers = async () => {
      const { data } = await supabase.from('drivers').select('id, full_name').order('full_name');
      if (data) setDriversList(data);
    };
    fetchDrivers();
  }, []);

  const runSearch = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);

    let query = supabase
      .from('orders')
      .select('id, created_at, accepted_at, completed_at, status, address, distance_km, surcharge, comments, stores ( name ), drivers ( full_name )')
      .gte('created_at', new Date(startDate).toISOString())
      .lte('created_at', new Date(endDate).toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (selectedDriver) query = query.eq('driver_id', selectedDriver);

    const { data, error } = await query;
    setLoading(false);
    setSearched(true);

    if (error) {
      console.error(error);
      toast.error('Σφάλμα κατά την αναζήτηση.');
      return;
    }

    // Το φιλτράρισμα λέξης-κλειδιού γίνεται εδώ και όχι στη βάση: ψάχνουμε ΚΑΙ στο
    // όνομα καταστήματος, που ζει σε συνδεδεμένο πίνακα — ένα ilike πάνω σε embedded
    // resource θα μετέτρεπε το join σε inner join και θα έκρυβε παραγγελίες χωρίς
    // κατάστημα. Το εύρος ημερομηνιών κρατά ήδη το σύνολο μικρό.
    const k = norm(keyword.trim());
    const filtered = k
      ? (data || []).filter(o =>
          norm(o.address).includes(k) ||
          norm(o.stores?.name).includes(k) ||
          norm(o.comments).includes(k)
        )
      : (data || []);

    setOrders(filtered);
    if (filtered.length === 0) toast.info('Δεν βρέθηκαν παραγγελίες με αυτά τα κριτήρια.');
    else toast.success(`Βρέθηκαν ${filtered.length} παραγγελίες.`);
  };

  const inputClass = 'w-full p-2.5 rounded-xl outline-none transition-colors text-sm';
  const inputStyle = {
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-primary)',
  };

  const formatStamp = (iso) =>
    iso ? new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-sans" style={{ color: 'var(--text-primary)' }}>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Search className="text-[#C5A066]" size={24} />
          <h2 className="m-0 text-xl font-bold tracking-wide" style={{ color: 'var(--accent)' }}>
            Αναζήτηση Παραγγελιών
          </h2>
        </div>
        <p className="m-0 text-sm" style={{ color: 'var(--text-muted)' }}>
          Με λέξη-κλειδί (διεύθυνση, κατάστημα, σχόλια), διανομέα ή χρονικό διάστημα.
        </p>
      </div>

      {/* Φίλτρα */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8 p-4 md:p-5 rounded-2xl items-end"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-md)' }}
      >
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <label className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Λέξη κλειδί</label>
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
            placeholder="π.χ. Τυρνόβου, PANDA..."
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Από</label>
          <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} style={inputStyle} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Έως</label>
          <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} style={inputStyle} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Διανομέας</label>
          <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
            <option value="">Όλοι οι διανομείς</option>
            {driversList.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </div>

        <div className="lg:col-span-5 flex justify-end">
          <button
            onClick={runSearch}
            disabled={loading}
            className="px-8 py-2.5 rounded-xl cursor-pointer font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}
          >
            {loading ? 'Αναζήτηση...' : <><RefreshCcw size={16} /> Αναζήτηση</>}
          </button>
        </div>
      </div>

      {/* Αποτελέσματα */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 skeleton rounded-xl" />)}
        </div>
      ) : orders.length > 0 ? (
        <div className="space-y-2">
          {orders.map((order, idx) => {
            const { activeMins, acceptedMins, totalMins } = orderDurations(order);
            const st = STATUS_STYLE[order.status] || STATUS_STYLE.pending;
            return (
              <div
                key={order.id}
                className="p-3 rounded-xl flex flex-col md:flex-row md:items-center gap-2 md:gap-4"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
              >
                <span
                  className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-black tabular-nums"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                >
                  {idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm">
                    <Building size={13} style={{ color: 'var(--text-muted)' }} />
                    <b style={{ color: 'var(--text-primary)' }}>{order.stores?.name || '—'}</b>
                    <span style={{ color: 'var(--text-muted)' }}>➔</span>
                    <MapPin size={13} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{order.address || '—'}</span>
                    {order.distance_km !== null && order.distance_km !== undefined && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                        style={Number(order.surcharge) > 0
                          ? { color: 'var(--warning)', backgroundColor: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }
                          : { color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                      >
                        <Route size={10} />
                        {formatKm(order.distance_km)}
                        {Number(order.surcharge) > 0 ? ` · +${formatEuro(order.surcharge)}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    <span className="inline-flex items-center gap-1"><Calendar size={11} /> {formatStamp(order.created_at)}</span>
                    {order.drivers?.full_name && (
                      <span className="inline-flex items-center gap-1"><User size={11} /> {order.drivers.full_name}</span>
                    )}
                    <span className="tabular-nums" title="Ενεργή (αναμονή) + Αποδεκτή (διανομή)">
                      {activeMins}′ ενεργή + {acceptedMins}′ αποδεκτή = {totalMins}′
                    </span>
                  </div>
                </div>

                <span
                  className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full border self-start md:self-center"
                  style={st}
                >
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>
            );
          })}
        </div>
      ) : searched ? (
        <div
          className="p-8 rounded-2xl text-center flex flex-col items-center justify-center"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
        >
          <Inbox size={48} style={{ color: 'var(--text-muted)' }} className="mb-4" />
          <p className="font-medium m-0" style={{ color: 'var(--accent)' }}>Δεν βρέθηκαν παραγγελίες.</p>
          <p className="text-sm m-0 mt-1" style={{ color: 'var(--text-muted)' }}>
            Δοκιμάστε άλλη λέξη-κλειδί ή διευρύνετε το χρονικό διάστημα.
          </p>
        </div>
      ) : null}
    </motion.div>
  );
}
