import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { onWake } from './live';
import * as XLSX from 'xlsx';
import { Receipt, Download, Wallet, Banknote, TrendingUp, Building, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { fetchAllRows, PAGE_SIZE, HARD_CAP } from './fetchAll';

export default function BillingDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  // Πίτα ή ράβδοι για τα καταστήματα. Προεπιλογή οι ράβδοι: με 36 καταστήματα η
  // πίτα γίνεται αδιάβαστη — οι μισές ετικέτες πέφτουν η μία πάνω στην άλλη και
  // πάνω από δέκα καταστήματα δείχνουν «0%».
  const [storeChart, setStoreChart] = useState('bar');
  // Σε κινητό ο άξονας με τα ονόματα έτρωγε 112 από τα 266 διαθέσιμα pixel και
  // άφηνε 98 για την ίδια τη ράβδο. Στενεύουμε ονόματα και περιθώριο εκεί.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Βοηθητική συνάρτηση για το format YYYY-MM-DDTHH:mm
  const formatDateTimeLocal = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const today = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [startDate, setStartDate] = useState(formatDateTimeLocal(startOfToday));
  const [endDate, setEndDate] = useState(formatDateTimeLocal(today));

  async function fetchCompletedOrders({ silent = false } = {}) {
    if (!startDate || !endDate) return;
    // Στο σιωπηλό φρεσκάρισμα δεν αγγίζουμε το `loading`: θα γκρέμιζε το
    // περιεχόμενο σε skeleton τη στιγμή που ο διαχειριστής διαβάζει νούμερα.
    if (!silent) { setLoading(true); setLoadedCount(0); }

    const startIso = new Date(startDate).toISOString();
    const endIso = new Date(endDate).toISOString();

    // ⚠ ΣΕΛΙΔΟΠΟΙΗΣΗ — ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ: το PostgREST κόβει σιωπηλά στις
    // 1000 γραμμές. Με ~350 παραγγελίες/ημέρα, κάθε τιμολόγηση πάνω από 3
    // ημέρες ΥΠΟΧΡΕΩΝΕ τα ποσά — ένας μήνας έδειχνε 1.000 αντί για ~10.500
    // παραγγελίες, δηλαδή λάθος οφειλές καταστημάτων και λάθος πληρωμές
    // διανομέων, χωρίς κανένα σφάλμα στην οθόνη.
    //
    // Το `.order('id')` είναι απαραίτητο: χωρίς σταθερή σειρά, οι σελίδες
    // μπορούν να επιστρέψουν διπλές ή να χάσουν γραμμές (= πάλι λάθος ποσά).
    const buildQuery = () =>
      supabase
        .from('orders')
        .select(`
          id, created_at, status, store_id, driver_id,
          stores ( name, delivery_fee ),
          drivers ( full_name )
        `)
        .eq('status', 'completed')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('id', { ascending: false });

    const { data, error, truncated } = await fetchAllRows(buildQuery, {
      onProgress: setLoadedCount,
    });

    if (data) {
      setOrders(data);
      if (silent) {
        // Σιωπηλά σημαίνει σιωπηλά: ο διαχειριστής δεν ζήτησε αυτό το ερώτημα,
        // δεν του χρωστάμε επιβεβαίωση — και ένα «Βρέθηκαν 8.412 παραγγελίες!»
        // κάθε φορά που γυρνά στην καρτέλα θα ήταν σκέτη ενόχληση.
      } else if (truncated) {
        toast.warning(
          `Το διάστημα είναι τεράστιο: τα ποσά αφορούν τις ${HARD_CAP.toLocaleString('el-GR')} πιο πρόσφατες παραγγελίες. Στενέψτε τις ημερομηνίες.`,
          { duration: 8000 }
        );
      } else if (data.length > 0) {
        toast.success(`Βρέθηκαν ${data.length.toLocaleString('el-GR')} παραγγελίες!`);
      } else {
        toast.info("Δεν βρέθηκαν παραγγελίες για αυτό το διάστημα.");
      }
    }
    if (error) {
      console.error("Σφάλμα:", error);
      if (!silent) toast.error("Σφάλμα κατά την ανάκτηση των παραγγελιών.");
    }
    if (!silent) setLoading(false);
  }

  // ── Φρεσκάρισμα μόλις ξαναγίνει ορατή η καρτέλα (αίτημα πελάτη 06/09/2026) ──
  // ΜΟΝΟ ΑΝ ΕΧΕΙ ΗΔΗ ΤΡΕΞΕΙ ΕΡΩΤΗΜΑ. Η εκκαθάριση δεν είναι ζωντανή οθόνη σαν
  // τον χάρτη: είναι αναφορά πάνω σε διάστημα που διάλεξε ο διαχειριστής, και
  // κατεβάζει έως δεκάδες χιλιάδες γραμμές σε σελίδες. Χωρίς αυτόν τον φράχτη
  // κάθε alt-tab θα ξεκινούσε ένα βαρύ ερώτημα που κανείς δεν ζήτησε.
  //
  // Το `ordersRef` σπάει τη στάσιμη κλειστότητα: το onWake δηλώνεται μία φορά,
  // αλλά πρέπει να βλέπει το ΤΡΕΧΟΝ πλήθος παραγγελιών κάθε φορά που χτυπά.
  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; });
  useEffect(() => onWake(() => {
    if (ordersRef.current.length > 0) fetchCompletedOrders({ silent: true });
  }));

  const COLORS = ['#C5A066', '#38EF7D', '#9D4EDD', '#60A5FA', '#FBBF24', '#F87171'];

  const calculateFinancials = () => {
    let totalStoreCharges = 0;
    let totalDriverPayouts = 0;
    let totalCompanyProfit = 0;
    const storeBreakdown = {};
    const driverBreakdown = {};

    orders.forEach(order => {
      const storeName = order.stores?.name || 'Άγνωστο Κατάστημα';
      const driverName = order.drivers?.full_name || 'Άγνωστος Οδηγός';
      const storeRate = order.stores?.delivery_fee || 0;
      // ΤΟ 0,50 ΗΤΑΝ ΛΑΘΟΣ ΥΠΟΔΙΑΣΤΟΛΗΣ (05/09/2026). Με delivery_fee 0,15/0,18 η
      // «Πληρωμή Διανομέων» έβγαινε −0,35 και −0,32 €, δηλαδή αρνητικός μισθός.
      // Το μερίδιο της εταιρείας είναι 5 λεπτά ανά παραγγελία, όχι 50:
      //   καφέ   0,15 − 0,05 = 0,10 €
      //   φαγητό 0,18 − 0,05 = 0,13 €   (ίδιο και για τα ψιλικά)
      // Η ανάλυση παρακάτω ομαδοποιεί ανά ΤΙΜΗ, όχι ανά είδος: φαγητό και ψιλικά
      // πέφτουν μόνα τους στην ίδια γραμμή («15 παρ. x 0.13 €»), ενώ ένα μελλοντικό
      // κατάστημα με άλλη χρέωση (π.χ. 0,22 → 0,17 €) προσθέτει μόνο του τη δική του.
      const companyShare = 0.05;
      const driverPayout = storeRate - companyShare;

      totalStoreCharges += storeRate;
      totalDriverPayouts += driverPayout;
      totalCompanyProfit += companyShare;

      if (!storeBreakdown[storeName]) storeBreakdown[storeName] = { count: 0, balance: 0 };
      storeBreakdown[storeName].count += 1;
      storeBreakdown[storeName].balance += storeRate;

      if (!driverBreakdown[driverName]) driverBreakdown[driverName] = { totalCount: 0, totalBalance: 0, rates: {} };
      driverBreakdown[driverName].totalCount += 1;
      driverBreakdown[driverName].totalBalance += driverPayout;
      if (!driverBreakdown[driverName].rates[driverPayout]) driverBreakdown[driverName].rates[driverPayout] = 0;
      driverBreakdown[driverName].rates[driverPayout] += 1;
    });

    return { totalStoreCharges, totalDriverPayouts, totalCompanyProfit, storeBreakdown, driverBreakdown };
  };

  const financials = calculateFinancials();

  const exportStoresToExcel = () => {
    const data = Object.keys(financials.storeBreakdown).map(store => ({
      'Κατάστημα': store,
      'Σύνολο Παραγγελιών': financials.storeBreakdown[store].count,
      'Οφειλή προς Εταιρεία (€)': financials.storeBreakdown[store].balance.toFixed(2)
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Καταστήματα");
    XLSX.writeFile(workbook, `Εκκαθάριση_Καταστημάτων.xlsx`);
    toast.success("Το Excel καταστημάτων κατέβηκε επιτυχώς!");
  };

  const exportDriversToExcel = () => {
    const data = Object.keys(financials.driverBreakdown).map(driver => ({
      'Διανομέας': driver,
      'Σύνολο Παραγγελιών': financials.driverBreakdown[driver].totalCount,
      'Πληρωμή (€)': financials.driverBreakdown[driver].totalBalance.toFixed(2)
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Διανομείς");
    XLSX.writeFile(workbook, `Μισθοδοσία_Διανομέων.xlsx`);
    toast.success("Το Excel διανομέων κατέβηκε επιτυχώς!");
  };

  // ── Δεδομένα γραφημάτων ─────────────────────────────────────────────────
  // Και τα δύο ήταν ΑΤΑΞΙΝΟΜΗΤΑ: η σειρά ήταν αυτή με την οποία πρωτοεμφανιζόταν
  // ο καθένας στις παραγγελίες που κατέβηκαν — ούτε καν αλφαβητική.
  const storeChartData = Object.keys(financials.storeBreakdown)
    .map(store => ({ name: store, value: financials.storeBreakdown[store].balance }))
    .sort((a, b) => b.value - a.value);              // μεγαλύτερη οφειλή πρώτη

  // Η πίτα κρατά τα 6 μεγαλύτερα και μαζεύει τα υπόλοιπα σε ένα κομμάτι, αλλιώς
  // δεν διαβάζεται. Οι ράβδοι τα δείχνουν ούτως ή άλλως όλα.
  const PIE_TOP = 6;
  const storePieData = storeChartData.length > PIE_TOP + 1
    ? [
        ...storeChartData.slice(0, PIE_TOP),
        {
          name: 'Λοιπά (' + (storeChartData.length - PIE_TOP) + ')',
          value: storeChartData.slice(PIE_TOP).reduce((sum, d) => sum + d.value, 0),
        },
      ]
    : storeChartData;

  // Αύξουσα σειρά αποδοχών (αίτημα πελάτη 05/09/2026).
  const driverChartData = Object.keys(financials.driverBreakdown)
    .map(driver => ({ name: driver, value: financials.driverBreakdown[driver].totalBalance }))
    .sort((a, b) => a.value - b.value);

  // Οριζόντιες ράβδοι: το ύψος μεγαλώνει με τις γραμμές ώστε να χωράει ΚΑΘΕ
  // όνομα. Ο κάθετος άξονας πετούσε ονόματα διανομέων γιατί δεν χωρούσαν πλάγια.
  const rowsHeight = (n) => Math.max(200, n * 34 + 20);
  // 150px στη στήλη ονομάτων, όχι 112: με 112 ΚΑΘΕ ονοματεπώνυμο διανομέα έσπαγε
  // σε δύο σειρές ΚΑΙ κοβόταν («Παναγιώτης / Κατσ…»), δηλαδή το επώνυμο χανόταν.
  // Μένουν 408px για τη ράβδο σε desktop — υπεραρκετά.
  const nameWidth = narrow ? 104 : 168;
  const valueGutter = narrow ? 44 : 56;
  const nameMax = narrow ? 12 : 22;
  const shortName = (v) => (v.length > nameMax ? v.slice(0, nameMax - 1) + '…' : v);
  // Σε κινητό δεν χωράει ολόκληρο ονοματεπώνυμο· «Παναγιώτης Κατσούτας» γίνεται
  // «Παναγιώτης Κ.», που διαβάζεται — σε αντίθεση με ένα κομμένο επώνυμο.
  const driverAxisName = (v) => {
    if (!narrow) return shortName(v);
    const parts = String(v).trim().split(/\s+/);
    return parts.length > 1 ? `${shortName(parts[0])} ${parts[1][0]}.` : shortName(v);
  };

  const axisTick = { fontSize: 11, fill: '#A89C8E' };
  const tooltipMoney = (value) => value.toFixed(2) + ' €';
  const moneyLabel = (v) => Number(v).toFixed(2) + '€';

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="font-sans text-adaptive-light"
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Receipt className="text-[#C5A066]" size={24} />
          <h2 className="m-0 text-[#C5A066] text-xl font-bold drop-shadow-[0_0_8px_rgba(197,160,102,0.5)] tracking-wide">Οικονομική Εκκαθάριση</h2>
        </div>
        <p className="m-0 text-adaptive text-sm">Υπολογισμός οφειλών και μισθοδοσίας με ακρίβεια ώρας/λεπτού.</p>
      </div>
      
      {/* Φίλτρα Ημερομηνιών */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-start md:items-center card-glass backdrop-blur-md p-4 rounded-xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        <input 
          type="datetime-local" 
          value={startDate} 
          onChange={e => setStartDate(e.target.value)} 
          className="w-full md:w-auto p-2.5 rounded-lg border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 transition-colors btn-glass text-adaptive-light"
        />
        <span className="text-[#C5A066] font-bold hidden md:inline">έως</span>
        <input 
          type="datetime-local" 
          value={endDate} 
          onChange={e => setEndDate(e.target.value)} 
          className="w-full md:w-auto p-2.5 rounded-lg border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 transition-colors btn-glass text-adaptive-light"
        />
        <button 
          // Ρητά χωρίς όρισμα: σκέτο `onClick={fetchCompletedOrders}` θα περνούσε
          // το MouseEvent στη θέση των επιλογών.
          onClick={() => fetchCompletedOrders()} 
          disabled={loading} 
          className="w-full md:w-auto py-2.5 px-6 btn-glass text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] rounded-lg cursor-pointer font-bold transition-all disabled:opacity-50 mt-2 md:mt-0"
        >
          {loading ? 'Υπολογισμός...' : 'Έκδοση Λογαριασμών'}
        </button>
      </div>

      {loading ? (
        <div className="space-y-6">
          {loadedCount > PAGE_SIZE && (
            <div className="text-center text-sm text-[#C5A066] font-bold">
              Ανάκτηση… {loadedCount.toLocaleString('el-GR')} παραγγελίες
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-32 skeleton"></div>
            <div className="h-32 skeleton"></div>
            <div className="h-32 skeleton"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="h-[400px] skeleton"></div>
            <div className="h-[400px] skeleton"></div>
          </div>
        </div>
      ) : orders.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          {/* Κουμπιά Λήψης Excel */}
          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <button 
              onClick={exportStoresToExcel} 
              className="w-full md:w-auto btn-glass text-[#38EF7D] border border-[#38EF7D]/50 hover:shadow-[inset_0_0_15px_rgba(56,239,125,0.4)] py-3 px-5 rounded-xl cursor-pointer font-bold transition-all flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Λήψη Οφειλών Καταστημάτων
            </button>
            <button 
              onClick={exportDriversToExcel} 
              className="w-full md:w-auto btn-glass text-[#9D4EDD] border border-[#9D4EDD]/50 hover:shadow-[inset_0_0_15px_rgba(157,78,221,0.4)] py-3 px-5 rounded-xl cursor-pointer font-bold transition-all flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Λήψη Μισθοδοσίας
            </button>
          </div>

          {/* Στατιστικές Κάρτες */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
            <div className="p-6 card-glass backdrop-blur-md border border-[#38EF7D]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] hover:-translate-y-1 transition-transform">
              <div className="flex items-center gap-2 mb-2 text-[#38EF7D] drop-shadow-[0_0_5px_rgba(56,239,125,0.5)]">
                <Wallet size={20} />
                <h3 className="m-0 text-base font-bold">Είσπραξη από Μαγαζιά</h3>
              </div>
              <p className="m-0 text-3xl font-black text-adaptive-light">{financials.totalStoreCharges.toFixed(2)} €</p>
              <small className="text-adaptive font-medium">Από {orders.length} παραγγελίες</small>
            </div>
            <div className="p-6 card-glass backdrop-blur-md border border-[#9D4EDD]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] hover:-translate-y-1 transition-transform">
              <div className="flex items-center gap-2 mb-2 text-[#9D4EDD] drop-shadow-[0_0_5px_rgba(157,78,221,0.5)]">
                <Banknote size={20} />
                <h3 className="m-0 text-base font-bold">Πληρωμές Διανομέων</h3>
              </div>
              <p className="m-0 text-3xl font-black text-adaptive-light">{financials.totalDriverPayouts.toFixed(2)} €</p>
            </div>
            <div className="p-6 card-glass backdrop-blur-md border border-[#C5A066]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] hover:-translate-y-1 transition-transform">
              <div className="flex items-center gap-2 mb-2 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.5)]">
                <TrendingUp size={20} />
                <h3 className="m-0 text-base font-bold">Καθαρό Κέρδος</h3>
              </div>
              <p className="m-0 text-3xl font-black text-adaptive-light">{financials.totalCompanyProfit.toFixed(2)} €</p>
            </div>
          </div>

          {/* Γραφήματα */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="card-glass backdrop-blur-md p-6 rounded-2xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h4 className="m-0 font-bold text-[#38EF7D]">Οφειλές ανά Κατάστημα</h4>
                {/* Η πίτα μένει διαθέσιμη για μια γρήγορη εικόνα «ποιος κρατά το
                    μεγαλύτερο κομμάτι», αλλά δεν είναι πια η προεπιλογή. */}
                <div className="flex rounded-lg overflow-hidden border border-[#38EF7D]/40 shrink-0">
                  {[
                    { key: 'bar', label: 'Ράβδοι' },
                    { key: 'pie', label: 'Πίτα' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setStoreChart(opt.key)}
                      className={`px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                        storeChart === opt.key
                          ? 'bg-[#38EF7D]/20 text-[#38EF7D]'
                          : 'btn-glass text-adaptive hover:text-[#38EF7D]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {storeChart === 'bar' ? (
                <div className="max-h-[420px] overflow-y-auto pr-1">
                  <div style={{ height: rowsHeight(storeChartData.length) }} className="w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={storeChartData} layout="vertical" margin={{ left: 4, right: valueGutter, top: 4, bottom: 4 }}>
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={nameWidth}
                          interval={0}
                          tick={axisTick}
                          tickFormatter={shortName}
                          stroke="#A89C8E"
                        />
                        <RechartsTooltip
                          formatter={tooltipMoney}
                          cursor={{ fill: 'rgba(56,239,125,0.08)' }}
                          contentStyle={{ backgroundColor: '#1A1A1A', borderColor: '#38EF7D', borderRadius: '8px' }}
                        />
                        <Bar dataKey="value" fill="#38EF7D" radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="value" position="right" fontSize={11} fill="#38EF7D" formatter={moneyLabel} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={storePieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        fill="#8884d8"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {storePieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={tooltipMoney}
                        contentStyle={{ backgroundColor: '#1A1A1A', borderColor: '#C5A066', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card-glass backdrop-blur-md p-6 rounded-2xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              <h4 className="font-bold mb-4 text-[#9D4EDD]">Αποδοχές ανά Διανομέα</h4>
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <div style={{ height: rowsHeight(driverChartData.length) }} className="w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={driverChartData} layout="vertical" margin={{ left: 4, right: valueGutter, top: 4, bottom: 4 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={nameWidth}
                        interval={0}
                        tick={axisTick}
                        tickFormatter={driverAxisName}
                        stroke="#A89C8E"
                      />
                      <RechartsTooltip
                        formatter={tooltipMoney}
                        cursor={{ fill: 'rgba(157,78,221,0.10)' }}
                        contentStyle={{ backgroundColor: '#1A1A1A', borderColor: '#9D4EDD', borderRadius: '8px' }}
                      />
                      <Bar dataKey="value" fill="#9D4EDD" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="value" position="right" fontSize={11} fill="#9D4EDD" formatter={moneyLabel} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
          {/* Αναλύσεις (Cards για Κινητά / Grids για Desktop) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Ανάλυση Καταστημάτων */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">
                <Building size={20} />
                <h4 className="m-0 font-bold text-lg">Ανάλυση ανά Κατάστημα</h4>
              </div>
              <div className="bg-transparent md:card-glass backdrop-blur-md md:rounded-xl md:border md:border-[#C5A066]/40 md:shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="hidden md:grid grid-cols-3 table-header-glass border-b border-[#C5A066]/40 text-[#C5A066] font-bold p-4">
                  <div>Κατάστημα</div>
                  <div>Παραγγελίες</div>
                  <div>Οφειλή</div>
                </div>
                <div className="flex flex-col gap-3 md:gap-0">
                  {Object.keys(financials.storeBreakdown).map(store => (
                    <div key={store} className="grid grid-cols-1 md:grid-cols-3 items-center bg-transparent p-4 md:p-4 border border-[#C5A066]/20 md:border-0 md:border-b md:border-[#C5A066]/20 rounded-xl md:rounded-none hover-row-glass transition-colors">
                      <div className="font-bold text-adaptive-light text-lg md:text-base mb-2 md:mb-0">{store}</div>
                      <div className="flex justify-between md:block text-adaptive-light mb-2 md:mb-0">
                        <span className="md:hidden font-semibold text-adaptive text-sm">Παραγγελίες:</span>
                        {financials.storeBreakdown[store].count}
                      </div>
                      <div className="flex justify-between md:block font-bold text-[#38EF7D] pt-2 border-t border-[#C5A066]/10 md:border-0 md:pt-0">
                        <span className="md:hidden font-semibold text-adaptive text-sm">Οφειλή:</span>
                        {financials.storeBreakdown[store].balance.toFixed(2)} €
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Μισθοδοσία Διανομέων */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">
                <UserCheck size={20} />
                <h4 className="m-0 font-bold text-lg">Μισθοδοσία Διανομέων</h4>
              </div>
              <div className="bg-transparent md:card-glass backdrop-blur-md md:rounded-xl md:border md:border-[#C5A066]/40 md:shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="hidden md:grid grid-cols-3 table-header-glass border-b border-[#C5A066]/40 text-[#C5A066] font-bold p-4">
                  <div>Διανομέας</div>
                  <div>Ανάλυση</div>
                  <div>Πληρωμή</div>
                </div>
                <div className="flex flex-col gap-3 md:gap-0">
                  {Object.keys(financials.driverBreakdown).map(driver => {
                    const data = financials.driverBreakdown[driver];
                    return (
                      <div key={driver} className="grid grid-cols-1 md:grid-cols-3 items-start md:items-center bg-transparent p-4 md:p-4 border border-[#C5A066]/20 md:border-0 md:border-b md:border-[#C5A066]/20 rounded-xl md:rounded-none hover-row-glass transition-colors">
                        <div className="font-bold text-adaptive-light text-lg md:text-base mb-3 md:mb-0">{driver}</div>
                        <div className="text-adaptive-light mb-3 md:mb-0">
                          <div className="text-[13px]">Σύνολο: <b>{data.totalCount}</b></div>
                          <ul className="m-0 mt-1 pl-4 text-xs text-adaptive list-disc">
                            {Object.keys(data.rates).map(rate => (
                              <li key={rate} className="whitespace-nowrap">{data.rates[rate]} παρ. x {Number(rate).toFixed(2)} €</li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex justify-between items-center md:block font-black text-[#9D4EDD] text-base md:text-lg pt-3 border-t border-[#C5A066]/10 md:border-0 md:pt-0">
                          <span className="md:hidden font-semibold text-adaptive text-sm">Πληρωμή:</span>
                          {data.totalBalance.toFixed(2)} €
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-glass backdrop-blur-md p-6 rounded-xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)] text-center mt-8">
          <p className="text-[#C5A066] italic m-0 drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">Δεν βρέθηκαν ολοκληρωμένες παραγγελίες για αυτό το χρονικό διάστημα.</p>
        </motion.div>
      )}
    </motion.div>
  );
}