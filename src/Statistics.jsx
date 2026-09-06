import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { BarChart2, Clock, Package, Trophy, TrendingUp, RefreshCcw, ChevronUp, FileText, MapPin, User, Calendar, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { formatKm, orderDurations } from './distance';
import { fetchAllRows, PAGE_SIZE, HARD_CAP } from './fetchAll';

// Πόσες γραμμές του αναλυτικού ιστορικού δείχνουμε με το πάτημα, και πόσες
// προσθέτει κάθε «φόρτωση περισσότερων».
const HISTORY_PAGE = 200;
import { STORE_CATEGORIES } from './storeCategories';

export default function Statistics() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // Νέο state για το ιστορικό
  // Πόσες γραμμές έχουν κατέβει μέχρι στιγμής — σε μεγάλα διαστήματα η ανάκτηση
  // κρατάει δευτερόλεπτα και ο διαχειριστής πρέπει να βλέπει ότι κάτι γίνεται.
  const [loadedCount, setLoadedCount] = useState(0);
  // Πόσες γραμμές ΖΩΓΡΑΦΙΖΟΥΜΕ στο αναλυτικό ιστορικό. Τα KPI χρειάζονται όλες
  // τις παραγγελίες, ο πίνακας όχι: 10.000 γραμμές × (πίνακας + λίστα κινητού,
  // και τα δύο στο DOM) κολλάνε τον browser για αρκετά δευτερόλεπτα.
  const [visibleRows, setVisibleRows] = useState(HISTORY_PAGE);
  
  // Λίστες για τα Dropdowns των Φίλτρων
  const [storesList, setStoresList] = useState([]);
  const [driversList, setDriversList] = useState([]);

  // ── Ώρες λειτουργίας, για τον ρυθμό «παραγγελίες ανά ώρα» ─────────────────
  // Αίτημα πελάτη 06/09/2026. Ο διαιρέτης ΔΕΝ είναι καρφωμένο 18: διαβάζεται από
  // τις ίδιες ρυθμίσεις που ορίζουν το ωράριο στο πρόγραμμα εβδομάδας
  // (schedule_settings, migration 0015) — open_hour 7 → close_hour 25 = 18 ώρες.
  // Αν αύριο η εταιρία ανοίξει νωρίτερα, ο ρυθμός διορθώνεται μόνος του αντί να
  // ψευτίζει σιωπηλά.
  const [activeHours, setActiveHours] = useState(18);

  // Επιλεγμένα Φίλτρα
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  // Είδος καταστήματος (client feedback 08/08): «διάλεξε διανομέα + κατηγορία,
  // δες πόσες παραγγελίες έκανε, από ποια καταστήματα» — ίδιο μηχανισμό με τα
  // υπάρχοντα φίλτρα store/driver, τρίτο κριτήριο πάνω στο ήδη κοινό ερώτημα.
  const [selectedCategory, setSelectedCategory] = useState('');

  // Βοηθητική συνάρτηση για το format YYYY-MM-DDTHH:mm
  const formatDateTimeLocal = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  // ΠΡΟΕΠΙΛΟΓΗ = ΣΗΜΕΡΑ (αίτημα πελάτη): από τα μεσάνυχτα μέχρι το λεπτό που
  // ανοίγει η καρτέλα — όχι η τελευταία εβδομάδα που ίσχυε πριν.
  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);

  const [startDate, setStartDate] = useState(formatDateTimeLocal(startOfToday));
  const [endDate, setEndDate] = useState(formatDateTimeLocal(today));
  // Το διάστημα ΤΩΝ ΔΕΔΟΜΕΝΩΝ ΠΟΥ ΔΕΙΧΝΟΝΤΑΙ — όχι ό,τι γράφει αυτή τη στιγμή
  // στα πεδία. Χωρίς αυτό, μόλις ο διαχειριστής άλλαζε ημερομηνία (πριν πατήσει
  // «Ανανέωση») ο ρυθμός ανά ώρα θα διαιρούσε παλιές παραγγελίες με νέες ημέρες.
  const [appliedRange, setAppliedRange] = useState({
    start: formatDateTimeLocal(startOfToday),
    end: formatDateTimeLocal(today),
  });

  useEffect(() => {
    const fetchFilters = async () => {
      const [storesRes, driversRes, hoursRes] = await Promise.all([
        supabase.from('stores').select('id, name').order('name'),
        supabase.from('drivers').select('id, full_name').order('full_name'),
        supabase.from('schedule_settings').select('open_hour, close_hour').maybeSingle(),
      ]);

      if (storesRes.data) setStoresList(storesRes.data);
      if (driversRes.data) setDriversList(driversRes.data);

      // Το close_hour ζει σε 24ωρα «από τα μεσάνυχτα της ίδιας ημέρας»: το 25
      // σημαίνει 01:00 της επόμενης. Άρα η αφαίρεση δίνει σωστά 18 και δεν
      // χρειάζεται ειδικός χειρισμός για το νυχτερινό ωράριο.
      const span = Number(hoursRes.data?.close_hour) - Number(hoursRes.data?.open_hour);
      if (Number.isFinite(span) && span > 0 && span <= 24) setActiveHours(span);
    };
    
    fetchFilters();
    fetchStats(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setLoadedCount(0);
    setVisibleRows(HISTORY_PAGE);
    setShowHistory(false); // Κρύβουμε το ιστορικό σε κάθε νέα αναζήτηση

    const startIso = new Date(startDate).toISOString();
    const endIso = new Date(endDate).toISOString();
    setAppliedRange({ start: startDate, end: endDate });

    // Προσθέσαμε το "address" στο select για να φαίνεται στο ιστορικό.
    // stores!inner (αντί για stores ( )): client feedback 08/08 — τρίτο φίλτρο
    // «είδος καταστήματος». Το PostgREST φιλτράρει σε embedded στήλη (stores.category)
    // μόνο με inner join· ακίνδυνο αφού κάθε παραγγελία έχει πάντα κατάστημα.
    //
    // ΣΥΝΑΡΤΗΣΗ και όχι έτοιμο query: το fetchAllRows το ξαναχτίζει για κάθε
    // σελίδα των 1000. Το δεύτερο `.order('id')` ΔΕΝ είναι διακοσμητικό — είναι
    // ο σταθερός διαχωριστής που κρατάει τη σειρά ίδια ανάμεσα στις σελίδες
    // (δύο παραγγελίες μπορούν να έχουν το ίδιο completed_at).
    const buildQuery = () => {
      let q = supabase
        .from('orders')
        .select('id, created_at, accepted_at, completed_at, status, address, distance_km, surcharge, store_id, driver_id, stores!inner ( name, category ), drivers ( full_name )')
        .eq('status', 'completed')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('completed_at', { ascending: false }) // Τα πιο πρόσφατα πρώτα
        .order('id', { ascending: false });

      if (selectedStore) q = q.eq('store_id', selectedStore);
      if (selectedDriver) q = q.eq('driver_id', selectedDriver);
      if (selectedCategory) q = q.eq('stores.category', selectedCategory);
      return q;
    };

    const { data, error, truncated } = await fetchAllRows(buildQuery, {
      onProgress: setLoadedCount,
    });

    if (data) {
      setOrders(data);
      if (truncated) {
        // Δεν σιωπούμε ποτέ σε κόψιμο — αυτό ακριβώς ήταν το παλιό πρόβλημα.
        toast.warning(
          `Το διάστημα είναι τεράστιο: δείχνουμε τις ${HARD_CAP.toLocaleString('el-GR')} πιο πρόσφατες παραγγελίες. Στενέψτε τις ημερομηνίες για ακριβή νούμερα.`,
          { duration: 8000 }
        );
      } else if (data.length > 0) {
        toast.success(`Ανακτήθηκαν ${data.length.toLocaleString('el-GR')} παραγγελίες!`);
      } else {
        toast.info("Δεν βρέθηκαν αποτελέσματα με αυτά τα φίλτρα.");
      }
    }
    if (error) {
      console.error("Σφάλμα:", error);
      toast.error("Σφάλμα κατά την ανάκτηση των στατιστικών.");
    }
    setLoading(false);
  };

  const calculateKPIs = () => {
    let totalMins = 0;
    let validOrdersForTime = 0;
    const storeCounts = {};
    const driverTimes = {};

    orders.forEach(order => {
      const storeName = order.stores?.name || 'Άγνωστο';
      storeCounts[storeName] = (storeCounts[storeName] || 0) + 1;

      if (order.created_at && order.completed_at) {
        const tCreate = new Date(order.created_at);
        const tComplete = new Date(order.completed_at);
        // ΧΩΡΙΣ Math.floor ΑΝΑ ΠΑΡΑΓΓΕΛΙΑ (διόρθωση 06/09/2026): το κόψιμο των
        // δευτερολέπτων σε κάθε γραμμή έριχνε τον μέσο όρο έως και 30
        // δευτερόλεπτα — σε 500 παραγγελίες αυτό είναι μισό λεπτό λάθος που ο
        // πελάτης το έβλεπε ως «ο μέσος χρόνος δεν είναι σωστός». Η
        // στρογγυλοποίηση γίνεται ΜΙΑ φορά, στο τέλος, στο ένα δεκαδικό.
        const mins = (tComplete - tCreate) / 60000;

        totalMins += mins;
        validOrdersForTime += 1;

        const driverName = order.drivers?.full_name || 'Άγνωστος';
        if (!driverTimes[driverName]) driverTimes[driverName] = { totalMins: 0, count: 0 };
        driverTimes[driverName].totalMins += mins;
        driverTimes[driverName].count += 1;
      }
    });

    const avgTime = validOrdersForTime > 0 ? (totalMins / validOrdersForTime).toFixed(1) : 0;
    const sortedStores = Object.entries(storeCounts).sort((a, b) => b[1] - a[1]);
    const sortedDrivers = Object.entries(driverTimes).map(([name, data]) => ({
      name, avg: (data.totalMins / data.count).toFixed(1), deliveries: data.count
    })).sort((a, b) => a.avg - b.avg);

    return { avgTime, totalOrders: orders.length, sortedStores, sortedDrivers };
  };

  const kpis = calculateKPIs();

  // ── Ρυθμός: παραγγελίες ανά ώρα λειτουργίας (αίτημα πελάτη 06/09/2026) ────
  // Ο τύπος όπως τον όρισε: παραγγελίες ÷ ημέρες διαστήματος ÷ ώρες λειτουργίας.
  //
  // Οι ημέρες μετριούνται στο ΕΠΙΛΕΓΜΕΝΟ ΔΙΑΣΤΗΜΑ («10 μέρες πίσω» = 10) και όχι
  // «όσες ημέρες είχαν παραγγελίες» — αλλιώς μια κλειστή αργία θα ανέβαζε
  // τεχνητά τον ρυθμό αντί να τον ρίξει.
  //
  // Στρογγυλοποίηση ΠΡΟΣ ΤΑ ΠΑΝΩ με ελάχιστο το 1: το προεπιλεγμένο διάστημα
  // είναι «σήμερα από τα μεσάνυχτα ως τώρα», δηλαδή κλάσμα ημέρας — χωρίς το
  // ceil θα διαιρούσαμε με 0,4 και ο ρυθμός θα διπλασιαζόταν.
  const rangeDays = (() => {
    const ms = new Date(appliedRange.end) - new Date(appliedRange.start);
    if (!Number.isFinite(ms) || ms <= 0) return 1;
    return Math.max(1, Math.ceil(ms / 86400000));
  })();
  const ordersPerHour = kpis.totalOrders / rangeDays / activeHours;

  // Τα KPI υπολογίζονται πάντα σε ΟΛΕΣ τις παραγγελίες· μόνο ο πίνακας κόβεται.
  const historyRows = orders.slice(0, visibleRows);
  const hasMoreRows = orders.length > visibleRows;

  // Δεδομένα για γράφημα (Top 5 καταστήματα)
  const chartData = kpis.sortedStores.slice(0, 5).map(([name, count]) => ({
    name,
    count
  }));

  // Βοηθητικές συναρτήσεις για την εμφάνιση ημερομηνιών στον πίνακα
  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  };
  
  const formatDate = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="font-sans text-adaptive-light"
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 className="text-[#C5A066]" size={24} />
          <h2 className="m-0 text-[#C5A066] text-xl font-bold drop-shadow-[0_0_8px_rgba(197,160,102,0.5)] tracking-wide">Στατιστικά & Απόδοση</h2>
        </div>
        <p className="m-0 text-adaptive text-sm">Ανάλυση χρόνων παράδοσης με δυνατότητα εξειδικευμένου φιλτραρίσματος.</p>
      </div>

      {/* Πίνακας Ελέγχου (Φίλτρα) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8 card-glass backdrop-blur-md p-4 md:p-5 rounded-2xl border border-[#C5A066]/40 items-end shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        
        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Από</label>
          <input 
            type="datetime-local" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm"
          />
        </div>
        
        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Έως</label>
          <input 
            type="datetime-local" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Κατάστημα</label>
          <select 
            value={selectedStore} 
            onChange={e => setSelectedStore(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm cursor-pointer"
          >
            <option value="">Όλα τα καταστήματα</option>
            {storesList.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Διανομέας</label>
          <select 
            value={selectedDriver} 
            onChange={e => setSelectedDriver(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm cursor-pointer"
          >
            <option value="">Όλοι οι διανομείς</option>
            {driversList.map(driver => (
              <option key={driver.id} value={driver.id}>{driver.full_name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Είδος</label>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm cursor-pointer"
          >
            <option value="">Όλα τα είδη</option>
            {STORE_CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-1 flex justify-center lg:justify-end">
          <button
            onClick={fetchStats}
            disabled={loading} 
            className="w-full sm:w-auto px-8 lg:px-6 py-2.5 btn-glass text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] rounded-xl cursor-pointer font-bold transition-all disabled:opacity-50 h-[42px] flex items-center justify-center gap-2"
          >
            {loading ? 'Φόρτωση...' : <><RefreshCcw size={16} /> Ανανέωση</>}
          </button>
        </div>

      </div>

      {loading ? (
        <div className="space-y-6">
          {/* Σε μεγάλα διαστήματα η ανάκτηση γίνεται σε σελίδες των 1000 και
              κρατάει δευτερόλεπτα· χωρίς μετρητή μοιάζει με κόλλημα. */}
          {loadedCount > PAGE_SIZE && (
            <div className="text-center text-sm text-[#C5A066] font-bold">
              Ανάκτηση… {loadedCount.toLocaleString('el-GR')} παραγγελίες
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-32 skeleton"></div>
            <div className="h-32 skeleton"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="h-[300px] skeleton"></div>
            <div className="h-[300px] skeleton"></div>
          </div>
        </div>
      ) : orders.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="animate-fade-in">
          {/* Κάρτες KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
            <div className="p-6 card-glass backdrop-blur-md border border-[#38EF7D]/40 rounded-2xl text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col items-center hover:-translate-y-1 transition-transform">
              <div className="flex items-center justify-center gap-2 mb-2 text-[#38EF7D] drop-shadow-[0_0_5px_rgba(56,239,125,0.5)] relative z-10">
                <Clock size={20} />
                <h3 className="m-0 text-base font-bold">Μέσος Χρόνος Παράδοσης</h3>
              </div>
              <p className="m-0 text-4xl font-black text-adaptive-light relative z-10">{kpis.avgTime} <span className="text-xl font-bold text-adaptive-light">λεπτά</span></p>
              <small className="text-adaptive block mt-2 font-medium relative z-10">Από τη δημιουργία έως την πόρτα</small>
            </div>
            <div className="p-6 card-glass backdrop-blur-md border border-[#9D4EDD]/40 rounded-2xl text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col items-center hover:-translate-y-1 transition-transform">
              <div className="flex items-center justify-center gap-2 mb-2 text-[#9D4EDD] drop-shadow-[0_0_5px_rgba(157,78,221,0.5)] relative z-10">
                <Package size={20} />
                <h3 className="m-0 text-base font-bold">Συνολικές Παραδόσεις</h3>
              </div>
              <p className="m-0 text-4xl font-black text-adaptive-light relative z-10">{kpis.totalOrders}</p>
              <small className="text-adaptive block mt-2 font-medium relative z-10">Ολοκληρωμένες στο διάστημα</small>
            </div>
            <div className="p-6 card-glass backdrop-blur-md border border-[#C5A066]/40 rounded-2xl text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col items-center hover:-translate-y-1 transition-transform">
              <div className="flex items-center justify-center gap-2 mb-2 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.5)] relative z-10">
                <TrendingUp size={20} />
                <h3 className="m-0 text-base font-bold">Παραγγελίες ανά Ώρα</h3>
              </div>
              <p className="m-0 text-4xl font-black text-adaptive-light relative z-10">{ordersPerHour.toFixed(2)}</p>
              <small
                className="text-adaptive block mt-2 font-medium relative z-10"
                title={`${kpis.totalOrders} παραγγελίες ÷ ${rangeDays} ${rangeDays === 1 ? 'ημέρα' : 'ημέρες'} ÷ ${activeHours} ώρες λειτουργίας`}
              >
                {kpis.totalOrders} ÷ {rangeDays} {rangeDays === 1 ? 'ημέρα' : 'ημέρες'} ÷ {activeHours} ώρες
              </small>
            </div>
          </div>

          {/* Γράφημα */}
          <div className="mb-8 card-glass backdrop-blur-md p-6 rounded-2xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
            <h4 className="text-center font-bold mb-4 text-[#C5A066]">Όγκος Παραγγελιών ανά Κατάστημα (Top 5)</h4>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#A89C8E" tick={{fontSize: 12}} />
                  <YAxis stroke="#A89C8E" />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#1A1A1A', borderColor: '#C5A066', borderRadius: '8px' }}
                    itemStyle={{ color: '#C5A066' }}
                  />
                  <Bar dataKey="count" fill="#C5A066" radius={[4, 4, 0, 0]} name="Παραγγελίες" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Λίστες Ανάλυσης */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            
            {/* Top Καταστήματα */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">
                <Trophy size={20} />
                <h4 className="m-0 font-bold text-lg">{selectedStore ? 'Επιλεγμένο Κατάστημα' : 'Top Καταστήματα (Όγκος)'}</h4>
              </div>
              <div className="card-glass backdrop-blur-md rounded-xl border border-[#C5A066]/40 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                {kpis.sortedStores.length > 0 ? kpis.sortedStores.map(([store, count], index) => (
                  <div 
                    key={store} 
                    className={`flex justify-between items-center p-3 md:px-4 md:py-3 ${index !== kpis.sortedStores.length - 1 ? 'border-b border-[#C5A066]/10' : ''} ${index === 0 && !selectedStore ? 'bg-[#C5A066]/10 rounded-lg' : 'hover-row-glass transition-colors'}`}
                  >
                    <span className={`text-adaptive-light ${index === 0 && !selectedStore ? 'font-bold text-[#C5A066]' : ''}`}>
                      {selectedStore ? store : `${index + 1}. ${store}`}
                    </span>
                    <span className="font-bold text-[#C5A066] bg-[#C5A066]/10 border border-[#C5A066]/30 px-2.5 py-1 rounded-full text-xs whitespace-nowrap">
                      {count} παρ.
                    </span>
                  </div>
                )) : (
                  <div className="p-4 text-center text-adaptive text-sm italic">Δεν υπάρχουν δεδομένα</div>
                )}
              </div>
            </div>

            {/* Επίδοση Διανομέων */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">
                <TrendingUp size={20} />
                <h4 className="m-0 font-bold text-lg">{selectedDriver ? 'Επίδοση Επιλεγμένου Διανομέα' : 'Επίδοση Διανομέων (Χρόνοι)'}</h4>
              </div>
              <div className="card-glass backdrop-blur-md rounded-xl border border-[#C5A066]/40 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                {kpis.sortedDrivers.length > 0 ? kpis.sortedDrivers.map((driver, index) => (
                  <div 
                    key={driver.name} 
                    className={`flex justify-between items-center p-3 md:px-4 md:py-3 ${index !== kpis.sortedDrivers.length - 1 ? 'border-b border-[#C5A066]/10' : ''} hover-row-glass transition-colors`}
                  >
                    <span className="text-adaptive-light">
                      {selectedDriver ? <b>{driver.name}</b> : <>{index + 1}. <b>{driver.name}</b></>} 
                      <span className="text-adaptive text-xs ml-1">({driver.deliveries} παρ.)</span>
                    </span>
                    <span className={`font-bold border px-2.5 py-1 rounded-full text-xs whitespace-nowrap ${driver.avg < 15 ? 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10' : (driver.avg > 25 ? 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10' : 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10')}`}>
                      {driver.avg} λ.
                    </span>
                  </div>
                )) : (
                  <div className="p-4 text-center text-adaptive text-sm italic">Δεν υπάρχουν δεδομένα</div>
                )}
              </div>
            </div>
            
          </div>

          {/* Κουμπί Εμφάνισης/Απόκρυψης Ιστορικού */}
          <div className="border-t border-[#C5A066]/30 pt-8 pb-4 text-center">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="btn-glass border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] text-[#C5A066] font-bold py-3 px-6 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 mx-auto"
            >
              {showHistory ? <><ChevronUp size={20} /> Απόκρυψη Ιστορικού</> : <><FileText size={20} /> Προβολή Αναλυτικού Ιστορικού</>}
            </button>
          </div>

          {/* Αναλυτικό Ιστορικό Παραγγελιών */}
          {showHistory && (
            <div className="animate-fade-in card-glass backdrop-blur-md rounded-2xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden mt-2">
              <div className="table-header-glass border-b border-[#C5A066]/40 p-4">
                <h4 className="m-0 text-[#C5A066] font-bold drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">
                  Αναλυτικές Παραγγελίες ({orders.length.toLocaleString('el-GR')})
                </h4>
                {hasMoreRows && (
                  <p className="m-0 mt-1 text-adaptive text-xs">
                    Εμφανίζονται οι {historyRows.length.toLocaleString('el-GR')} πιο πρόσφατες — τα στατιστικά από πάνω μετρούν και τις {orders.length.toLocaleString('el-GR')}.
                  </p>
                )}
              </div>
              
              {/* Desktop Table (Hidden on mobile) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="table-header-glass text-adaptive text-xs uppercase tracking-wider border-b border-[#C5A066]/40">
                      <th className="p-4 font-bold">Ημερ/νια</th>
                      <th className="p-4 font-bold">Κατάστημα & Διεύθυνση</th>
                      <th className="p-4 font-bold">Διανομέας</th>
                      <th className="p-4 font-bold text-center">Χρόνος (Λεπτά)</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-[#C5A066]/10">
                    {historyRows.map(order => {
                      // Ο πελάτης θέλει και τα δύο σκέλη ώστε να φαίνεται πού πήγε ο
                      // χρόνος: αναμονή για διανομέα vs. αυτή καθαυτή η διανομή.
                      const { activeMins, acceptedMins, totalMins } = orderDurations(order);
                      const mins = order.completed_at ? totalMins : '-';

                      return (
                        <tr key={order.id} className="hover-row-glass transition-colors">
                          <td className="p-4 text-adaptive">
                            <div className="font-bold">{formatDate(order.created_at)}</div>
                            <div className="text-xs">{formatTime(order.created_at)}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-adaptive-light">{order.stores?.name}</div>
                            <div className="text-adaptive text-xs mt-0.5 flex items-center gap-1 flex-wrap">
                              <MapPin size={12} /> <span className="text-adaptive">{order.address || 'Μη διαθέσιμη διεύθυνση'}</span>
                              {order.distance_km !== null && order.distance_km !== undefined && (
                                <span className="text-adaptive opacity-80">· {formatKm(order.distance_km)}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-adaptive-light font-medium">
                            {order.drivers?.full_name}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-block border px-2.5 py-1 rounded-full text-xs font-bold ${mins < 15 ? 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10' : (mins > 25 ? 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10' : 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10')}`}>
                              {mins} λ.
                            </span>
                            <div className="text-adaptive text-[10px] mt-1 tabular-nums" title="Ενεργή (αναμονή για διανομέα) + Αποδεκτή (διανομή)">
                              {activeMins}′ ενεργή + {acceptedMins}′ αποδεκτή
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile List (Hidden on desktop) */}
              <div className="md:hidden flex flex-col divide-y divide-[#C5A066]/10">
                {historyRows.map(order => {
                  const { activeMins, acceptedMins, totalMins } = orderDurations(order);
                  const mins = order.completed_at ? totalMins : '-';

                  return (
                    <div key={order.id} className="p-4 hover-row-glass">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-adaptive-light text-[15px]">{order.stores?.name}</div>
                        <div className="text-right">
                          <span className={`border px-2 py-0.5 rounded text-[11px] font-bold ${mins < 15 ? 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10' : (mins > 25 ? 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10' : 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10')}`}>
                            {mins} λεπτά
                          </span>
                          <div className="text-adaptive text-[10px] mt-1 tabular-nums">{activeMins}′ + {acceptedMins}′</div>
                        </div>
                      </div>
                      <div className="text-adaptive text-sm mb-2 flex items-center gap-1 flex-wrap">
                        <MapPin size={14} /> {order.address || 'Μη διαθέσιμη διεύθυνση'}
                        {order.distance_km !== null && order.distance_km !== undefined && (
                          <span className="opacity-80">· {formatKm(order.distance_km)}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-xs text-adaptive pt-2 border-t border-[#C5A066]/10">
                        <span className="flex items-center gap-1"><User size={12} /> {order.drivers?.full_name}</span>
                        <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(order.created_at)} {formatTime(order.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Φόρτωση περισσότερων: ο πίνακας μεγαλώνει με το πάτημα, ώστε ένας
                  μήνας (~10.000 παραγγελίες) να μην παγώνει την καρτέλα. */}
              {hasMoreRows && (
                <div className="p-4 border-t border-[#C5A066]/20 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => setVisibleRows(v => v + HISTORY_PAGE * 5)}
                    className="btn-glass border border-[#C5A066]/50 hover:border-[#C5A066] text-[#C5A066] font-bold py-2.5 px-5 rounded-xl cursor-pointer transition-all text-sm"
                  >
                    Φόρτωση άλλων {Math.min(HISTORY_PAGE * 5, orders.length - visibleRows).toLocaleString('el-GR')}
                  </button>
                  <button
                    onClick={() => setVisibleRows(orders.length)}
                    className="text-adaptive hover:text-[#C5A066] underline underline-offset-4 text-xs cursor-pointer bg-transparent border-0"
                  >
                    {/* Μετρημένο σε preview: ~4.700 γραμμές = ~6,5" πάγωμα της
                        καρτέλας (ο πίνακας ΚΑΙ η λίστα κινητού ζωγραφίζονται και
                        οι δύο). Το λέμε ΠΡΙΝ το πατήσει, όχι σε tooltip που στο
                        κινητό δεν φαίνεται καν. */}
                    Εμφάνιση όλων ({orders.length.toLocaleString('el-GR')})
                    {orders.length > 2000 && ' — θα αργήσει'}
                  </button>
                </div>
              )}

            </div>
          )}

        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-glass backdrop-blur-md p-8 rounded-2xl border border-[#C5A066]/40 text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex flex-col items-center justify-center">
          <Inbox size={48} className="text-adaptive mb-4" />
          <p className="text-[#C5A066] font-medium m-0 drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">Δεν βρέθηκαν ολοκληρωμένες παραγγελίες για αυτά τα φίλτρα.</p>
          <p className="text-adaptive text-sm m-0 mt-1">Δοκιμάστε να διευρύνετε το χρονικό διάστημα ή να αλλάξετε τις επιλογές σας.</p>
        </motion.div>
      )}
    </motion.div>
  );
}