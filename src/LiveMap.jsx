import React, { useState, useEffect, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { supabase, getActiveBackend, getTenantSchema, isReadOnly } from './supabaseClient';
import { useTheme } from './ThemeContext.jsx';
import { Building, MapPin, AlertTriangle, Bike, MessageSquare, Clock, X, Check, User, Activity, ChevronUp, ChevronDown, Timer, Flame, BatteryWarning, BatteryLow, BatteryMedium, BatteryFull, Route, Repeat, Hourglass, Package } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from './ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { formatKm, formatEuro, formatCountdown, orderDurations } from './distance';

// Tile layer URLs
const TILES = {
  // Επαναφορά στους Carto μέχρι να βάλουμε το επίσημο Google Maps API
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
};

// Τα εικονίδια έρχονται από το ΙΔΙΟ το πακέτο leaflet (node_modules) και μπαίνουν
// στο bundle από το Vite — όχι από CDN. Έτσι ο χάρτης δείχνει σωστούς δείκτες
// ακόμα κι όταν δεν υπάρχει πρόσβαση στο cdnjs (offline/κλειστό δίκτυο πελάτη).
// Bonus: πριν τραβούσαμε icons v1.7.1 ενώ το εγκατεστημένο leaflet είναι 1.9.4.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ── Ήχος ειδοποίησης νέας παραγγελίας ───────────────────────────────────────
// Παράγεται τοπικά με Web Audio αντί να κατεβαίνει .ogg από το actions.google.com:
// δουλεύει offline, δεν εξαρτάται από τρίτο host, και δεν ενσωματώνουμε ξένο
// ηχητικό αρχείο (θέμα άδειας χρήσης) σε προϊόν που πουλιέται σε πελάτη.
let audioCtx = null;
function playAlertSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    // Οι browsers ξεκινούν το context σε "suspended" μέχρι την πρώτη αλληλεπίδραση.
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);          // σύντομο «μπιπ» (A5)
    gain.gain.setValueAtTime(0.0001, t);           // ράμπες αντί για απότομο on/off
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  } catch (e) {
    console.log('Ο ήχος ειδοποίησης δεν παίχτηκε:', e);
  }
}

// ── Σταθερές για το heatmap φόρτου ──────────────────────────────────────────
// JS getDay(): 0=Κυρ ... 6=Σαβ. Τα εμφανίζουμε ξεκινώντας από Δευτέρα.
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABELS = { 1: 'Δευ', 2: 'Τρι', 3: 'Τετ', 4: 'Πεμ', 5: 'Παρ', 6: 'Σαβ', 0: 'Κυρ' };
const DOW_FULL = { 1: 'Δευτέρα', 2: 'Τρίτη', 3: 'Τετάρτη', 4: 'Πέμπτη', 5: 'Παρασκευή', 6: 'Σάββατο', 0: 'Κυριακή' };

// ── Κατάσταση σήματος διανομέα (ανοχή σε χαμένο σήμα σε ασανσέρ/πολυκατοικίες) ──
// < FRESH: online · FRESH–OFFLINE: μένει στον χάρτη ως «χωρίς σήμα» · > OFFLINE: φεύγει.
const SIGNAL_FRESH_MIN = 2;
const SIGNAL_OFFLINE_MIN = 20;

// ── Μπαταρία κινητού διανομέα: εικονίδιο + χρώμα ανά στάθμη ──────────────────
// Χρήσιμο για εταιρίες που δίνουν κινητά στους διανομείς για τη βάρδια.
const batteryVisual = (level) => {
  if (level === null || level === undefined) return null;
  if (level <= 15) return { Icon: BatteryWarning, color: 'var(--map-critical)' };
  if (level <= 40) return { Icon: BatteryLow, color: 'var(--map-warning)' };
  if (level <= 75) return { Icon: BatteryMedium, color: 'var(--map-gold)' };
  return { Icon: BatteryFull, color: 'var(--map-green)' };
};

// Το Leaflet δεν αντιλαμβάνεται μόνο του αλλαγές μεγέθους του container
// (π.χ. άνοιγμα του πάνελ φόρτου) — κάνουμε invalidateSize σε κάθε resize.
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

// MULTI-TENANT: recenter όταν φτάσει το map_center της εταιρίας. Το `center` αλλάζει
// μόνο μία φορά (default → fetched) κατά τη φόρτωση, οπότε δεν παλεύει με τον χρήστη.
function MapCenterHandler({ center }) {
  const map = useMap();
  const key = center ? `${center[0]},${center[1]}` : '';
  useEffect(() => {
    if (center) map.setView(center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

// ── Chip απόστασης (+ επιπλέον χρέωση καταστήματος όταν υπάρχει) ────────────
function DistanceChip({ order }) {
  if (order.distance_km === null || order.distance_km === undefined) return null;
  const hasSurcharge = Number(order.surcharge) > 0;
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
      style={hasSurcharge
        ? { color: 'var(--warning)', backgroundColor: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }
        : { color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
      title={hasSurcharge ? `Επιπλέον χρέωση καταστήματος: ${formatEuro(order.surcharge)}` : 'Εντός ζώνης χωρίς επιπλέον χρέωση'}
    >
      <Route size={10} />
      {formatKm(order.distance_km)}
      {hasSurcharge ? ` · +${formatEuro(order.surcharge)}` : ''}
    </span>
  );
}

// Αύξων αριθμός θέσης μέσα στη λίστα (αίτημα πελάτη: «1 2 3 ενεργές και 1 2 3 αποδεκτές»).
function OrderNumber({ n }) {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-black tabular-nums"
      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
    >
      {n}
    </span>
  );
}

// ── Ενότητα της δεξιάς στήλης (Εκκρεμείς / Ενεργές / Διανομείς) ──────────────
function RailSection({ Icon, title, count, tint, children }) {
  return (
    <div className="px-3 pt-3 pb-2 border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={13} style={{ color: tint }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {title}
        </span>
        {typeof count === 'number' && (
          <span
            className="text-[11px] font-bold px-1.5 rounded-full"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: tint }}
          >
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function LiveMap() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const currentTile = TILES[theme] || TILES.dark;

  const mapFilter = 'none';
  const [drivers, setDrivers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [assigningOrderId, setAssigningOrderId] = useState(null);
  // Μετάθεση ήδη ανατεθειμένης παραγγελίας σε άλλον διανομέα (ανοιχτό dropdown).
  const [reassigningOrderId, setReassigningOrderId] = useState(null);
  // Ποιες παραγγελίες ήταν 'scheduled' πριν το τελευταίο realtime event.
  const scheduledIdsRef = useRef(new Set());
  const [lastCompletedTimes, setLastCompletedTimes] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  const [showWorkload, setShowWorkload] = useState(false);

  // ── Στατιστικά φόρτου / χρόνου ──
  const [workloadMatrix, setWorkloadMatrix] = useState(null); // { [jsDay]: { [hour]: avg } }
  const [workloadMax, setWorkloadMax] = useState(0);
  const [avgDeliveryToday, setAvgDeliveryToday] = useState(null);
  const [ordersToday, setOrdersToday] = useState(0);
  const [loadingWorkload, setLoadingWorkload] = useState(false);
  // MULTI-TENANT: κέντρο χάρτη ανά εταιρία από τον companies (fallback Φλώρινα· σε
  // production χωρίς companies/hook το query αποτυγχάνει σιωπηλά → μένει το default).
  const [centerPosition, setCenterPosition] = useState([40.7819, 21.4098]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.schema('public').from('companies')
          .select('map_center').eq('schema_name', getTenantSchema()).maybeSingle();
        if (data?.map_center) {
          const [lat, lng] = data.map_center.split(',').map(Number);
          if (Number.isFinite(lat) && Number.isFinite(lng)) setCenterPosition([lat, lng]);
        }
      } catch (_) {}
    })();
  }, []);

  // Το ρολόι χτυπά ανά δευτερόλεπτο ΜΟΝΟ όσο υπάρχει προγραμματισμένη παραγγελία με
  // αντίστροφη μέτρηση να δείξουμε· αλλιώς ανά λεπτό (όσο χρειάζονται οι χρόνοι αναμονής).
  const hasScheduled = orders.some(o => o.status === 'scheduled');
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), hasScheduled ? 1000 : 60000);
    return () => clearInterval(timer);
  }, [hasScheduled]);

  const fetchDrivers = async () => {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, latitude, longitude, last_seen, battery_level')
      .eq('is_active', true)
      .not('latitude', 'is', null);
    if (data) setDrivers(data);
    if (error) console.error("Σφάλμα οδηγών:", error);
  };

  const fetchActiveOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(`id, address, comments, status, driver_id, created_at, accepted_at, picked_up_at, scheduled_at, distance_km, surcharge, stores ( name ), drivers ( full_name )`)
      .in('status', ['scheduled', 'pending', 'accepted'])
      .order('created_at', { ascending: false });
    if (data) {
      setOrders(data);
      // Ποιες είναι αυτή τη στιγμή προγραμματισμένες — το χρειάζεται ο realtime
      // handler για να καταλάβει τη μετάβαση 'scheduled' → 'pending'.
      scheduledIdsRef.current = new Set(data.filter(o => o.status === 'scheduled').map(o => o.id));
    }
    if (error) console.error("Σφάλμα παραγγελιών:", error);
  };

  // Απελευθέρωση των προγραμματισμένων παραγγελιών που έφτασε η ώρα τους
  // ('scheduled' → 'pending'). Ατομικό UPDATE στη βάση, οπότε είναι ακίνδυνο να
  // το καλούν παράλληλα admin/κατάστημα/διανομείς — ο πρώτος κερδίζει και το
  // realtime event ενημερώνει τους υπόλοιπους.
  const releaseDueOrders = async () => {
    try {
      await supabase.rpc('release_due_orders');
    } catch {
      /* σιωπηλά — ξαναπροσπαθεί ο επόμενος κύκλος σε 15" */
    }
  };

  const fetchLastCompletedTimes = async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('orders')
      .select('driver_id, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', startOfDay.toISOString());

    if (data) {
      const times = {};
      data.forEach(order => {
        if (order.driver_id && order.completed_at) {
          const t = new Date(order.completed_at).getTime();
          if (!times[order.driver_id] || t > times[order.driver_id]) {
            times[order.driver_id] = t;
          }
        }
      });
      setLastCompletedTimes(times);
    }
  };

  // ── Υπολογισμός heatmap φόρτου (live από όλο το ιστορικό) ──
  // Για κάθε (ημέρα εβδομάδας, ώρα) αθροίζουμε όλες τις παραγγελίες και
  // διαιρούμε με το πλήθος των διακριτών ημερολογιακών ημερών εκείνης της
  // ημέρας εβδομάδας που εμφανίζονται στα δεδομένα → μέσος όρος ανά slot.
  const fetchWorkloadStats = async () => {
    setLoadingWorkload(true);

    // Ο Postgres κάνει την ομαδοποίηση και γυρνάει 168 γραμμές (7×24), αντί να
    // κατεβάζουμε έως 10.000 παραγγελίες στον browser σε κάθε νέα παραγγελία.
    const { data, error } = await supabase.rpc('workload_stats');

    if (!error && Array.isArray(data)) {
      const matrix = {};
      let max = 0;
      DOW_ORDER.forEach(d => { matrix[d] = {}; for (let h = 0; h < 24; h++) matrix[d][h] = 0; });
      data.forEach(row => {
        // Το numeric του Postgres έρχεται ως string στο JSON — πάντα Number().
        const avg = Number(row.avg_orders) || 0;
        if (matrix[row.dow]) matrix[row.dow][row.hour] = avg;
        if (avg > max) max = avg;
      });
      setWorkloadMatrix(matrix);
      setWorkloadMax(max);
      setLoadingWorkload(false);
      return;
    }

    // Fallback στον παλιό client-side υπολογισμό: καλύπτει το παράθυρο όπου το
    // frontend έχει βγει αλλά το migration 0010 δεν έχει τρέξει ακόμα σε κάποιο
    // backend (π.χ. standby που δεν έχει συγχρονιστεί).
    console.warn('[φόρτος] το RPC workload_stats δεν απάντησε, πέφτω σε client-side:', error);
    await fetchWorkloadStatsFallback();
  };

  // Παλιά μέθοδος — διατηρείται μόνο ως δίχτυ ασφαλείας (βλ. παραπάνω).
  const fetchWorkloadStatsFallback = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('created_at, status')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(10000);

    if (error || !data) {
      console.error('Σφάλμα φόρτου:', error);
      setLoadingWorkload(false);
      return;
    }

    // sums[jsDay][hour] = πλήθος παραγγελιών, distinctDays[jsDay] = Set ημερομηνιών
    const sums = {};
    const distinctDays = {};
    DOW_ORDER.forEach(d => { sums[d] = {}; distinctDays[d] = new Set(); for (let h = 0; h < 24; h++) sums[d][h] = 0; });

    data.forEach(o => {
      if (!o.created_at) return;
      const dt = new Date(o.created_at);
      const day = dt.getDay();
      const hour = dt.getHours();
      sums[day][hour] = (sums[day][hour] || 0) + 1;
      distinctDays[day].add(dt.toLocaleDateString('el-GR'));
    });

    const matrix = {};
    let max = 0;
    DOW_ORDER.forEach(d => {
      matrix[d] = {};
      const divisor = distinctDays[d].size || 1;
      for (let h = 0; h < 24; h++) {
        const avg = sums[d][h] / divisor;
        matrix[d][h] = avg;
        if (avg > max) max = avg;
      }
    });

    setWorkloadMatrix(matrix);
    setWorkloadMax(max);
    setLoadingWorkload(false);
  };

  // ── Μέσος χρόνος παράδοσης για ΣΗΜΕΡΑ ──
  const fetchTodayDeliveryStats = async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('orders')
      .select('accepted_at, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', startOfDay.toISOString());

    if (error || !data) return;
    setOrdersToday(data.length);
    const valid = data.filter(o => o.accepted_at && o.completed_at);
    if (valid.length === 0) { setAvgDeliveryToday(null); return; }
    const totalMins = valid.reduce((acc, o) => acc + (new Date(o.completed_at) - new Date(o.accepted_at)) / 60000, 0);
    setAvgDeliveryToday(Math.round(totalMins / valid.length));
  };

  useEffect(() => {
    fetchDrivers();
    fetchActiveOrders();
    fetchLastCompletedTimes();
    fetchWorkloadStats();
    fetchTodayDeliveryStats();

    releaseDueOrders();
    const releaseTimer = setInterval(releaseDueOrders, 15000);

    const driversChannel = supabase
      .channel('public:drivers_map_tracking')
      .on('postgres_changes', { event: '*', schema: getTenantSchema(), table: 'drivers' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setDrivers(prev => prev.filter(d => d.id !== payload.old.id));
          return;
        }

        const updatedDriver = payload.new;

        setDrivers(prevDrivers => {
          const isActive = updatedDriver.is_active;
          const hasLocation = updatedDriver.latitude !== null && updatedDriver.longitude !== null;

          const exists = prevDrivers.find(d => d.id === updatedDriver.id);

          // Εμφάνιση Toast μόνο όταν αλλάζει το is_active (Σύνδεση / Αποσύνδεση)
          if (isActive && !exists && hasLocation) {
            toast.success(`Ο διανομέας ${updatedDriver.full_name || 'Άγνωστος'} μόλις συνδέθηκε!`);
          } else if (!isActive && exists) {
            toast.info(`Ο διανομέας ${updatedDriver.full_name || 'Άγνωστος'} αποσυνδέθηκε.`);
          }

          if (isActive && hasLocation) {
            if (exists) {
              return prevDrivers.map(d =>
                d.id === updatedDriver.id
                  ? { ...d, latitude: updatedDriver.latitude, longitude: updatedDriver.longitude, full_name: updatedDriver.full_name, last_seen: updatedDriver.last_seen, battery_level: updatedDriver.battery_level }
                  : d
              );
            } else {
              return [...prevDrivers, {
                id: updatedDriver.id,
                full_name: updatedDriver.full_name,
                latitude: updatedDriver.latitude,
                longitude: updatedDriver.longitude,
                last_seen: updatedDriver.last_seen,
                battery_level: updatedDriver.battery_level
              }];
            }
          } else {
            return prevDrivers.filter(d => d.id !== updatedDriver.id);
          }
        });
      }).subscribe();

    const ordersChannel = supabase
      .channel('public:orders_map_flow')
      .on('postgres_changes', { event: '*', schema: getTenantSchema(), table: 'orders' }, (payload) => {
        fetchActiveOrders();
        fetchLastCompletedTimes();
        fetchTodayDeliveryStats();

        // ΗΧΗΤΙΚΗ ΕΙΔΟΠΟΙΗΣΗ ΓΙΑ ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ
        if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
          playAlertSound();
          toast.info("Νέα παραγγελία!");
          // Ανανέωση heatmap ώστε να "εκπαιδεύεται" με τις νέες παραγγελίες
          fetchWorkloadStats();
        }

        // Προγραμματισμένη παραγγελία που μόλις «ωρίμασε»: για τον admin είναι
        // νέα δουλειά ακριβώς όπως μια κανονική, οπότε ηχεί το ίδιο.
        //
        // Δεν συγκρίνουμε με το payload.old — το Supabase realtime στέλνει εκεί
        // ΜΟΝΟ το primary key (εκτός αν ο πίνακας έχει REPLICA IDENTITY FULL).
        // Κρατάμε λοιπόν εμείς ποιες ήταν προγραμματισμένες πριν το event.
        if (
          payload.eventType === 'UPDATE' &&
          payload.new?.status === 'pending' &&
          scheduledIdsRef.current.has(payload.new.id)
        ) {
          scheduledIdsRef.current.delete(payload.new.id);
          playAlertSound();
          toast.info("Προγραμματισμένη παραγγελία μόλις στάλθηκε!");
          fetchWorkloadStats();
        }
      }).subscribe();

    return () => {
      clearInterval(releaseTimer);
      supabase.removeChannel(driversChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  // Push στον διανομέα τη ΣΤΙΓΜΗ της ανάθεσης/μετάθεσης. Ο in-app συναγερμός
  // χτυπά μόνο με ανοιχτή εφαρμογή — ο διανομέας όμως συνήθως οδηγεί με το
  // κινητό κλειδωμένο, οπότε χρειάζεται FCM για να το ακούσει επιτόπου.
  // Αστοχία εδώ ΔΕΝ ακυρώνει την ανάθεση: η ίδια η μετακίνηση έχει ήδη γίνει.
  const notifyDriverOfAssignment = async (orderId, driverId, kind) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-assignment-notification', {
        body: { orderId, driverId, kind },
      });
      if (error) {
        console.error('[assignment push]', error);
        toast.error('Η ειδοποίηση ήχου στον διανομέα απέτυχε — ίσως δεν το αντιληφθεί μέχρι να ανοίξει την εφαρμογή.');
        return;
      }
      // Διανομέας χωρίς fcm_token: η function απαντά 200 με `skipped`, οπότε χωρίς
      // αυτόν τον έλεγχο η αποτυχία ήταν ΕΝΤΕΛΩΣ αθόρυβη — ο διαχειριστής νόμιζε
      // ότι ειδοποιήθηκε. Συμβαίνει όταν ο διανομέας δεν έχει συνδεθεί ποτέ από
      // την εφαρμογή ή αρνήθηκε την άδεια ειδοποιήσεων.
      if (data?.skipped) {
        toast.warning('Ο διανομέας δεν έχει ενεργές ειδοποιήσεις στο κινητό του — δεν θα χτυπήσει. Πρέπει να μπει στην εφαρμογή και να δώσει άδεια ειδοποιήσεων.');
      }
    } catch (e) {
      console.error('[assignment push]', e);
      toast.error('Η ειδοποίηση ήχου στον διανομέα απέτυχε — ίσως δεν το αντιληφθεί μέχρι να ανοίξει την εφαρμογή.');
    }
  };

  const assignOrderToDriver = async (orderId, driverId) => {
    if (isReadOnly()) { toast.warning("Εφεδρική λειτουργία — προσωρινά μόνο ανάγνωση."); return; }
    const { error } = await supabase
      .from('orders')
      .update({ status: 'accepted', driver_id: driverId, accepted_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      toast.error("Υπήρξε σφάλμα κατά την ανάθεση.");
    } else {
      toast.success("Η παραγγελία ανατέθηκε επιτυχώς!");
      setAssigningOrderId(null);
      notifyDriverOfAssignment(orderId, driverId, 'assign');
    }
  };

  // ── Μετάθεση παραγγελίας σε ΑΛΛΟΝ διανομέα ────────────────────────────────
  // Επιτρέπεται ΜΟΝΟ όσο η παραγγελία είναι 'accepted' (απόφαση χρήστη): πριν την
  // αποδοχή γίνεται απλή «Ανάθεση», και μετά την παράδοση δεν έχει νόημα. Το
  // `.eq('status','accepted')` το επιβάλλει και στη ΒΑΣΗ, όχι μόνο στο UI, ώστε
  // να μη γλιστρήσει μετάθεση σε παραγγελία που μόλις ολοκληρώθηκε.
  //
  const reassignOrder = async (orderId, newDriverId, newDriverName) => {
    if (isReadOnly()) { toast.warning("Εφεδρική λειτουργία — προσωρινά μόνο ανάγνωση."); return; }

    const isConfirmed = await confirmDialog(
      `Μετάθεση της παραγγελίας στον διανομέα ${newDriverName};`,
      { confirmLabel: 'Μετάθεση' }
    );
    if (!isConfirmed) return;

    // Ο διανομέας που ΤΗΝ ΕΧΕΙ ΤΩΡΑ, πριν το update τον αντικαταστήσει — χρειάζεται
    // για να ειδοποιηθεί ότι τη χάνει (βλ. κλήση 'reassign_away' παρακάτω).
    const previousDriverId = orders.find(o => o.id === orderId)?.driver_id || null;

    const { data, error } = await supabase
      .from('orders')
      .update({ driver_id: newDriverId, accepted_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'accepted')
      .select();

    if (error) {
      toast.error("Υπήρξε σφάλμα κατά τη μετάθεση.");
      console.error(error);
      return;
    }
    if (!data || data.length === 0) {
      toast.warning("Η παραγγελία δεν είναι πλέον σε κατάσταση «αποδεκτή» — η μετάθεση ακυρώθηκε.");
      fetchActiveOrders();
      return;
    }
    toast.success(`Η παραγγελία μετατέθηκε στον ${newDriverName}.`);
    setReassigningOrderId(null);
    notifyDriverOfAssignment(orderId, newDriverId, 'reassign');
    // Ο διανομέας που την ΕΧΑΝΕ πρέπει κι αυτός να ενημερωθεί με ήχο — αλλιώς θα
    // την περιμένει άδικα νομίζοντας ότι είναι ακόμα δική του.
    if (previousDriverId && previousDriverId !== newDriverId) {
      notifyDriverOfAssignment(orderId, previousDriverId, 'reassign_away');
    }
  };

  const cancelOrder = async (orderId) => {
    if (isReadOnly()) { toast.warning("Εφεδρική λειτουργία — προσωρινά μόνο ανάγνωση."); return; }
    const isConfirmed = await confirmDialog("Είστε σίγουροι ότι θέλετε να ακυρώσετε τη συγκεκριμένη παραγγελία;", { danger: true, confirmLabel: 'Ακύρωση παραγγελίας' });
    if (!isConfirmed) return;

    // Ποιος την είχε αναλάβει, ΠΡΙΝ το optimistic update τη βγάλει από τη λίστα.
    // Μόνο σε 'accepted' έχει νόημα: σε 'pending'/'scheduled' δεν την κρατά κανείς,
    // και μια ειδοποίηση «ακυρώθηκε» θα ήταν ακατανόητη.
    const cancelled = orders.find(o => o.id === orderId);
    const assignedDriverId = cancelled?.status === 'accepted' ? cancelled.driver_id : null;

    // Optimistic Update
    setOrders(prevOrders => prevOrders.filter(o => o.id !== orderId));

    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);

    if (error) {
      toast.error("Υπήρξε σφάλμα κατά την ακύρωση της παραγγελίας.");
      console.error(error);
      fetchActiveOrders(); // Revert
    } else {
      toast.success("Η παραγγελία ακυρώθηκε.");
      // Ο διανομέας μπορεί να είναι ήδη καθ' οδόν προς το κατάστημα — χωρίς push θα
      // το μάθει μόνο αν τύχει να κοιτάξει την εφαρμογή.
      if (assignedDriverId) notifyDriverOfAssignment(orderId, assignedDriverId, 'cancel');
    }
  };

  const completeOrder = async (orderId) => {
    if (isReadOnly()) { toast.warning("Εφεδρική λειτουργία — προσωρινά μόνο ανάγνωση."); return; }
    const isConfirmed = await confirmDialog("Είστε σίγουροι ότι θέλετε να ολοκληρώσετε τη συγκεκριμένη παραγγελία;", { confirmLabel: 'Ολοκλήρωση' });
    if (!isConfirmed) return;

    // Optimistic Update
    setOrders(prevOrders => prevOrders.filter(o => o.id !== orderId));

    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      toast.error("Υπήρξε σφάλμα κατά την ολοκλήρωση της παραγγελίας.");
      console.error(error);
      fetchActiveOrders(); // Revert
    } else {
      toast.success("Η παραγγελία ολοκληρώθηκε!");
      fetchLastCompletedTimes();
      fetchTodayDeliveryStats();
    }
  };

  const getElapsedTime = (createdAtString) => {
    if (!createdAtString) return '0 λ.';
    const createdTime = new Date(createdAtString).getTime();
    const diffMs = currentTime.getTime() - createdTime;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Μόλις τώρα';
    return `${diffMins} λεπτά`;
  };

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const acceptedOrders = orders.filter(o => o.status === 'accepted');
  // Προγραμματισμένες: η πιο κοντινή στην αποστολή πρώτη.
  const scheduledOrders = orders
    .filter(o => o.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0));


  const signalAgeMin = (driver) =>
    driver.last_seen ? (currentTime.getTime() - new Date(driver.last_seen).getTime()) / 60000 : Infinity;

  // Διανομείς που μετράνε ως «σε βάρδια» (ό,τι δείχνει και ο χάρτης).
  const visibleDrivers = drivers.filter(d => signalAgeMin(d) <= SIGNAL_OFFLINE_MIN);

  const backend = getActiveBackend();
  const onPrimary = backend?.name !== 'standby';

  const railCardStyle = (tint) => ({
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderLeft: `3px solid ${tint}`,
  });

  return (
    <div className="flex flex-col md:h-full font-sans" style={{ color: 'var(--text-primary)' }}>

      {/* Δυναμικό CSS για τα Map Tiles & tooltips */}
      <style>
        {`
          .custom-filtered-map .leaflet-tile-pane {
            filter: ${mapFilter};
            transition: filter 0.5s ease;
          }
          .leaflet-control-attribution {
            opacity: 0.5;
            font-size: 10px !important;
          }
          .premium-tooltip {
            background: #111111 !important;
            border: 1px solid var(--map-gold) !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.8) !important;
            padding: 8px 12px !important;
            backdrop-filter: blur(10px) !important;
          }
          .premium-tooltip::before { border-top-color: var(--map-gold) !important; }
          .premium-tooltip-busy { border-color: var(--map-green) !important; }
          .premium-tooltip-busy::before { border-top-color: var(--map-green) !important; }
          .custom-div-icon { background: transparent; border: none; }
        `}
      </style>

      {/* ════════ ΓΡΑΜΜΗ KPI (εκτός χάρτη) ════════ */}
      <div
        className="flex items-center flex-wrap gap-2 px-3 md:px-4 py-2 border-b shrink-0"
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-default)' }}
      >
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
        >
          <Bike size={14} style={{ color: visibleDrivers.length > 0 ? 'var(--success)' : 'var(--text-muted)' }} />
          <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: visibleDrivers.length > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            {visibleDrivers.length}<span className="hidden md:inline"> σε βάρδια</span>
          </span>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
        >
          <Check size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
            <span className="hidden md:inline">Ολοκληρωμένες: </span><b style={{ color: 'var(--text-primary)' }}>{ordersToday}</b>
          </span>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
        >
          <Timer size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
            <span className="hidden md:inline">Μ.Ο.: </span><b style={{ color: 'var(--text-primary)' }}>{avgDeliveryToday !== null ? `${avgDeliveryToday} λ.` : '—'}</b>
          </span>
        </div>

        <button
          onClick={() => setShowWorkload(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all"
          style={{
            backgroundColor: showWorkload ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
            border: `1px solid ${showWorkload ? 'var(--accent)' : 'var(--border-subtle)'}`,
            color: showWorkload ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          <Flame size={14} style={{ color: 'var(--accent)' }} />
          <span className="hidden md:inline text-[12px] font-bold whitespace-nowrap">Φόρτος</span>
          {showWorkload ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Κατάσταση συστήματος — σε ποιο backend τρέχουμε */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ml-auto"
          title={onPrimary ? 'Το σύστημα τρέχει στο κύριο datacenter.' : 'Το σύστημα τρέχει στο εφεδρικό datacenter (failover).'}
          style={{
            backgroundColor: onPrimary ? 'var(--success-bg)' : 'var(--warning-bg)',
            border: `1px solid ${onPrimary ? 'var(--success-border)' : 'var(--warning-border)'}`,
          }}
        >
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: onPrimary ? 'var(--success)' : 'var(--warning)' }}
          />
          <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: onPrimary ? 'var(--success)' : 'var(--warning)' }}>
            <span className="hidden sm:inline">Σύστημα: </span>{onPrimary ? 'Primary' : 'Standby'}
          </span>
        </div>
      </div>

      {/* ════════ ΠΑΝΕΛ ΦΟΡΤΟΥ (αναδιπλούμενο κάτω από τη γραμμή KPI) ════════ */}
      <AnimatePresence>
        {showWorkload && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-b shrink-0"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}
          >
            <WorkloadChart
              matrix={workloadMatrix}
              loading={loadingWorkload}
              isDark={isDark}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ ΣΩΜΑ: ΧΑΡΤΗΣ + ΔΕΞΙΑ ΣΤΗΛΗ ════════ */}
      <div className="flex flex-col md:flex-row md:flex-1 min-h-0">

        {/* ── Χάρτης (full-bleed) ── */}
        <div className="relative h-[48vh] md:h-auto md:flex-1 min-w-0 z-0">
          <MapContainer center={centerPosition} zoom={14} zoomControl={false} className="h-full w-full custom-filtered-map" style={{ background: 'var(--bg-primary)' }}>
            <MapResizeHandler />
            <MapCenterHandler center={centerPosition} />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">Carto</a>'
              url={currentTile}
            />
            <ZoomControl position="bottomleft" />

            {drivers.map(driver => {
              const driverActiveOrders = orders.filter(o => o.status === 'accepted' && o.driver_id === driver.id);
              const isBusy = driverActiveOrders.length > 0;

              // ── Φρεσκάδα σήματος: κρύβουμε μόνο όσους λείπουν πάνω από SIGNAL_OFFLINE_MIN ──
              const ageMin = signalAgeMin(driver);
              if (ageMin > SIGNAL_OFFLINE_MIN) return null; // πραγματικά εκτός → φεύγει από τον χάρτη
              const noSignal = ageMin > SIGNAL_FRESH_MIN;   // χαμένο σήμα (ασανσέρ κ.λπ.) → μένει, γκρι
              const markerColor = noSignal ? 'var(--map-offline)' : (isBusy ? 'var(--map-green)' : 'var(--map-gold)');
              const markerGlow = noSignal ? 'var(--map-glow-offline)' : (isBusy ? 'var(--map-glow-green)' : 'var(--map-glow-gold)');
              const battery = batteryVisual(driver.battery_level);

              let idleStatusHtml;

              if (isBusy) {
                idleStatusHtml = (
                  <div className="mt-1">
                    <span className="font-bold text-[var(--map-green)] block text-[10px] uppercase tracking-wider mb-1">
                      Σε διανομή ({driverActiveOrders.length}):
                    </span>
                    {driverActiveOrders.map(order => (
                      // Σταθερά ανοιχτόχρωμα (όχι text-adaptive/-light): το premium-tooltip
                      // έχει πάντα μαύρο φόντο, ανεξαρτήτως theme — σε light mode το
                      // "έξυπνο" σκούρο κείμενο του text-adaptive γινόταν σχεδόν αόρατο.
                      <div key={order.id} className="text-[11px] text-white flex items-center gap-1 mb-0.5 whitespace-nowrap">
                        <Building size={10} className="text-slate-400 shrink-0" /> <span className="truncate max-w-[80px]">{order.stores?.name}</span>
                        <span className="text-slate-400 mx-0.5">➔</span>
                        <MapPin size={10} className="text-slate-400 shrink-0" /> <span className="truncate max-w-[80px]">{order.address}</span>
                      </div>
                    ))}
                  </div>
                );
              } else {
                const lastTime = lastCompletedTimes[driver.id];
                if (lastTime) {
                  const diffMins = Math.floor((currentTime.getTime() - lastTime) / 60000);
                  idleStatusHtml = (
                    <div className={`font-bold text-[11px] mt-1.5 flex items-center gap-1 ${diffMins > 10 ? 'text-[var(--map-critical)]' : 'text-[var(--map-gold)]'}`}>
                      <AlertTriangle size={11} /> Ανενεργός: {diffMins} λ.
                    </div>
                  );
                } else {
                  idleStatusHtml = <div className="text-slate-400 italic text-[11px] mt-1.5 flex items-center gap-1"><Check size={11} /> Διαθέσιμος</div>;
                }
              }

              const markerIcon = L.divIcon({
                className: 'custom-div-icon',
                html: renderToString(
                  <div className="flex flex-col items-center" style={{ width: '90px' }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '50%', background: '#111',
                      border: `2px solid ${markerColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 0 15px ${markerGlow}`,
                      opacity: noSignal ? 0.75 : 1,
                      transition: 'all 0.3s ease'
                    }}>
                      <Bike size={18} color={markerColor} />
                    </div>
                    {/* Μόνιμη ετικέτα: μόνο όνομα, ώστε να μην αλληλοκαλύπτονται με 8+ διανομείς —
                        οι λεπτομέρειες (μπαταρία/σήμα/κατάσταση) μετακόμισαν στο hover Tooltip. */}
                    <div style={{
                      marginTop: '2px', padding: '1px 6px', borderRadius: '999px',
                      background: 'rgba(17,17,17,0.85)', color: markerColor,
                      fontSize: '10px', fontWeight: 700, lineHeight: '14px', whiteSpace: 'nowrap',
                      maxWidth: '86px', overflow: 'hidden', textOverflow: 'ellipsis',
                      border: `1px solid ${markerColor}55`,
                    }}>
                      {driver.full_name}
                    </div>
                  </div>
                ),
                iconSize: [90, 58],
                iconAnchor: [45, 19],
              });

              return driver.latitude && driver.longitude ? (
                <Marker key={driver.id} position={[driver.latitude, driver.longitude]} icon={markerIcon}>
                  <Tooltip direction="top" offset={[0, -22]} opacity={1} className={`premium-tooltip ${isBusy ? 'premium-tooltip-busy' : ''}`}>
                    <div className="leading-relaxed min-w-[120px]">
                      <div className="flex items-center gap-1.5 pb-1 mb-1 border-b border-gray-700/50">
                        <div className={`w-2 h-2 rounded-full ${!noSignal && isBusy ? 'animate-pulse' : ''}`} style={{ background: markerColor }}></div>
                        <b className="text-[13px] text-white tracking-wide">{driver.full_name}</b>
                      </div>
                      {battery && (
                        <div className="flex items-center gap-1 text-[11px] font-bold mb-0.5" style={{ color: battery.color }}>
                          <battery.Icon size={12} /> Μπαταρία: {driver.battery_level}%
                        </div>
                      )}
                      {noSignal && (
                        <div className="font-bold text-[11px] mb-0.5 flex items-center gap-1" style={{ color: 'var(--map-offline-text)' }}>
                          <AlertTriangle size={11} /> Χωρίς σήμα: {Math.floor(ageMin)} λ.
                        </div>
                      )}
                      {idleStatusHtml}
                    </div>
                  </Tooltip>
                </Marker>
              ) : null;
            })}
          </MapContainer>

          {/* Empty state πάνω στον χάρτη */}
          {visibleDrivers.length === 0 && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none px-4">
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-center"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <Bike size={15} style={{ color: 'var(--text-muted)' }} />
                Κανένας διανομέας συνδεδεμένος — η βάρδια δεν έχει ξεκινήσει.
              </div>
            </div>
          )}
        </div>

        {/* ── Δεξιά στήλη: μόνιμο πάνελ εργασίας ── */}
        <aside
          className="w-full md:w-[340px] shrink-0 border-t md:border-t-0 md:border-l md:overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-default)' }}
        >
          {/* Προγραμματισμένες (καθυστερημένη αποστολή από το κατάστημα) */}
          {scheduledOrders.length > 0 && (
            <RailSection Icon={Hourglass} title="Προγραμματισμένες" count={scheduledOrders.length} tint="var(--text-secondary)">
              <AnimatePresence>
                {scheduledOrders.map((order, idx) => {
                  const remainingMs = order.scheduled_at
                    ? new Date(order.scheduled_at).getTime() - currentTime.getTime()
                    : 0;
                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      className="rounded-lg p-2.5 mb-2 last:mb-0 text-[13px]"
                      style={railCardStyle('var(--text-muted)')}
                    >
                      <div className="flex items-center gap-1 flex-wrap leading-relaxed">
                        <OrderNumber n={idx + 1} />
                        <Building size={12} style={{ color: 'var(--text-muted)' }} />
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{order.stores?.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>➔</span>
                        <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{order.address}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <span
                          className="text-[11px] font-bold px-2 py-1 rounded-md flex items-center gap-1 tabular-nums"
                          style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}
                          title="Χρόνος μέχρι να σταλεί αυτόματα στους διανομείς"
                        >
                          <Timer size={12} /> {formatCountdown(remainingMs)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <DistanceChip order={order} />
                          <button
                            onClick={() => cancelOrder(order.id)}
                            className="py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-xs transition-all flex items-center justify-center"
                            style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}
                            title="Ακύρωση Παραγγελίας"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </RailSection>
          )}

          {/* Εκκρεμείς */}
          <RailSection Icon={Clock} title="Εκκρεμείς" count={pendingOrders.length} tint="var(--accent)">
            {pendingOrders.length === 0 ? (
              <p className="text-[12px] italic py-1.5" style={{ color: 'var(--text-muted)' }}>
                Καμία εκκρεμής — όλα καθαρά.
              </p>
            ) : (
              <AnimatePresence>
                {pendingOrders.map((order, idx) => {
                  const isLate = (currentTime.getTime() - new Date(order.created_at).getTime()) > 300000;
                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      className="rounded-lg p-2.5 mb-2 last:mb-0"
                      style={railCardStyle('var(--accent)')}
                    >
                      <div className="leading-relaxed space-y-1 text-[13px]">
                        <div className="flex items-center gap-1">
                          <OrderNumber n={idx + 1} />
                          <Building size={12} style={{ color: 'var(--text-muted)' }} />
                          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{order.stores?.name}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
                          <span style={{ color: 'var(--text-secondary)' }}>{order.address}</span>
                          <DistanceChip order={order} />
                        </div>

                        {order.comments && (
                          <div
                            className="mt-1 text-[11px] p-1.5 rounded flex items-start gap-1"
                            style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                          >
                            <MessageSquare size={12} className="mt-0.5 shrink-0" />
                            <span><b style={{ color: 'var(--accent)' }}>Σχόλια:</b> {order.comments}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span
                            className="text-[11px] font-bold flex items-center gap-1"
                            style={{ color: isLate ? 'var(--danger)' : 'var(--accent)' }}
                          >
                            <Clock size={12} /> Σε αναμονή: {getElapsedTime(order.created_at)}
                          </span>

                          <div className="flex gap-1.5">
                            <button
                              onClick={() => cancelOrder(order.id)}
                              className="py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-xs transition-all flex items-center justify-center"
                              style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}
                              title="Ακύρωση Παραγγελίας"
                            >
                              <X size={14} />
                            </button>

                            <button
                              onClick={() => setAssigningOrderId(assigningOrderId === order.id ? null : order.id)}
                              className="py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-xs transition-all"
                              style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-muted)', border: '1px solid var(--accent)' }}
                            >
                              {assigningOrderId === order.id ? 'Κλείσιμο' : 'Ανάθεση'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {assigningOrderId === order.id && (
                        <div
                          className="mt-2 p-2 rounded-lg"
                          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}
                        >
                          <p className="m-0 mb-1.5 text-xs font-bold" style={{ color: 'var(--accent)' }}>Επιλογή Διανομέα:</p>
                          {visibleDrivers.length === 0 ? (
                            <p className="text-[11px] m-0" style={{ color: 'var(--danger)' }}>Κανένας διανομέας δεν είναι online.</p>
                          ) : (
                            visibleDrivers.map(driver => {
                              const activeCount = acceptedOrders.filter(o => o.driver_id === driver.id).length;
                              let statusBadge;
                              if (activeCount > 0) {
                                statusBadge = (
                                  <span className="px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-muted)', border: '1px solid var(--accent)' }}>
                                    Κρατάει ({activeCount})
                                  </span>
                                );
                              } else {
                                const lastTime = lastCompletedTimes[driver.id];
                                const label = lastTime
                                  ? `Ελεύθερος (${Math.floor((currentTime.getTime() - lastTime) / 60000)} λ.)`
                                  : 'Ελεύθερος';
                                statusBadge = (
                                  <span className="px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
                                    {label}
                                  </span>
                                );
                              }

                              return (
                                <button
                                  key={driver.id}
                                  onClick={() => assignOrderToDriver(order.id, driver.id)}
                                  className="hover-row-glass flex justify-between items-center w-full text-left p-2 mb-1 rounded-md cursor-pointer text-xs transition-colors"
                                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                                >
                                  <span className="font-bold flex items-center gap-1"><Bike size={12} /> {driver.full_name}</span>
                                  {statusBadge}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </RailSection>

          {/* Ενεργές */}
          <RailSection Icon={Bike} title="Ενεργές" count={acceptedOrders.length} tint="var(--success)">
            {acceptedOrders.length === 0 ? (
              <p className="text-[12px] italic py-1.5" style={{ color: 'var(--text-muted)' }}>
                Καμία ενεργή διανομή αυτή τη στιγμή.
              </p>
            ) : (
              <AnimatePresence>
                {acceptedOrders.map((order, idx) => {
                  // Οι ΔΥΟ χρόνοι που ζήτησε ο πελάτης: πόση ώρα ήταν «ενεργή»
                  // (πριν την πάρει διανομέας) και πόση είναι «αποδεκτή» — ώστε να
                  // βγαίνει ο πραγματικός συνολικός χρόνος της παραγγελίας.
                  const { activeMins, acceptedMins, totalMins } = orderDurations(order, currentTime);
                  return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-lg p-2.5 mb-2 last:mb-0 text-[13px]"
                    style={railCardStyle('var(--success)')}
                  >
                    <div className="flex items-center gap-1 flex-wrap leading-relaxed">
                      <OrderNumber n={idx + 1} />
                      <Building size={12} style={{ color: 'var(--text-muted)' }} />
                      <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{order.stores?.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>➔</span>
                      <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>{order.address}</span>
                      <DistanceChip order={order} />
                      {order.picked_up_at && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                          style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                          title="Ο διανομέας έχει παραλάβει την παραγγελία από το κατάστημα"
                        >
                          <Package size={10} /> Παρελήφθη
                        </span>
                      )}
                    </div>

                    {order.comments && (
                      <div
                        className="mt-1 text-[11px] p-1.5 rounded flex items-start gap-1"
                        style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                      >
                        <MessageSquare size={12} className="mt-0.5 shrink-0" />
                        <span><b style={{ color: 'var(--accent)' }}>Σχόλια:</b> {order.comments}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <div
                        className="text-[11px] px-2 py-1 rounded-md inline-flex items-center gap-1"
                        style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                      >
                        <User size={12} /> <b>{order.drivers?.full_name}</b>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[11px] font-bold px-2 py-1 rounded-md flex items-center gap-1 tabular-nums"
                          style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-muted)', border: '1px solid var(--border-subtle)' }}
                          title={`Ενεργή ${activeMins} λ. (μέχρι την αποδοχή) + αποδεκτή ${acceptedMins} λ. = ${totalMins} λ. συνολικά`}
                        >
                          <Clock size={12} /> {activeMins}′ + {acceptedMins}′
                        </span>
                        <button
                          onClick={() => setReassigningOrderId(reassigningOrderId === order.id ? null : order.id)}
                          className="py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-sm transition-all flex items-center justify-center"
                          style={reassigningOrderId === order.id
                            ? { color: '#fff', backgroundColor: 'var(--accent)', border: '1px solid var(--accent)' }
                            : { color: 'var(--accent)', backgroundColor: 'var(--accent-muted)', border: '1px solid var(--border-subtle)' }}
                          title="Μετάθεση σε άλλον διανομέα"
                        >
                          <Repeat size={14} />
                        </button>
                        <button
                          onClick={() => completeOrder(order.id)}
                          className="py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-sm transition-all flex items-center justify-center"
                          style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                          title="Ολοκλήρωση Παραγγελίας"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-sm transition-all flex items-center justify-center"
                          style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}
                          title="Ακύρωση Παραγγελίας"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Επιλογή νέου διανομέα για μετάθεση */}
                    {reassigningOrderId === order.id && (
                      <div
                        className="mt-2 p-2 rounded-lg"
                        style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}
                      >
                        <p className="m-0 mb-1.5 text-xs font-bold" style={{ color: 'var(--accent)' }}>
                          Μετάθεση σε:
                        </p>
                        {visibleDrivers.filter(d => d.id !== order.driver_id).length === 0 ? (
                          <p className="text-[11px] m-0" style={{ color: 'var(--danger)' }}>
                            Δεν υπάρχει άλλος διανομέας online.
                          </p>
                        ) : (
                          visibleDrivers.filter(d => d.id !== order.driver_id).map(driver => {
                            const activeCount = acceptedOrders.filter(o => o.driver_id === driver.id).length;
                            return (
                              <button
                                key={driver.id}
                                onClick={() => reassignOrder(order.id, driver.id, driver.full_name)}
                                className="hover-row-glass flex justify-between items-center w-full text-left p-2 mb-1 rounded-md cursor-pointer text-xs transition-colors"
                                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                              >
                                <span className="font-bold flex items-center gap-1"><Bike size={12} /> {driver.full_name}</span>
                                <span
                                  className="px-1.5 py-0.5 rounded font-bold text-[10px]"
                                  style={activeCount > 0
                                    ? { color: 'var(--accent)', backgroundColor: 'var(--accent-muted)', border: '1px solid var(--accent)' }
                                    : { color: 'var(--success)', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                                >
                                  {activeCount > 0 ? `Κρατάει (${activeCount})` : 'Ελεύθερος'}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </RailSection>

          {/* Διανομείς */}
          <RailSection Icon={Activity} title="Διανομείς" count={visibleDrivers.length} tint="var(--text-secondary)">
            {visibleDrivers.length === 0 ? (
              <p className="text-[12px] italic py-1.5" style={{ color: 'var(--text-muted)' }}>
                Κανένας διανομέας συνδεδεμένος.
              </p>
            ) : (
              visibleDrivers.map(driver => {
                const ageMin = signalAgeMin(driver);
                const noSignal = ageMin > SIGNAL_FRESH_MIN;
                const activeCount = acceptedOrders.filter(o => o.driver_id === driver.id).length;
                const battery = batteryVisual(driver.battery_level);

                let dotColor = 'var(--accent)';
                let subText = 'Διαθέσιμος';
                let subColor = 'var(--text-muted)';

                if (noSignal) {
                  dotColor = 'var(--map-offline)';
                  subText = `Χωρίς σήμα: ${Math.floor(ageMin)} λ.`;
                  subColor = 'var(--text-muted)';
                } else if (activeCount > 0) {
                  dotColor = 'var(--success)';
                  subText = `Σε διανομή (${activeCount})`;
                  subColor = 'var(--success)';
                } else {
                  const lastTime = lastCompletedTimes[driver.id];
                  if (lastTime) {
                    const diffMins = Math.floor((currentTime.getTime() - lastTime) / 60000);
                    subText = `Ελεύθερος: ${diffMins} λ.`;
                    subColor = diffMins > 10 ? 'var(--danger)' : 'var(--text-muted)';
                  }
                }

                return (
                  <div
                    key={driver.id}
                    className="flex items-center gap-2 py-1.5 border-b last:border-b-0"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold leading-tight truncate m-0" style={{ color: 'var(--text-primary)' }}>
                        {driver.full_name}
                      </p>
                      <p className="text-[11px] leading-tight m-0 mt-0.5" style={{ color: subColor }}>{subText}</p>
                    </div>
                    {battery && (
                      <span className="flex items-center gap-1 text-[11px] font-bold shrink-0" style={{ color: battery.color }}>
                        <battery.Icon size={13} /> {driver.battery_level}%
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </RailSection>
        </aside>
      </div>
    </div>
  );
}

// ════════ Bar chart φόρτου ανά ώρα (για επιλεγμένη ημέρα) ════════
const START_HOUR = 7;  // πρωί
const END_HOUR = 23;   // η μπάρα 23:00 καλύπτει 23:00–00:00 (μεσάνυχτα)

function WorkloadChart({ matrix, loading, isDark }) {
  const todayDow = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(todayDow);

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);

  const dayData = (matrix && matrix[selectedDay]) || {};
  const dayMax = Math.max(...hours.map(h => dayData[h] || 0), 0);
  const currentHour = new Date().getHours();

  const fmt = (v) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1));

  return (
    <div className="p-3" style={{ width: 'min(82vw, 600px)' }}>
      {/* Επιλογή ημέρας */}
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-[12px] font-bold flex items-center gap-1.5" style={{ color: 'var(--map-gold)' }}>
          <Activity size={14} /> Φόρτος ανά Ώρα
        </h4>
        <span className="text-[10px]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
          εκπαιδεύεται με τα δεδομένα
        </span>
      </div>

      <div className="flex gap-1 mb-3">
        {DOW_ORDER.map(day => {
          const isSel = day === selectedDay;
          const isToday = day === todayDow;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className="flex-1 py-1 rounded-lg text-[11px] font-bold transition-all relative"
              style={{
                background: isSel ? 'linear-gradient(135deg, var(--map-gold), var(--map-gold-deep))' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                color: isSel ? '#111' : (isDark ? '#cbd5e1' : '#334155'),
                border: isToday && !isSel ? '1px solid var(--map-gold)' : '1px solid transparent',
              }}
              title={DOW_FULL[day] + (isToday ? ' (Σήμερα)' : '')}
            >
              {DOW_LABELS[day]}
            </button>
          );
        })}
      </div>

      {/* Τίτλος ημέρας */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[15px] font-bold" style={{ color: isDark ? '#f1f5f9' : '#1e293b' }}>
          {DOW_FULL[selectedDay]}
        </span>
        {selectedDay === todayDow && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--map-tint-green)', color: 'var(--map-green-deep)' }}>
            Σήμερα
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-[12px]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
          Φόρτωση δεδομένων…
        </div>
      ) : !matrix || dayMax === 0 ? (
        <div className="py-10 text-center text-[12px]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
          Δεν υπάρχουν ακόμη αρκετά δεδομένα για {DOW_FULL[selectedDay]}.
        </div>
      ) : (
        <div className="flex items-end justify-between gap-[3px]" style={{ height: 150 }}>
          {hours.map(h => {
            const val = dayData[h] || 0;
            const pct = dayMax > 0 ? (val / dayMax) * 100 : 0;
            const isNow = selectedDay === todayDow && h === currentHour;
            return (
              <div
                key={h}
                className="flex-1 flex flex-col items-center justify-end h-full group"
                title={`${DOW_FULL[selectedDay]} ${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00 · μ.ό. ${fmt(val)} παραγγελίες`}
              >
                {/* Τιμή πάνω από τη μπάρα */}
                <span
                  className="text-[8px] font-bold mb-0.5 transition-opacity"
                  style={{ color: isNow ? 'var(--map-green)' : (isDark ? '#cbd5e1' : '#475569'), opacity: val > 0 ? 1 : 0.3 }}
                >
                  {val > 0 ? fmt(val) : ''}
                </span>
                {/* Μπάρα */}
                <div
                  className="w-full rounded-t-[3px] transition-all duration-300"
                  style={{
                    height: `${Math.max(pct, val > 0 ? 4 : 0)}%`,
                    minHeight: val > 0 ? 3 : 0,
                    background: isNow
                      ? 'linear-gradient(180deg, var(--map-green), var(--map-green-deep))'
                      : 'linear-gradient(180deg, var(--map-gold-light), var(--map-gold))',
                    boxShadow: isNow ? '0 0 8px var(--map-glow-green-soft)' : 'none',
                  }}
                />
                {/* Ώρα */}
                <span
                  className="text-[8px] mt-1"
                  style={{ color: isNow ? 'var(--map-green)' : (isDark ? '#64748b' : '#94a3b8'), fontWeight: isNow ? 700 : 400 }}
                >
                  {h}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
