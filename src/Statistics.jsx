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
import SearchableSelect from './SearchableSelect';

// ── Έτοιμα διαστήματα (αίτημα πελάτη 06/09/2026) ────────────────────────────
// «Όταν πάω στατιστικά να μου δείχνει τις ημέρες και μετά την επιλογή άμα θέλω
// να αλλάξω». Δηλαδή: κουμπιά μπροστά, ημερομηνίες πίσω από «Προσαρμογή».
//
// Το `days: N` σημαίνει «οι τελευταίες N ημέρες, με σημερινή μέσα» — δηλαδή
// από τα μεσάνυχτα της (σήμερα − N + 1) μέχρι τώρα. Έτσι το «7 ημέρες»
// συμφωνεί με το πλήθος ημερών που χρησιμοποιεί ο ρυθμός παραγγελιών/ώρα.
const PERIODS = [
  { id: 'today', label: 'Σήμερα',            days: 1 },
  { id: 'd2',    label: '2 ημέρες',          days: 2 },
  { id: 'd3',    label: '3 ημέρες',          days: 3 },
  { id: 'd7',    label: '7 ημέρες',          days: 7 },
  { id: 'd30',   label: '30 ημέρες',         days: 30 },
  { id: 'week',  label: 'Τρέχουσα εβδομάδα', week: true },
  { id: 'month', label: 'Τρέχων μήνας',      month: true },
];

// Δευτέρα της τρέχουσας εβδομάδας, 00:00 — κοινό σημείο αναφοράς για την
// προεπιλογή της οθόνης ΚΑΙ το κουμπί «Τρέχουσα εβδομάδα» (rangeFor).
// getDay(): 0=Κυριακή…6=Σάββατο· η Κυριακή θεωρείται τέλος της εβδομάδας, όχι αρχή.
function startOfCurrentWeek(from) {
  const d = new Date(from);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function Statistics() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // Νέο state για το ιστορικό
  // Ποιο στατιστικό δείχνει η κάρτα «Επίδοση Διανομέων»: πρώτα αποδοχή→ολοκλήρωση
  // (αίτημα πελάτη 09/09/2026) — ξεχωριστό από τη «Μέσος Συνολικός Χρόνος» πιο
  // πάνω, που μετρά πάντα δημιουργία→ολοκλήρωση και δεν αλλάζει με το toggle.
  const [driverPerfMode, setDriverPerfMode] = useState('accepted');
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

  // ── Πραγματικές ενεργές ώρες ανά διανομέα (αίτημα πελάτη 08/09/2026) ──────
  // «Παραγγελίες ανά ώρα δουλειάς» ΑΝΑ ΔΙΑΝΟΜΕΑ — π.χ. 50 παραγγελίες σε 5
  // ενεργές ώρες = 10/ώρα. driver_id → ώρες, από το driver_distance_report
  // (ήδη υπάρχει, χρησιμοποιείται στο FuelReport.jsx) που αθροίζει τις
  // πραγματικές βάρδιες (driver_shifts.started_at/ended_at), ΟΧΙ το ωράριο
  // καταστήματος που τροφοδοτεί την υπάρχουσα κάρτα «Παραγγελίες ανά Ώρα».
  const [driverHoursById, setDriverHoursById] = useState({});

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
  // Ο διανομέας ΤΩΝ ΔΕΔΟΜΕΝΩΝ ΠΟΥ ΔΕΙΧΝΟΝΤΑΙ — όχι ό,τι είναι επιλεγμένο αυτή
  // τη στιγμή στο dropdown. Ίδιο πρόβλημα με το appliedRange παρακάτω: μόλις ο
  // διαχειριστής διάλεγε διανομέα (πριν πατήσει «Ανανέωση»), ο «Ρυθμός
  // Διανομέα» άλλαζε αμέσως τίτλο/ώρες αλλά ο αριθμός παραγγελιών έμενε ακόμη
  // ο παλιός, ΜΗ φιλτραρισμένος — δηλαδή «σύνολο εταιρίας ÷ ώρες αυτού».
  const [appliedDriver, setAppliedDriver] = useState('');
  // Είδος καταστήματος (client feedback 08/08): «διάλεξε διανομέα + κατηγορία,
  // δες πόσες παραγγελίες έκανε, από ποια καταστήματα» — ίδιο μηχανισμό με τα
  // υπάρχοντα φίλτρα store/driver, τρίτο κριτήριο πάνω στο ήδη κοινό ερώτημα.
  const [selectedCategory, setSelectedCategory] = useState('');

  // Βοηθητική συνάρτηση για το format YYYY-MM-DDTHH:mm
  const formatDateTimeLocal = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  // ΠΡΟΕΠΙΛΟΓΗ = ΣΗΜΕΡΑ (αίτημα πελάτη 08/09/2026 — επιβεβαιώθηκε ρητά ότι η
  // «Τρέχουσα εβδομάδα» μένει ως ΕΠΙΛΟΓΗ κουμπιού, όχι ως προεπιλογή ανοίγματος).
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

  // Ποιο έτοιμο διάστημα είναι πατημένο· null όταν ο διαχειριστής έγραψε δικές
  // του ημερομηνίες. Ξεκινά στο «Σήμερα», που είναι και η προεπιλογή των πεδίων.
  const [activePeriod, setActivePeriod] = useState('today');
  const [showCustom, setShowCustom] = useState(false);

  /** Το διάστημα ενός έτοιμου κουμπιού, σε μορφή που δέχονται τα πεδία. */
  const rangeFor = (period) => {
    const now = new Date();
    if (period.week) return { start: formatDateTimeLocal(startOfCurrentWeek(now)), end: formatDateTimeLocal(now) };
    const from = new Date(now);
    if (period.month) from.setDate(1);
    else from.setDate(now.getDate() - (period.days - 1));
    from.setHours(0, 0, 0, 0);
    return { start: formatDateTimeLocal(from), end: formatDateTimeLocal(now) };
  };


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

  // `range` προαιρετικό: το δίνουν τα κουμπιά έτοιμων διαστημάτων, που αλλάζουν
  // τα πεδία και τρέχουν το ερώτημα στο ΙΔΙΟ render — πριν προλάβει το setState.
  const fetchStats = async (range) => {
    const from = range?.start ?? startDate;
    const to = range?.end ?? endDate;
    if (!from || !to) return;
    setLoading(true);
    setLoadedCount(0);
    setVisibleRows(HISTORY_PAGE);
    setShowHistory(false); // Κρύβουμε το ιστορικό σε κάθε νέα αναζήτηση

    const startIso = new Date(from).toISOString();
    const endIso = new Date(to).toISOString();
    setAppliedRange({ start: from, end: to });
    setAppliedDriver(selectedDriver);

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

    // driver_distance_report δέχεται ΗΜΕΡΟΜΗΝΙΕΣ, όχι ώρα — υπολογίζει ολόκληρες
    // ημέρες Ελλάδας (βλ. FuelReport.jsx). Σε διάστημα «Σήμερα» αυτό ταιριάζει
    // (η βάρδια δεν μπορεί να έχει τρέξει στο μέλλον), αλλά ένα προσαρμοσμένο
    // διάστημα ώρας μέσα στην ημέρα (π.χ. 14:00–18:00) θα μετρήσει τις ώρες
    // ΟΛΗΣ της ημέρας — αποδεκτή προσέγγιση, το ίδιο κάνει ήδη το Ταμείο.
    const [{ data, error, truncated }, hoursRes] = await Promise.all([
      fetchAllRows(buildQuery, { onProgress: setLoadedCount }),
      supabase.rpc('driver_distance_report', { p_from: from.slice(0, 10), p_to: to.slice(0, 10) }),
    ]);

    if (hoursRes.error) {
      console.error('Σφάλμα ωρών διανομέων:', hoursRes.error);
      setDriverHoursById({});
    } else {
      const map = {};
      (hoursRes.data || []).forEach(r => { map[r.driver_id] = Number(r.hours); });
      setDriverHoursById(map);
    }

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

  // Πατάς κουμπί → αλλάζουν τα πεδία ΚΑΙ τρέχει αμέσως το ερώτημα. Το διάστημα
  // περνά ρητά στο fetchStats: το setState είναι ασύγχρονο, οπότε ένα σκέτο
  // fetchStats() θα διάβαζε ακόμη τις ΠΡΟΗΓΟΥΜΕΝΕΣ ημερομηνίες.
  const applyPeriod = (period) => {
    const range = rangeFor(period);
    setStartDate(range.start);
    setEndDate(range.end);
    setActivePeriod(period.id);
    fetchStats(range);
  };

  const calculateKPIs = () => {
    let totalMins = 0;
    let validOrdersForTime = 0;
    const storeCounts = {};
    const driverTimes = {};

    orders.forEach(order => {
      const storeName = order.stores?.name || 'Άγνωστο';
      storeCounts[storeName] = (storeCounts[storeName] || 0) + 1;

      // Κλειδί το driver_id (όχι το όνομα): χρειάζεται για να ενωθεί παρακάτω
      // με τις ώρες βάρδιας του driver_distance_report, και αποφεύγει να
      // συγχωνεύσει δύο διαφορετικούς διανομείς με τυχαία ίδιο ονοματεπώνυμο.
      // ?? και όχι ||: ένα driver_id 0/'' είναι έγκυρο αναγνωριστικό, όχι «κενό».
      // Βγαίνει ΕΞΩ από τα if-blocks: μια παραγγελία μπορεί να έχει έγκυρο
      // accepted_at→completed_at δίχως να μπει στο πρώτο σκέλος (created_at→
      // completed_at) ή αντίστροφα, και θέλουμε τον διανομέα καταγεγραμμένο
      // και στις δύο περιπτώσεις.
      const driverId = order.driver_id ?? 'unknown';
      const driverName = order.drivers?.full_name || 'Άγνωστος';
      if (!driverTimes[driverId]) {
        driverTimes[driverId] = {
          name: driverName,
          totalMins: 0, count: 0,
          acceptedMins: 0, acceptedCount: 0,
        };
      }

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

        driverTimes[driverId].totalMins += mins;
        driverTimes[driverId].count += 1;
      }

      // Δεύτερο σκέλος επίδοσης (αίτημα πελάτη 09/09/2026): αποδοχή→ολοκλήρωση
      // αντί για δημιουργία→ολοκλήρωση — δηλαδή ΧΩΡΙΣ την αναμονή μέχρι να
      // πάρει την παραγγελία ο διανομέας. Ίδια λογική στρογγυλοποίησης μία
      // φορά στο τέλος, ίδιο μοτίβο με το πάνω σκέλος.
      if (order.accepted_at && order.completed_at) {
        const tAccept = new Date(order.accepted_at);
        const tComplete = new Date(order.completed_at);
        const acceptedMins = (tComplete - tAccept) / 60000;

        driverTimes[driverId].acceptedMins += acceptedMins;
        driverTimes[driverId].acceptedCount += 1;
      }
    });

    const avgTime = validOrdersForTime > 0 ? (totalMins / validOrdersForTime).toFixed(1) : 0;
    const sortedStores = Object.entries(storeCounts).sort((a, b) => b[1] - a[1]);
    const driverPerf = Object.entries(driverTimes).map(([driverId, data]) => {
      // Ρυθμός = παραδόσεις ÷ πραγματικές ενεργές ώρες βάρδιας στο ίδιο
      // διάστημα (0 ή άγνωστες ώρες → «—», ποτέ Infinity/παραπλανητικό νούμερο).
      const hours = driverHoursById[driverId];
      const rate = hours && hours > 0 ? data.count / hours : null;
      return {
        driverId, name: data.name,
        // null όταν δεν υπάρχει έστω μία έγκυρη παραγγελία γι' αυτό το σκέλος
        // — π.χ. διανομέας με παραγγελίες που δεν έχουν ακόμη accepted_at.
        avg: data.count > 0 ? (data.totalMins / data.count).toFixed(1) : null,
        avgAccepted: data.acceptedCount > 0 ? (data.acceptedMins / data.acceptedCount).toFixed(1) : null,
        // Πάντα το ΣΥΝΟΛΟ ολοκληρωμένων παραδόσεων — ίδιο νούμερο ό,τι στατιστικό
        // κι αν είναι επιλεγμένο (αίτημα πελάτη 09/09/2026), όχι μόνο όσες
        // μετράνε στο εκάστοτε σκέλος.
        deliveries: data.count, hours, rate,
      };
    });
    // Δύο ταξινομημένες λίστες, μία ανά σκέλος επίδοσης — ταχύτερος πρώτος και
    // στις δύο. null avg πάει στο τέλος αντί να σπάει τη σύγκριση.
    const sortedDrivers = [...driverPerf].sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity));
    const sortedDriversByAcceptance = [...driverPerf].sort((a, b) => (a.avgAccepted ?? Infinity) - (b.avgAccepted ?? Infinity));

    return { avgTime, totalOrders: orders.length, sortedStores, sortedDrivers, sortedDriversByAcceptance };
  };

  const kpis = calculateKPIs();

  // Ποια λίστα/όρια δείχνει η κάρτα «Επίδοση Διανομέων», ανάλογα με το toggle
  // αποδοχή/δημιουργία. Χαμηλότερα όρια χρώματος για την αποδοχή→ολοκλήρωση
  // (αίτημα πελάτη 09/09/2026): αγνοεί την αναμονή για ανάληψη, άρα φυσιολογικά
  // βγαίνει μικρότερη — με τα ίδια όρια θα έβγαιναν όλοι πράσινοι.
  //
  // `great` (μόνο στην Αποδοχή, αίτημα πελάτη 09/09/2026): κάτω από 12,5΄ =
  // καλός (πράσινο)· κάτω από 10΄ = απίστευτος (μπλε) — τρίτο, αυστηρότερο
  // επίπεδο ΠΑΝΩ από το «καλός», όχι εναλλακτικό του. Δεν ζητήθηκε αντίστοιχο
  // για τη Δημιουργία, οπότε εκείνη μένει με τα δύο επίπεδα.
  const driverPerfList = driverPerfMode === 'accepted' ? kpis.sortedDriversByAcceptance : kpis.sortedDrivers;
  const driverPerfThresholds = driverPerfMode === 'accepted'
    ? { great: 10, good: 12.5, bad: 15 }
    : { good: 15, bad: 25 };
  // `great` (μπλε) ελέγχεται ΠΡΩΤΑ — είναι η αυστηρότερη υποπερίπτωση του
  // «καλός», όχι εναλλακτικό όριο· χωρίς αυτή τη σειρά ένας απίστευτος χρόνος
  // θα έπεφτε στο πράσινο (και αυτό ισχύει) πριν προλάβει να ελεγχθεί το μπλε.
  const driverPerfBadgeClass = (avg) => {
    if (avg === null) return 'text-adaptive border-[#C5A066]/40 bg-[#C5A066]/10';
    if (driverPerfThresholds.great !== undefined && avg < driverPerfThresholds.great) return 'text-[#38BDF8] border-[#38BDF8]/40 bg-[#38BDF8]/10';
    if (avg < driverPerfThresholds.good) return 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10';
    if (avg > driverPerfThresholds.bad) return 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10';
    return 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10';
  };

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
  // ΔΙΟΡΘΩΣΗ (πελάτης 09/09/2026): όταν φιλτράρουμε σε ΕΝΑΝ διανομέα, ο ρυθμός
  // διαιρούσε ΠΑΝΤΑ με το σταθερό ωράριο καταστήματος (π.χ. 18 ώρες) — ένας
  // διανομέας ενεργός μόνο 8 ώρες σήμερα έβγαινε τεχνητά αργός. Με επιλεγμένο
  // διανομέα χρησιμοποιούμε τις ΔΙΚΕΣ ΤΟΥ πραγματικές ενεργές ώρες βάρδιας
  // (driver_distance_report, ίδιο μοτίβο με το badge στην «Επίδοση Διανομέων»).
  // Χωρίς καταγεγραμμένες ώρες πέφτει πίσω στον παλιό τύπο, καλύτερο από «—».
  //
  // appliedDriver ΚΑΙ ΟΧΙ selectedDriver (2η διόρθωση, ίδια μέρα): το kpis.
  // totalOrders μετρά τις ΗΔΗ φορτωμένες παραγγελίες — αυτές του ΤΕΛΕΥΤΑΙΟΥ
  // «Ανανέωση», όχι ό,τι δείχνει τώρα το dropdown. Με selectedDriver, μόλις ο
  // διαχειριστής διάλεγε διανομέα (πριν πατήσει «Ανανέωση») ο τίτλος/οι ώρες
  // άλλαζαν αμέσως αλλά ο αριθμός παραγγελιών έμενε ο παλιός της ΟΛΗΣ
  // εταιρίας — δηλαδή ακριβώς «σύνολο εταιρίας ÷ ώρες ενός διανομέα».
  const selectedDriverHours = appliedDriver ? driverHoursById[appliedDriver] : null;
  const usingDriverRate = !!(selectedDriverHours && selectedDriverHours > 0);
  const ordersPerHour = usingDriverRate
    ? kpis.totalOrders / selectedDriverHours
    : kpis.totalOrders / rangeDays / activeHours;

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
      {/* relative + z-20: τα SearchableSelect (Κατάστημα/Διανομέας) ανοίγουν
          λίστα με απόλυτη θέση και z-30, αλλά αυτό μόνο του δεν αρκεί — η
          ενότητα αποτελεσμάτων από κάτω είναι μέσα σε motion.div με
          animated opacity/transform, που της δίνει ΔΙΚΟ ΤΗΣ stacking context
          και έτσι ζωγραφίζεται ΠΑΝΩ από τη λίστα, ό,τι z-index κι αν έχει
          εκείνη, αφού ο ίδιος ο πίνακας φίλτρων δεν είχε δικό του context να
          «σηκωθεί» μαζί με τα παιδιά του. Το z-20 εδώ σηκώνει ΟΛΟ τον πίνακα
          (μαζί με την ανοιχτή λίστα μέσα του) πάνω από τα αποτελέσματα. */}
      <div className="relative z-20 mb-8 card-glass backdrop-blur-md p-4 md:p-5 rounded-2xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">

        {/* ── Έτοιμα διαστήματα: το πρώτο πράγμα που βλέπεις μπαίνοντας ────
            Αίτημα πελάτη 06/09/2026. Πριν, η οθόνη άνοιγε με δύο πεδία
            datetime-local — στο κινητό αυτό σημαίνει τρία tap και έναν
            επιλογέα ημερομηνίας για να δεις «τι έγινε χθες». */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {PERIODS.map(p => {
            const active = activePeriod === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyPeriod(p)}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={active
                  ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff', boxShadow: '0 2px 8px var(--accent-muted)' }
                  : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
              >
                {p.label}
              </button>
            );
          })}

          <button
            onClick={() => setShowCustom(v => !v)}
            className="px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all"
            style={activePeriod === null
              ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff' }
              : { backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border-default)' }}
            title="Δικό σου διάστημα, με ώρα"
          >
            <Calendar size={15} /> Προσαρμογή
          </button>
        </div>

        {/* Τα πεδία ημερομηνίας εμφανίζονται μόνο όταν ζητηθούν — ή όταν το
            τρέχον διάστημα ΕΙΝΑΙ χειροκίνητο, ώστε να μη μένει κρυφό αυτό που
            πραγματικά ισχύει. */}
        {(showCustom || activePeriod === null) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#C5A066]">Από</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setActivePeriod(null); }}
                className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#C5A066]">Έως</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setActivePeriod(null); }}
                className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#C5A066]">Κατάστημα</label>
            <SearchableSelect
              value={selectedStore}
              onChange={setSelectedStore}
              options={storesList.map(s => ({ value: s.id, label: s.name }))}
              emptyLabel="Όλα τα καταστήματα"
              className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#C5A066]">Διανομέας</label>
            <SearchableSelect
              value={selectedDriver}
              onChange={setSelectedDriver}
              options={driversList.map(d => ({ value: d.id, label: d.full_name }))}
              emptyLabel="Όλοι οι διανομείς"
              className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#C5A066]">Είδος</label>
            {/* Τα είδη είναι μετρημένα στα δάχτυλα — εδώ η αναζήτηση θα ήταν
                περισσότερη δουλειά για τον χρήστη, όχι λιγότερη. */}
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

          <div className="flex justify-center lg:justify-end">
            <button
              onClick={() => fetchStats()}
              disabled={loading}
              className="w-full sm:w-auto px-8 lg:px-6 py-2.5 btn-glass text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] rounded-xl cursor-pointer font-bold transition-all disabled:opacity-50 h-[42px] flex items-center justify-center gap-2"
            >
              {loading ? 'Φόρτωση...' : <><RefreshCcw size={16} /> Ανανέωση</>}
            </button>
          </div>
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
                {/* «Συνολικός» ρητά (πελάτης 06/09/2026): ο χάρτης και η εφαρμογή του
                    διανομέα δείχνουν ΑΠΟΔΟΧΗ→ΠΟΡΤΑ, εδώ μετράμε ΔΗΜΙΟΥΡΓΙΑ→ΠΟΡΤΑ.
                    Τα δύο νούμερα δεν συμφωνούν ποτέ και σωστά — η διαφορά τους
                    είναι η αναμονή μέχρι να πάρει την παραγγελία διανομέας. */}
                <h3 className="m-0 text-base font-bold">Μέσος Συνολικός Χρόνος</h3>
              </div>
              <p className="m-0 text-4xl font-black text-adaptive-light relative z-10">{kpis.avgTime} <span className="text-xl font-bold text-adaptive-light">λεπτά</span></p>
              <small className="text-adaptive block mt-2 font-medium relative z-10" title="Ο χάρτης και η εφαρμογή του διανομέα δείχνουν τον χρόνο διανομής (αποδοχή → πόρτα). Η διαφορά είναι η αναμονή μέχρι να την πάρει διανομέας.">
                Δημιουργία → πόρτα, μαζί με την αναμονή
              </small>
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
                <h3 className="m-0 text-base font-bold">{usingDriverRate ? 'Ρυθμός Διανομέα' : 'Παραγγελίες ανά Ώρα'}</h3>
              </div>
              <p className="m-0 text-4xl font-black text-adaptive-light relative z-10">{ordersPerHour.toFixed(2)}</p>
              {usingDriverRate ? (
                <small
                  className="text-adaptive block mt-2 font-medium relative z-10"
                  title={`${kpis.totalOrders} παραγγελίες ÷ ${selectedDriverHours.toFixed(1)} πραγματικές ενεργές ώρες βάρδιας στο διάστημα`}
                >
                  {kpis.totalOrders} ÷ {selectedDriverHours.toFixed(1)} ενεργές ώρες
                </small>
              ) : (
                <small
                  className="text-adaptive block mt-2 font-medium relative z-10"
                  title={`${kpis.totalOrders} παραγγελίες ÷ ${rangeDays} ${rangeDays === 1 ? 'ημέρα' : 'ημέρες'} ÷ ${activeHours} ώρες λειτουργίας${selectedDriver ? ' — χωρίς καταγεγραμμένες ώρες βάρδιας γι\' αυτόν τον διανομέα' : ''}`}
                >
                  {kpis.totalOrders} ÷ {rangeDays} {rangeDays === 1 ? 'ημέρα' : 'ημέρες'} ÷ {activeHours} ώρες
                </small>
              )}
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
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)] min-w-0">
                  <TrendingUp size={20} className="shrink-0" />
                  <h4 className="m-0 font-bold text-lg truncate">{selectedDriver ? 'Επίδοση Επιλεγμένου Διανομέα' : 'Επίδοση Διανομέων'}</h4>
                </div>
                {/* Ίδιο μοτίβο toggle με τη Ράβδοι/Πίτα της Οικονομικής Εκκαθάρισης
                    (Οφειλές ανά Κατάστημα). Προεπιλογή «Αποδοχή»: αυτό θέλει να δει
                    πρώτα ο διαχειριστής μπαίνοντας στην οθόνη. */}
                <div className="flex rounded-lg overflow-hidden border border-[#C5A066]/40 shrink-0">
                  {[
                    { key: 'accepted', label: 'Αποδοχή' },
                    { key: 'created', label: 'Δημιουργία' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setDriverPerfMode(opt.key)}
                      title={opt.key === 'accepted' ? 'Χρόνος από αποδοχή έως ολοκλήρωση' : 'Χρόνος από δημιουργία έως ολοκλήρωση'}
                      className={`px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                        driverPerfMode === opt.key
                          ? 'bg-[#C5A066]/20 text-[#C5A066]'
                          : 'btn-glass text-adaptive hover:text-[#C5A066]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card-glass backdrop-blur-md rounded-xl border border-[#C5A066]/40 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                {driverPerfList.length > 0 ? driverPerfList.map((driver, index) => {
                  const displayAvg = driverPerfMode === 'accepted' ? driver.avgAccepted : driver.avg;
                  return (
                  <div
                    key={driver.driverId}
                    className={`flex flex-wrap justify-between items-center gap-2 p-3 md:px-4 md:py-3 ${index !== driverPerfList.length - 1 ? 'border-b border-[#C5A066]/10' : ''} hover-row-glass transition-colors`}
                  >
                    <span className="text-adaptive-light">
                      {selectedDriver ? <b>{driver.name}</b> : <>{index + 1}. <b>{driver.name}</b></>}
                      <span className="text-adaptive text-xs ml-1">({driver.deliveries} παρ.)</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`font-bold border px-2.5 py-1 rounded-full text-xs whitespace-nowrap ${driverPerfBadgeClass(displayAvg)}`}
                        title={driverPerfMode === 'accepted' ? 'Μέσος χρόνος: αποδοχή → ολοκλήρωση' : 'Μέσος χρόνος: δημιουργία → ολοκλήρωση'}
                      >
                        {displayAvg === null ? '—' : `${displayAvg} λ.`}
                      </span>
                      <span
                        className="font-bold border px-2.5 py-1 rounded-full text-xs whitespace-nowrap text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10"
                        title={driver.rate !== null
                          ? `${driver.deliveries} παραγγελίες ÷ ${driver.hours.toFixed(1)} ενεργές ώρες βάρδιας`
                          : 'Δεν υπάρχουν καταγεγραμμένες ώρες βάρδιας σε αυτό το διάστημα'}
                      >
                        {driver.rate !== null ? `${driver.rate.toFixed(1)}/ώρα` : '— /ώρα'}
                      </span>
                    </span>
                  </div>
                  );
                }) : (
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