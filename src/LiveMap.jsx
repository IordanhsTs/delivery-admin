import React, { useState, useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, Tooltip, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from './supabaseClient';
import { useTheme } from './ThemeContext.jsx';
import { Building, MapPin, AlertTriangle, Bike, Search, MessageSquare, Clock, X, Check, User, Activity, ChevronUp, ChevronDown, Timer, Flame, BatteryWarning, BatteryLow, BatteryMedium, BatteryFull } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// Tile layer URLs
const TILES = {
  // Επαναφορά στους Carto μέχρι να βάλουμε το επίσημο Google Maps API
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
};

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Ήχος ειδοποίησης (ορίζεται μία φορά εκτός component για επαναχρησιμοποίηση)
const alertSound = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');

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
  if (level <= 15) return { Icon: BatteryWarning, color: '#ff4b4b' };
  if (level <= 40) return { Icon: BatteryLow, color: '#F59E0B' };
  if (level <= 75) return { Icon: BatteryMedium, color: '#C5A066' };
  return { Icon: BatteryFull, color: '#38EF7D' };
};

export default function LiveMap() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const currentTile = TILES[theme] || TILES.dark;

  const mapFilter = 'none';
  const [drivers, setDrivers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [assigningOrderId, setAssigningOrderId] = useState(null);
  const [lastCompletedTimes, setLastCompletedTimes] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  // ── Overlay visibility (αναδυόμενα) ──
  const [showPending, setShowPending] = useState(false);
  const [showAccepted, setShowAccepted] = useState(false);
  const [showWorkload, setShowWorkload] = useState(false);
  const [autoOpenPending, setAutoOpenPending] = useState(false);

  // ── Στατιστικά φόρτου / χρόνου ──
  const [workloadMatrix, setWorkloadMatrix] = useState(null); // { [jsDay]: { [hour]: avg } }
  const [workloadMax, setWorkloadMax] = useState(0);
  const [avgDeliveryToday, setAvgDeliveryToday] = useState(null);
  const [ordersToday, setOrdersToday] = useState(0);
  const [loadingWorkload, setLoadingWorkload] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

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
      .select(`id, address, comments, status, driver_id, created_at, stores ( name ), drivers ( full_name )`)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    if (error) console.error("Σφάλμα παραγγελιών:", error);
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

    const driversChannel = supabase
      .channel('public:drivers_map_tracking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, (payload) => {
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        fetchActiveOrders();
        fetchLastCompletedTimes();
        fetchTodayDeliveryStats();

        // ΗΧΗΤΙΚΗ ΕΙΔΟΠΟΙΗΣΗ ΓΙΑ ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ
        if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
          alertSound.currentTime = 0; // Επαναφορά στην αρχή του ήχου
          alertSound.play().catch(e => console.log('Το αυτόματο play μπλοκαρίστηκε από τον browser:', e));
          toast.info("Νέα παραγγελία!");
          // Αυτόματο άνοιγμα του πάνελ εκκρεμών (όταν ενημερωθεί το state)
          setAutoOpenPending(true);
          // Ανανέωση heatmap ώστε να "εκπαιδεύεται" με τις νέες παραγγελίες
          fetchWorkloadStats();
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(driversChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  const assignOrderToDriver = async (orderId, driverId) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'accepted', driver_id: driverId, accepted_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      toast.error("Υπήρξε σφάλμα κατά την ανάθεση.");
    } else {
      toast.success("Η παραγγελία ανατέθηκε επιτυχώς!");
      setAssigningOrderId(null);
    }
  };

  const cancelOrder = async (orderId) => {
    const isConfirmed = window.confirm("Είστε σίγουροι ότι θέλετε να ακυρώσετε τη συγκεκριμένη παραγγελία;");
    if (!isConfirmed) return;

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
    }
  };

  const completeOrder = async (orderId) => {
    const isConfirmed = window.confirm("Είστε σίγουροι ότι θέλετε να ολοκληρώσετε τη συγκεκριμένη παραγγελία;");
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
  const centerPosition = [40.7819, 21.4098];

  // ── Κενό πάνελ να μην μένει ανοιχτό ──
  useEffect(() => {
    if (pendingOrders.length === 0 && showPending) setShowPending(false);
  }, [pendingOrders.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (acceptedOrders.length === 0 && showAccepted) setShowAccepted(false);
  }, [acceptedOrders.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Αυτόματο άνοιγμα εκκρεμών μόλις φτάσει η νέα παραγγελία στο state ──
  useEffect(() => {
    if (autoOpenPending && pendingOrders.length > 0) {
      setShowPending(true);
      setAutoOpenPending(false);
    }
  }, [pendingOrders.length, autoOpenPending]);

  // ── Guarded toggles (δεν ανοίγουν άδειο πάνελ) ──
  const togglePending = () => { if (pendingOrders.length > 0) setShowPending(v => !v); };
  const toggleAccepted = () => { if (acceptedOrders.length > 0) setShowAccepted(v => !v); };

  // ── Panel chrome helpers ──
  const panelBg = isDark ? 'rgba(18,18,18,0.62)' : 'rgba(255,255,255,0.68)';
  const panelBorder = isDark ? 'rgba(197,160,102,0.3)' : 'rgba(197,160,102,0.4)';

  return (
    <div className="font-sans" style={{ color: 'var(--text-primary)' }}>

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
            border: 1px solid #C5A066 !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.8) !important;
            padding: 8px 12px !important;
            backdrop-filter: blur(10px) !important;
          }
          .premium-tooltip::before { border-top-color: #C5A066 !important; }
          .premium-tooltip-busy { border-color: #38EF7D !important; }
          .premium-tooltip-busy::before { border-top-color: #38EF7D !important; }
          .custom-div-icon { background: transparent; border: none; }
          .overlay-scroll::-webkit-scrollbar { width: 6px; }
          .overlay-scroll::-webkit-scrollbar-thumb { background: rgba(197,160,102,0.4); border-radius: 3px; }
        `}
      </style>

      {/* ════════ ΧΑΡΤΗΣ ΠΛΗΡΟΥΣ ΟΘΟΝΗΣ ════════ */}
      <div
        className="relative w-full rounded-2xl overflow-hidden z-0 h-[72vh] md:h-[calc(100vh-4rem)]"
        style={{
          border: `2px solid ${isDark ? 'rgba(197,160,102,0.65)' : 'rgba(197,160,102,0.5)'}`,
          boxShadow: isDark
            ? '0 0 0 1px rgba(197,160,102,0.25), 0 8px 30px rgba(0,0,0,0.6)'
            : 'var(--shadow-md)',
        }}
      >
        <MapContainer center={centerPosition} zoom={14} zoomControl={false} className="h-full w-full custom-filtered-map" style={{ background: theme === 'dark' ? '#0d0d0d' : '#f8f5f0' }}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">Carto</a>'
            url={currentTile}
          />
          {/* Zoom controls κάτω-αριστερά ώστε να μην επικαλύπτονται από τα overlays */}
          <ZoomControl position="bottomleft" />

          {drivers.map(driver => {
            const driverActiveOrders = orders.filter(o => o.status === 'accepted' && o.driver_id === driver.id);
            const isBusy = driverActiveOrders.length > 0;

            // ── Φρεσκάδα σήματος: κρύβουμε μόνο όσους λείπουν πάνω από SIGNAL_OFFLINE_MIN ──
            const ageMin = driver.last_seen
              ? (currentTime.getTime() - new Date(driver.last_seen).getTime()) / 60000
              : Infinity;
            if (ageMin > SIGNAL_OFFLINE_MIN) return null; // πραγματικά εκτός → φεύγει από τον χάρτη
            const noSignal = ageMin > SIGNAL_FRESH_MIN;   // χαμένο σήμα (ασανσέρ κ.λπ.) → μένει, γκρι
            const markerColor = noSignal ? '#8892A0' : (isBusy ? '#38EF7D' : '#C5A066');
            const markerGlow = noSignal ? 'rgba(136,146,160,0.5)' : (isBusy ? 'rgba(56,239,125,0.6)' : 'rgba(197,160,102,0.6)');
            const battery = batteryVisual(driver.battery_level);

            let idleStatusHtml;

            if (isBusy) {
              idleStatusHtml = (
                <div className="mt-1">
                  <span className="font-bold text-[#38EF7D] block text-[10px] uppercase tracking-wider mb-1">
                    Σε διανομή ({driverActiveOrders.length}):
                  </span>
                  {driverActiveOrders.map(order => (
                    <div key={order.id} className="text-[11px] text-adaptive-light flex items-center gap-1 mb-0.5 whitespace-nowrap">
                      <Building size={10} className="text-slate-400 shrink-0" /> <span className="truncate max-w-[80px]">{order.stores?.name}</span>
                      <span className="text-adaptive mx-0.5">➔</span>
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
                  <div className={`font-bold text-[11px] mt-1.5 flex items-center gap-1 ${diffMins > 10 ? 'text-[#ff4b4b]' : 'text-[#C5A066]'}`}>
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
              ),
              iconSize: [38, 38],
              iconAnchor: [19, 19],
            });

            return driver.latitude && driver.longitude ? (
              <Marker key={driver.id} position={[driver.latitude, driver.longitude]} icon={markerIcon}>
                <Tooltip permanent direction="top" offset={[0, -22]} opacity={1} className={`premium-tooltip ${isBusy ? 'premium-tooltip-busy' : ''}`}>
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
                      <div className="font-bold text-[11px] mb-0.5 flex items-center gap-1" style={{ color: '#B0B7C3' }}>
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

        {/* ════════ OVERLAYS ════════ */}

        {/* ════════ OVERLAYS (ενιαία responsive διάταξη — wrap στο κινητό) ════════ */}
        <div className="absolute top-3 left-3 right-3 z-[1100] flex flex-col gap-2 pointer-events-none">
          {/* Γραμμή κουμπιών — αναδιπλώνεται στο κινητό */}
          <div className="flex flex-wrap items-start gap-2">
            {/* Κουμπί φόρτου εργασίας */}
            <button
              onClick={() => setShowWorkload(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-xl shadow-lg transition-all pointer-events-auto"
              style={{
                background: showWorkload ? 'linear-gradient(135deg,#C5A066,#a8843f)' : panelBg,
                border: `1px solid ${panelBorder}`,
                color: showWorkload ? '#111' : (isDark ? '#e2e8f0' : '#1e293b'),
              }}
            >
              <span className="flex items-center gap-1.5 text-[12px] font-bold">
                <Flame size={15} className={showWorkload ? 'text-[#111]' : 'text-[#C5A066]'} />
                <span className="hidden sm:inline">Φόρτος Εργασίας</span>
                <span className="sm:hidden">Φόρτος</span>
              </span>
              {showWorkload ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            <div
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl backdrop-blur-xl shadow-lg pointer-events-auto"
              style={{ background: panelBg, border: `1px solid ${panelBorder}` }}
            >
              <Check size={14} className="text-[#C5A066]" />
              <span className="text-[11px] font-bold text-[#C5A066] whitespace-nowrap">
                Ολοκληρ.: {ordersToday}
              </span>
            </div>

            <div
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl backdrop-blur-xl shadow-lg pointer-events-auto"
              style={{ background: panelBg, border: `1px solid ${panelBorder}` }}
            >
              <Timer size={14} className="text-[#38EF7D]" />
              <span className="text-[11px] font-bold text-[#38EF7D] whitespace-nowrap">
                Μ.Ο.: {avgDeliveryToday !== null ? `${avgDeliveryToday} λ.` : '—'}
              </span>
            </div>

            {/* Κουμπιά Εκκρεμείς / Ενεργές — δεξιά σε desktop */}
            <div className="flex gap-2 md:ml-auto">
              <button
                onClick={togglePending}
                disabled={pendingOrders.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-xl shadow-lg transition-all pointer-events-auto"
                style={{
                  background: showPending ? 'linear-gradient(135deg,#C5A066,#a8843f)' : panelBg,
                  border: `1px solid ${panelBorder}`,
                  color: showPending ? '#111' : (isDark ? '#e2e8f0' : '#1e293b'),
                  opacity: pendingOrders.length === 0 ? 0.5 : 1,
                  cursor: pendingOrders.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <Search size={14} className={showPending ? 'text-[#111]' : 'text-[#C5A066]'} />
                <span className="text-[12px] font-bold">Εκκρεμείς</span>
                <span className="text-[11px] font-bold px-1.5 rounded-full" style={{ background: showPending ? 'rgba(0,0,0,0.15)' : 'rgba(197,160,102,0.15)', color: showPending ? '#111' : '#C5A066' }}>
                  {pendingOrders.length}
                </span>
              </button>

              <button
                onClick={toggleAccepted}
                disabled={acceptedOrders.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-xl shadow-lg transition-all pointer-events-auto"
                style={{
                  background: showAccepted ? 'linear-gradient(135deg,#38EF7D,#16a34a)' : panelBg,
                  border: `1px solid ${showAccepted ? 'rgba(56,239,125,0.6)' : panelBorder}`,
                  color: showAccepted ? '#062b15' : (isDark ? '#e2e8f0' : '#1e293b'),
                  opacity: acceptedOrders.length === 0 ? 0.5 : 1,
                  cursor: acceptedOrders.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <Bike size={14} className={showAccepted ? 'text-[#062b15]' : 'text-[#38EF7D]'} />
                <span className="text-[12px] font-bold">Ενεργές</span>
                <span className="text-[11px] font-bold px-1.5 rounded-full" style={{ background: showAccepted ? 'rgba(0,0,0,0.15)' : 'rgba(56,239,125,0.15)', color: showAccepted ? '#062b15' : '#38EF7D' }}>
                  {acceptedOrders.length}
                </span>
              </button>
            </div>
          </div>

          {/* Πάνελ — Φόρτος (αριστερά σε desktop) · Παραγγελίες (δεξιά) */}
          <div className="flex flex-col md:flex-row md:items-start gap-2">
            {/* Φόρτος εργασίας */}
            <AnimatePresence>
              {showWorkload && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="rounded-xl backdrop-blur-xl shadow-2xl overflow-hidden pointer-events-auto self-start"
                  style={{ background: panelBg, border: `1px solid ${panelBorder}` }}
                >
                  <WorkloadChart
                    matrix={workloadMatrix}
                    loading={loadingWorkload}
                    isDark={isDark}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Στήλη Παραγγελιών (Εκκρεμείς/Ενεργές) */}
            <div className="flex flex-col gap-2 w-full md:w-[340px] md:ml-auto">

              {/* Πάνελ Εκκρεμών */}
          <AnimatePresence>
            {showPending && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="w-full rounded-2xl backdrop-blur-xl shadow-2xl p-3 overlay-scroll pointer-events-auto"
                style={{ background: panelBg, border: `1px solid ${panelBorder}`, borderLeft: '4px solid #C5A066', maxHeight: '42vh', overflowY: 'auto' }}
              >
                {pendingOrders.length === 0 ? (
                  <p className={`${isDark ? 'text-slate-400' : 'text-slate-400'} italic text-sm text-center py-3`}>Δεν υπάρχουν εκκρεμείς παραγγελίες.</p>
                ) : (
                  <AnimatePresence>
                    {pendingOrders.map(order => {
                      const isLate = (currentTime.getTime() - new Date(order.created_at).getTime()) > 300000;
                      return (
                        <motion.div
                          key={order.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="py-2.5 border-b border-[#C5A066]/10 last:border-0"
                        >
                          <div className="flex justify-between items-start flex-wrap gap-2.5">
                            <div className={`${isDark ? 'text-adaptive-light' : 'text-slate-700'} leading-relaxed flex-1 space-y-1 text-[13px]`}>
                              <div className="flex items-center gap-1"><Building size={12} /> <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{order.stores?.name}</span></div>
                              <div className="flex items-center gap-1"><MapPin size={12} /> <span className={`${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{order.address}</span></div>

                              {order.comments && (
                                <div className={`mt-1 text-[11px] ${isDark ? 'text-adaptive-light bg-[#C5A066]/5' : 'text-slate-700 bg-[#C5A066]/10'} border border-[#C5A066]/20 p-1.5 rounded flex items-start gap-1`}>
                                  <MessageSquare size={12} className="mt-0.5 shrink-0" /> <span><b className="text-[#C5A066]">Σχόλια:</b> {order.comments}</span>
                                </div>
                              )}

                              <span className={`text-[11px] font-bold flex items-center gap-1 mt-1 ${isLate ? 'text-[#9D4EDD] drop-shadow-[0_0_3px_rgba(157,78,221,0.5)]' : 'text-[#C5A066]'}`}>
                                <Clock size={12} /> Σε αναμονή: {getElapsedTime(order.created_at)}
                              </span>
                            </div>

                            <div className="flex gap-2 mt-1 md:mt-0">
                              <button
                                onClick={() => cancelOrder(order.id)}
                                className={`${isDark ? 'bg-[#050505] text-[#9D4EDD]' : 'bg-[#FDF2F8] text-[#D946EF]'} hover:shadow-[inset_0_0_10px_rgba(157,78,221,0.4)] border border-[#9D4EDD]/40 py-2 px-3 rounded-lg cursor-pointer font-bold text-xs transition-all flex items-center justify-center`}
                                title="Ακύρωση Παραγγελίας"
                              >
                                <X size={14} />
                              </button>

                              <button
                                onClick={() => setAssigningOrderId(assigningOrderId === order.id ? null : order.id)}
                                className={`${isDark ? 'bg-[#050505] text-[#C5A066]' : 'bg-[#FFFBEB] text-[#B45309]'} border border-[#C5A066]/50 hover:shadow-[inset_0_0_10px_rgba(197,160,102,0.4)] py-2 px-3 rounded-lg cursor-pointer font-bold text-xs shadow-[0_0_8px_rgba(197,160,102,0.1)] transition-all`}
                              >
                                {assigningOrderId === order.id ? 'Κλείσιμο' : 'Ανάθεση'}
                              </button>
                            </div>
                          </div>

                          {assigningOrderId === order.id && (
                            <div className={`mt-2.5 p-2.5 ${isDark ? 'bg-[#111111]' : 'bg-[#F8F9FA]'} rounded-lg border border-[#C5A066]/30`}>
                              <p className="m-0 mb-2 text-xs font-bold text-[#C5A066]">Επιλογή Διανομέα:</p>
                              {drivers.length === 0 ? (
                                <p className="text-[#9D4EDD] text-[11px] m-0">Κανένας διανομέας δεν είναι online.</p>
                              ) : (
                                drivers.map(driver => {
                                  const activeCount = acceptedOrders.filter(o => o.driver_id === driver.id).length;
                                  let statusBadge;
                                  if (activeCount > 0) {
                                    statusBadge = <span className="bg-[#C5A066]/10 text-[#C5A066] border border-[#C5A066]/30 px-1.5 py-0.5 rounded font-bold text-[10px]">Κρατάει ({activeCount})</span>;
                                  } else {
                                    const lastTime = lastCompletedTimes[driver.id];
                                    if (lastTime) {
                                      const diffMins = Math.floor((currentTime.getTime() - lastTime) / 60000);
                                      statusBadge = <span className="bg-[#38EF7D]/10 text-[#38EF7D] border border-[#38EF7D]/30 px-1.5 py-0.5 rounded font-bold text-[10px]">Ελεύθερος ({diffMins} λ.)</span>;
                                    } else {
                                      statusBadge = <span className="bg-[#38EF7D]/10 text-[#38EF7D] border border-[#38EF7D]/30 px-1.5 py-0.5 rounded font-bold text-[10px]">Ελεύθερος</span>;
                                    }
                                  }

                                  return (
                                    <button
                                      key={driver.id}
                                      onClick={() => assignOrderToDriver(order.id, driver.id)}
                                      className={`flex justify-between items-center w-full text-left p-2 mb-1 ${isDark ? 'bg-[#181818] hover:bg-[#252525] text-slate-200' : 'bg-white hover:bg-gray-50 text-slate-800'} border border-[#C5A066]/30 rounded-md cursor-pointer text-xs transition-colors`}
                                    >
                                      <span className="font-bold flex items-center gap-1"><Bike size={12} /> <span className={`${isDark ? 'text-adaptive-light' : 'text-slate-700'}`}>{driver.full_name}</span></span>
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* Πάνελ Ενεργών */}
          <AnimatePresence>
            {showAccepted && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="w-full rounded-2xl backdrop-blur-xl shadow-2xl p-3 overlay-scroll pointer-events-auto"
                style={{ background: panelBg, border: `1px solid ${panelBorder}`, borderLeft: '4px solid #38EF7D', maxHeight: '42vh', overflowY: 'auto' }}
              >
                {acceptedOrders.length === 0 ? (
                  <p className={`${isDark ? 'text-slate-400' : 'text-slate-400'} italic text-sm text-center py-3`}>Δεν υπάρχουν ενεργές διανομές αυτή τη στιγμή.</p>
                ) : (
                  <AnimatePresence>
                    {acceptedOrders.map(order => (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="py-2.5 border-b border-[#C5A066]/10 last:border-0 flex justify-between items-start flex-wrap gap-2 text-[13px]"
                      >
                        <div className={`${isDark ? 'text-adaptive-light' : 'text-slate-700'} leading-relaxed flex-1`}>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Building size={12} /> <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{order.stores?.name}</span> ➔ <MapPin size={12} /> <span className={`${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{order.address}</span>
                          </div>

                          {order.comments && (
                            <div className={`mt-1 text-[11px] ${isDark ? 'text-adaptive-light bg-[#C5A066]/5' : 'text-slate-700 bg-[#C5A066]/10'} border border-[#C5A066]/20 p-1.5 rounded flex items-start gap-1`}>
                              <MessageSquare size={12} className="mt-0.5 shrink-0" /> <span><b className="text-[#C5A066]">Σχόλια:</b> {order.comments}</span>
                            </div>
                          )}

                          <div className="mt-1 text-[11px] text-[#38EF7D] bg-[#38EF7D]/5 px-2 py-1 rounded-md inline-flex items-center gap-1 border border-[#38EF7D]/20">
                            <User size={12} /> Οδηγός: <b className="text-[#38EF7D]">{order.drivers?.full_name}</b>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end gap-1">
                          <span className="text-[11px] font-bold text-[#C5A066] bg-[#C5A066]/10 border border-[#C5A066]/20 px-2 py-1 rounded-md flex items-center gap-1">
                            <Clock size={12} /> {getElapsedTime(order.created_at)}
                          </span>
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => completeOrder(order.id)}
                              className={`${isDark ? 'bg-[#050505] text-[#38EF7D]' : 'bg-[#ECFDF5] text-[#059669]'} hover:shadow-[inset_0_0_10px_rgba(56,239,125,0.4)] border border-[#38EF7D]/40 py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-sm transition-all flex items-center justify-center`}
                              title="Ολοκλήρωση Παραγγελίας"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => cancelOrder(order.id)}
                              className={`${isDark ? 'bg-[#050505] text-[#9D4EDD]' : 'bg-[#FDF2F8] text-[#D946EF]'} hover:shadow-[inset_0_0_10px_rgba(157,78,221,0.4)] border border-[#9D4EDD]/40 py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-sm transition-all flex items-center justify-center`}
                              title="Ακύρωση Παραγγελίας"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </motion.div>
            )}
          </AnimatePresence>
            </div>
          </div>
        </div>

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
        <h4 className="text-[12px] font-bold flex items-center gap-1.5" style={{ color: '#C5A066' }}>
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
                background: isSel ? 'linear-gradient(135deg,#C5A066,#a8843f)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                color: isSel ? '#111' : (isDark ? '#cbd5e1' : '#334155'),
                border: isToday && !isSel ? '1px solid #C5A066' : '1px solid transparent',
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
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,239,125,0.15)', color: '#16a34a' }}>
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
                  style={{ color: isNow ? '#38EF7D' : (isDark ? '#cbd5e1' : '#475569'), opacity: val > 0 ? 1 : 0.3 }}
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
                      ? 'linear-gradient(180deg,#38EF7D,#16a34a)'
                      : 'linear-gradient(180deg,#D9B877,#C5A066)',
                    boxShadow: isNow ? '0 0 8px rgba(56,239,125,0.5)' : 'none',
                  }}
                />
                {/* Ώρα */}
                <span
                  className="text-[8px] mt-1"
                  style={{ color: isNow ? '#38EF7D' : (isDark ? '#64748b' : '#94a3b8'), fontWeight: isNow ? 700 : 400 }}
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
