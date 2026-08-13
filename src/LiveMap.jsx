import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { APIProvider, Map, useMap, ControlPosition } from '@vis.gl/react-google-maps';
import { supabase, getTenantSchema, isReadOnly } from './supabaseClient';
import { pushFailureReason } from './pushErrors';
import { useTheme } from './ThemeContext.jsx';
import { Building, MapPin, AlertTriangle, Bike, MessageSquare, Clock, X, Check, CheckCircle2, User, Users, ChevronDown, Timer, Flame, TrendingUp, BatteryWarning, BatteryLow, BatteryMedium, BatteryFull, Route, Repeat, Hourglass, Package, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from './ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { formatKm, formatEuro, formatCountdown, orderDurations } from './distance';
import { DARK_MAP_STYLE } from './mapDarkStyle';

// Client feedback 08/13: μετάβαση από Carto/Leaflet σε Google Maps — το native
// JSON styling επιτρέπει πραγματικά σκούρο χάρτη (dark_all σκότωνε ελληνικά
// ονόματα δρόμων), κάτι που ο δωρεάν Voyager raster δεν πρόσφερε. Το key ζει
// στο VITE_GOOGLE_MAPS_KEY (.env.local τοπικά, Vercel Production env var εκεί).
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
const FLORINA_DEFAULT = { lat: 40.7819, lng: 21.4098 };

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
// Οι τιμές του matrix είναι μέσοι όροι, άρα δεκαδικοί. Κάτω από 10 το δεκαδικό
// μετράει (0.4 vs 0.9 παραγγελίες την ώρα), από 10 και πάνω είναι θόρυβος.
const fmtLoad = (v) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1));

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

// Η Google δεν ξαναδιατάσσει μόνη της όταν αλλάζει το μέγεθος του container
// (π.χ. άνοιγμα του πάνελ φόρτου) — στέλνουμε το 'resize' event εμείς.
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const ro = new ResizeObserver(() => {
      window.google.maps.event.trigger(map, 'resize');
    });
    ro.observe(map.getDiv());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

// MULTI-TENANT: recenter όταν φτάσει το map_center της εταιρίας. Το `center` αλλάζει
// μόνο μία φορά (default → fetched) κατά τη φόρτωση, οπότε δεν παλεύει με τον χρήστη.
function MapCenterHandler({ center }) {
  const map = useMap();
  const key = center ? `${center.lat},${center.lng}` : '';
  useEffect(() => {
    if (map && center) map.setCenter(center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

// «Προβολή στο χάρτη»: κεντράρει τον χάρτη στον διανομέα που διάλεξε ο χρήστης.
// Το `target` αλλάζει ταυτότητα σε κάθε κλικ (κρατά timestamp), ώστε να δουλεύει
// και δεύτερο κλικ στον ίδιο διανομέα αφού ο χρήστης μετακινήσει τον χάρτη.
//
// Client feedback 08/14: το πρώτο πέρασμα έκανε panTo+setZoom μαζί — αλλά η
// Google ακυρώνει το ομαλό pan όταν το zoom αλλάζει ταυτόχρονα (instant jump
// αντί για «ταξίδι»). Λύση: χειροκίνητο tween με moveCamera + requestAnimationFrame
// (το επίσημο μοτίβο της Google για custom camera animation), ίδια αίσθηση με
// το παλιό Leaflet flyTo (0.8s, ease-out).
function MapFocusHandler({ target }) {
  const map = useMap();
  const rafRef = useRef(null);

  useEffect(() => {
    if (!map || !target) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const fromCenter = map.getCenter();
    const fromLat = fromCenter.lat();
    const fromLng = fromCenter.lng();
    const fromZoom = map.getZoom();
    const toZoom = Math.max(fromZoom, 16);
    const duration = 800;
    const start = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const e = easeOutCubic(t);
      map.moveCamera({
        center: {
          lat: fromLat + (target.lat - fromLat) * e,
          lng: fromLng + (target.lng - fromLng) * e,
        },
        zoom: fromZoom + (toZoom - fromZoom) * e,
      });
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [map, target]);

  return null;
}

// ── Δείκτης διανομέα ως πραγματικό DOM/React μέσω custom OverlayView ────────
// Αντικαθιστά το παλιό L.divIcon (στατικό HTML string μέσω renderToString): εδώ
// το περιεχόμενο είναι ζωντανό React, τοποθετημένο στις σωστές συντεταγμένες με
// OverlayView.draw() + createPortal. Σκόπιμα ΟΧΙ AdvancedMarker — απαιτεί
// cloud-configured Map ID, οπότε το δικό μας inline DARK_MAP_STYLE θα αγνοούνταν.
function DriverMarkerOverlay({ map, position, children }) {
  const [container] = useState(() => {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    return div;
  });
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google?.maps) return undefined;
    class Overlay extends window.google.maps.OverlayView {
      onAdd() {
        this.getPanes().overlayMouseTarget.appendChild(container);
      }
      draw() {
        const proj = this.getProjection();
        const point = proj && proj.fromLatLngToDivPixel(
          new window.google.maps.LatLng(position.lat, position.lng)
        );
        if (point) {
          container.style.left = `${point.x}px`;
          container.style.top = `${point.y}px`;
        }
      }
      onRemove() {
        container.parentNode?.removeChild(container);
      }
    }
    const overlay = new Overlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    return () => overlay.setMap(null);
  }, [map, container]);

  // Το draw() του OverlayView τρέχει μόνο σε pan/zoom/resize του χάρτη — αν
  // αλλάξουν οι συντεταγμένες του διανομέα (νέο GPS σήμα) χωρίς να κινηθεί ο
  // χάρτης, πρέπει να ζητήσουμε ρητά επανασχεδίαση.
  useEffect(() => {
    overlayRef.current?.draw();
  }, [position.lat, position.lng]);

  return createPortal(children, container);
}

// ── Στρώση δεικτών διανομέα πάνω στον χάρτη ─────────────────────────────────
// Χρειάζεται useMap() για το πραγματικό google.maps.Map instance, άρα ζει ως
// child του <Map> (ίδιο pattern με MapResizeHandler/MapCenterHandler). Ίδια
// λογική χρωμάτων/tooltip με πριν (busy/idle/no-signal/battery) — άλλαξε μόνο
// ο μηχανισμός τοποθέτησης (OverlayView αντί για L.divIcon).
function DriverMarkersLayer({ drivers, orders, currentTime, lastCompletedTimes }) {
  const map = useMap();
  if (!map) return null;

  return drivers.map(driver => {
    if (!driver.latitude || !driver.longitude) return null;

    const driverActiveOrders = orders.filter(o => o.status === 'accepted' && o.driver_id === driver.id);
    const isBusy = driverActiveOrders.length > 0;

    const ageMin = driver.last_seen
      ? (currentTime.getTime() - new Date(driver.last_seen).getTime()) / 60000
      : Infinity;
    if (ageMin > SIGNAL_OFFLINE_MIN) return null; // πραγματικά εκτός → φεύγει από τον χάρτη
    const noSignal = ageMin > SIGNAL_FRESH_MIN;    // χαμένο σήμα (ασανσέρ κ.λπ.) → μένει, γκρι
    const markerColor = noSignal ? 'var(--map-offline)' : (isBusy ? 'var(--map-green)' : 'var(--map-gold)');
    const markerGlow = noSignal ? 'var(--map-glow-offline)' : (isBusy ? 'var(--map-glow-green)' : 'var(--map-glow-gold)');
    const battery = batteryVisual(driver.battery_level);
    const tooltipAccent = isBusy ? 'var(--map-green)' : 'var(--map-gold)';

    let idleStatusHtml;
    if (isBusy) {
      idleStatusHtml = (
        <div className="mt-1">
          <span className="font-bold text-[var(--map-green)] block text-[10px] uppercase tracking-wider mb-1">
            Σε διανομή ({driverActiveOrders.length}):
          </span>
          {driverActiveOrders.map(order => {
            const { acceptedMins } = orderDurations(order, currentTime);
            return (
              <div key={order.id} className="text-[11px] text-white flex items-center gap-1 mb-0.5 whitespace-nowrap">
                <Building size={10} className="text-slate-400 shrink-0" /> <span className="truncate max-w-[80px]">{order.stores?.name}</span>
                <span className="text-slate-400 mx-0.5">➔</span>
                <MapPin size={10} className="text-slate-400 shrink-0" /> <span className="truncate max-w-[80px]">{order.address}</span>
                <span
                  className="flex items-center gap-0.5 shrink-0 font-bold ml-0.5"
                  style={{ color: 'var(--map-green)' }}
                  title="Χρόνος από την αποδοχή της παραγγελίας"
                >
                  <Clock size={10} /> {acceptedMins}′
                </span>
              </div>
            );
          })}
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

    return (
      <DriverMarkerOverlay key={driver.id} map={map} position={{ lat: driver.latitude, lng: driver.longitude }}>
        {/* Ίδιο anchor math με το παλιό iconAnchor [45,19] σε κουτί [90,58]:
            η μεταφορά -45px/-19px φέρνει το ΚΕΝΤΡΟ ΤΟΥ ΚΥΚΛΟΥ (όχι το pill
            από κάτω) πάνω στις πραγματικές συντεταγμένες. */}
        <div className="group relative" style={{ width: '90px', transform: 'translate(-45px, -19px)' }}>
          <div className="flex flex-col items-center">
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%', background: '#111',
              border: `2px solid ${markerColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 15px ${markerGlow}`,
              opacity: noSignal ? 0.75 : 1,
              transition: 'all 0.3s ease',
            }}>
              <Bike size={18} color={markerColor} />
            </div>
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

          {/* Πλούσιο tooltip — hover only (σκέτο CSS, αντί για δεύτερο επίπεδο
              InfoWindow/OverlayView), ίδιο περιεχόμενο με πριν. */}
          <div
            className="opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150"
            style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translate(-50%, -8px)',
              background: '#111111', border: `1px solid ${tooltipAccent}`, borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.8)', padding: '8px 12px', backdropFilter: 'blur(10px)',
              zIndex: 20,
            }}
          >
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
            {/* Βελάκι tooltip προς τα κάτω, χρώμα ανά κατάσταση */}
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
              borderTop: `6px solid ${tooltipAccent}`,
            }} />
          </div>
        </div>
      </DriverMarkerOverlay>
    );
  });
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

// ── Πλακίδιο της σύνοψης ημέρας (κάτω δεξιά, στη στήλη εργασίας) ────────────
// ΧΩΡΙΣ σύγκριση με χθες (απόφαση πελάτη): δείχνουμε μόνο την τρέχουσα τιμή —
// το «+1 από χθες» δεν οδηγεί σε καμία ενέργεια μέσα στη βάρδια.
function StatTile({ Icon, value, label, tint, bg, border, title }) {
  return (
    <div
      className="flex-1 basis-[130px] min-w-0 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: bg, border: `1px solid ${border}` }}
      title={title}
    >
      <Icon size={15} style={{ color: tint }} />
      <p className="text-[20px] font-black leading-none mt-1.5 mb-1 tabular-nums truncate" style={{ color: tint }}>
        {value}
      </p>
      <p className="text-[11px] leading-tight m-0 truncate" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
    </div>
  );
}

// Χρωματισμός του πλακιδίου «Αναμενόμενος φόρτος» ανά ένταση. Κρατά την κλιμάκωση
// warning→danger της θέσης που έπαιρνε πριν η «Μεγαλύτερη αναμονή»: το πλακίδιο
// αυτό είναι που λέει «ετοιμάσου» στον διαχειριστή.
const NOW_LOAD_STYLE = {
  idle: { tint: 'var(--text-muted)', bg: 'var(--bg-tertiary)', border: 'var(--border-subtle)' },
  low:  { tint: 'var(--success)',    bg: 'var(--success-bg)',  border: 'var(--success-border)' },
  mid:  { tint: 'var(--warning)',    bg: 'var(--warning-bg)',  border: 'var(--warning-border)' },
  high: { tint: 'var(--danger)',     bg: 'var(--danger-bg)',   border: 'var(--danger-border)' },
};

// ── Ενότητα της δεξιάς στήλης (Ενεργές / Αποδεκτές / Διανομείς) ──────────────
// Ξεχωριστή κάρτα ανά ενότητα, με κουμπί σύμπτυξης: με 8 διανομείς σε βάρδια η
// στήλη γίνεται πολύ μακριά, οπότε ο διαχειριστής μαζεύει ό,τι δεν κοιτά.
function RailSection({ Icon, title, count, tint, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className="rounded-xl overflow-hidden card-surface"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left"
        title={open ? 'Σύμπτυξη' : 'Ανάπτυξη'}
      >
        <Icon size={14} style={{ color: tint }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </span>
        {typeof count === 'number' && (
          <span
            className="text-[11px] font-bold px-1.5 rounded-full tabular-nums"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {count}
          </span>
        )}
        <ChevronDown
          size={16}
          className="ml-auto shrink-0"
          style={{
            color: 'var(--text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms',
          }}
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

// ── Κάρτα διανομέα στη λωρίδα κάτω από τον χάρτη ────────────────────────────
// Client feedback 08/09: οι διανομείς έφυγαν από τη δεξιά στήλη και μπήκαν
// οριζόντια κάτω από τον χάρτη, ώστε να φαίνονται ΟΛΟΙ ταυτόχρονα χωρίς σκρολ.
// Σε αυτό το ύψος δεν χωράει ξεχωριστό κουμπί «Προβολή στον χάρτη» — ολόκληρη
// η κάρτα είναι το κουμπί (το crosshair δίπλα στο όνομα το δηλώνει).
function DriverStripCard({ driver, dotColor, subText, subColor, battery, signalText, deliveries, onFocus }) {
  return (
    <button
      type="button"
      onClick={onFocus}
      // Ό,τι έδειχνε η παλιά κάρτα σε ξεχωριστές γραμμές (σήμα, παραδόσεις,
      // μπαταρία) ζει εδώ ολόκληρο: στη λωρίδα κρατάμε δύο γραμμές, αλλιώς με 7-8
      // διανομείς το ύψος τρώει τον χάρτη.
      title={`${driver.full_name} · ${subText} · σήμα ${signalText} · ${deliveries} ${deliveries === 1 ? 'παράδοση' : 'παραδόσεις'} σήμερα — κλικ για προβολή στον χάρτη`}
      // `card-surface`: σε dark mode το --bg-card είναι ΑΣΠΡΟ (navy φόντο + άσπρες
      // κάρτες), οπότε χωρίς αυτό το κείμενο έμενε στα ανοιχτόχρωμα dark tokens
      // πάνω σε άσπρο — 2.7:1, ουσιαστικά αδιάβαστο.
      className="hover-row-glass card-surface min-w-0 rounded-xl px-2.5 py-2 text-left transition-colors"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderLeft: `3px solid ${dotColor}`,
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {/* Πάνω γραμμή: ΜΟΝΟ το όνομα — με τη μπαταρία δίπλα του κοβόταν ακόμα και
          το «Γιώργος Παπαδόπουλος» σε οθόνη 1280. Η μπαταρία κατέβηκε κάτω. */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: `1px solid ${dotColor}` }}
        >
          <Bike size={14} style={{ color: dotColor }} />
        </span>
        <p className="text-[12.5px] font-bold leading-tight truncate m-0 flex-1" style={{ color: 'var(--text-primary)' }}>
          {driver.full_name}
        </p>
        <Crosshair size={11} className="shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
      </div>

      <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ backgroundColor: dotColor }} />
        <span className="text-[12px] leading-tight truncate" style={{ color: subColor }}>{subText}</span>
        {battery && (
          // mr-1.5: με σκέτο το gap-1.5 της γραμμής, μπαταρία και παραδόσεις είχαν
          // 6px μεταξύ τους ενώ οι παραδόσεις απέχουν 11px από την άκρη της κάρτας
          // — φαίνονταν κολλητά. Τα 12px τα ξεχωρίζουν σαν δύο ξεχωριστές τιμές.
          <span
            className="ml-auto mr-1.5 shrink-0 flex items-center gap-0.5 text-[11px] font-bold tabular-nums"
            style={{ color: battery.color }}
          >
            <battery.Icon size={12} /> {driver.battery_level}%
          </span>
        )}
        <span
          className={`${battery ? '' : 'ml-auto '}shrink-0 flex items-center gap-0.5 text-[11px] font-bold tabular-nums`}
          style={{ color: 'var(--text-secondary)' }}
        >
          <Check size={11} /> {deliveries}
        </span>
      </div>
    </button>
  );
}

// ── Κενή κατάσταση ενότητας ─────────────────────────────────────────────────
function RailEmpty({ Icon, children }) {
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-[12px] py-2 m-0" style={{ color: 'var(--text-muted)' }}>
      {Icon && <Icon size={14} style={{ color: 'var(--success)' }} />}
      {children}
    </p>
  );
}

// `navHidden`: το αριστερό μενού είναι μαζεμένο, άρα περισσεύουν ~256px. Τα δίνουμε
// στη δεξιά στήλη ώστε «Ενεργές» και «Αποδεκτές» να κάθονται δίπλα-δίπλα αντί η μία
// κάτω από την άλλη. Μόνο από xl (≥1280px) και πάνω — σε μικρότερο laptop η στήλη
// των 620px θα έτρωγε τον χάρτη.
export default function LiveMap({ navHidden = false }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Γραμμένα ολόκληρα (όχι με template) γιατί ο JIT του Tailwind ψάχνει τη συμβολοσειρά αυτούσια.
  const railWidthClass = navHidden ? 'md:w-[340px] xl:w-[640px]' : 'md:w-[340px]';

  const [drivers, setDrivers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [assigningOrderId, setAssigningOrderId] = useState(null);
  // Μετάθεση ήδη ανατεθειμένης παραγγελίας σε άλλον διανομέα (ανοιχτό dropdown).
  const [reassigningOrderId, setReassigningOrderId] = useState(null);
  // Ποιες παραγγελίες ήταν 'scheduled' πριν το τελευταίο realtime event.
  const scheduledIdsRef = useRef(new Set());
  const [lastCompletedTimes, setLastCompletedTimes] = useState({});
  // Πόσες παραδόσεις έκλεισε σήμερα ο καθένας — { [driverId]: πλήθος }.
  const [deliveriesToday, setDeliveriesToday] = useState({});
  // Ο διανομέας που ζήτησε ο χρήστης να δει στον χάρτη ({ lat, lng, ts }).
  const [focusTarget, setFocusTarget] = useState(null);
  const mapWrapRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  // Πότε μπήκαν τελευταία φορά ΔΕΔΟΜΕΝΑ (όχι απλώς τικ ρολογιού) — το δείχνει η
  // ένδειξη «Live» κάτω από τον χάρτη, ώστε να φαίνεται ότι το realtime ζει.
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // ── Στατιστικά φόρτου / χρόνου ──
  const [workloadMatrix, setWorkloadMatrix] = useState(null); // { [jsDay]: { [hour]: avg } }
  const [workloadMax, setWorkloadMax] = useState(0);
  const [avgDeliveryToday, setAvgDeliveryToday] = useState(null);
  const [ordersToday, setOrdersToday] = useState(0);
  const [loadingWorkload, setLoadingWorkload] = useState(false);
  // MULTI-TENANT: κέντρο χάρτη ανά εταιρία από τον companies (fallback Φλώρινα· σε
  // production χωρίς companies/hook το query αποτυγχάνει σιωπηλά → μένει το default).
  const [centerPosition, setCenterPosition] = useState(FLORINA_DEFAULT);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.schema('public').from('companies')
          .select('map_center').eq('schema_name', getTenantSchema()).maybeSingle();
        if (data?.map_center) {
          const [lat, lng] = data.map_center.split(',').map(Number);
          if (Number.isFinite(lat) && Number.isFinite(lng)) setCenterPosition({ lat, lng });
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
      setLastUpdate(new Date());
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
      const counts = {};
      data.forEach(order => {
        if (order.driver_id && order.completed_at) {
          const t = new Date(order.completed_at).getTime();
          if (!times[order.driver_id] || t > times[order.driver_id]) {
            times[order.driver_id] = t;
          }
          counts[order.driver_id] = (counts[order.driver_id] || 0) + 1;
        }
      });
      setLastCompletedTimes(times);
      setDeliveriesToday(counts);
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
        setLastUpdate(new Date());
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
        const reason = await pushFailureReason(error);
        console.error('[assignment push]', error, reason);
        toast.error(`Η ειδοποίηση στον διανομέα απέτυχε. ${reason}`);
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
      toast.error('Η ειδοποίηση στον διανομέα απέτυχε — δεν υπήρξε απάντηση από τον διακομιστή.');
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

  // ── Σύνοψη ημέρας: ώρα αιχμής της σημερινής ημέρας εβδομάδας ──
  // Βγαίνει από το ΙΔΙΟ matrix του heatmap (καμία επιπλέον κλήση στη βάση).
  let peakHour = null;
  let peakValue = 0;
  const todayCurve = workloadMatrix?.[currentTime.getDay()];
  if (todayCurve) {
    for (let h = 0; h < 24; h++) {
      if ((todayCurve[h] || 0) > peakValue) { peakValue = todayCurve[h]; peakHour = h; }
    }
  }

  // ── Σύνοψη ημέρας: εκτιμώμενος φόρτος της ώρας που τρέχει τώρα ──
  // «Τι να περιμένω μέσα στην επόμενη ώρα»: ο ιστορικός μ.ό. αυτής της ώρας για τη
  // σημερινή ημέρα εβδομάδας — η ίδια μπάρα που φωτίζεται πράσινη στο γράφημα δεξιά.
  // null = δεν έχει έρθει ακόμη το matrix· διαφορετικό από 0, που σημαίνει
  // «ιστορικά ήσυχη ώρα» και θέλει να φαίνεται ως πληροφορία.
  const nowLoad = todayCurve ? (todayCurve[currentTime.getHours()] || 0) : null;
  // Ο σκέτος αριθμός δεν λέει τίποτα — 3 παραγγελίες την ώρα είναι πολλές ή λίγες
  // αναλόγως το κατάστημα. Τον κρίνουμε σε σχέση με τη σημερινή αιχμή.
  const nowLoadRatio = nowLoad !== null && peakValue > 0 ? nowLoad / peakValue : 0;
  const nowLoadLevel =
    nowLoad === null || nowLoad === 0 ? 'idle'
    : nowLoadRatio >= 0.75 ? 'high'
    : nowLoadRatio >= 0.4 ? 'mid'
    : 'low';
  // Το «~» μπαίνει μόνο σε πραγματική εκτίμηση: το «~0.0» θα δήλωνε ακρίβεια που
  // δεν υπάρχει, ενώ σκέτο 0 διαβάζεται σωστά ως «ιστορικά ήσυχη ώρα».
  const nowLoadText = nowLoad === null ? '—' : nowLoad === 0 ? '0' : `~${fmtLoad(nowLoad)}`;

  const railCardStyle = (tint) => ({
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderLeft: `3px solid ${tint}`,
  });

  return (
    <div className="flex flex-col md:h-full font-sans" style={{ color: 'var(--text-primary)' }}>

      {/* ΓΡΑΜΜΗ KPI ΠΑΝΩ ΑΠΟ ΤΟΝ ΧΑΡΤΗ: καταργήθηκε (απόφαση πελάτη). Οι ίδιοι
          αριθμοί ζουν πλέον στη «Σήμερα με μια ματιά» κάτω από τον χάρτη, ο
          φόρτος στην κάτω δεξιά κάρτα, και η κατάσταση συστήματος φαίνεται
          μόνο όταν έχει σημασία — ως ReadOnlyBanner σε failover. */}

      {/* ════════ ΣΩΜΑ: ΧΑΡΤΗΣ + ΔΕΞΙΑ ΣΤΗΛΗ ════════ */}
      <div className="flex flex-col md:flex-row md:flex-1 min-h-0">

        {/* ── Χάρτης (full-bleed) ── */}
        <div ref={mapWrapRef} className="relative h-[48vh] md:h-auto md:flex-1 min-w-0 z-0">
          {!GOOGLE_MAPS_KEY ? (
            <div
              className="h-full w-full flex items-center justify-center text-center text-[13px] px-6"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}
            >
              Λείπει το <code className="mx-1">VITE_GOOGLE_MAPS_KEY</code> — βάλε το στο
              περιβάλλον αυτού του deployment για να φορτώσει ο χάρτης.
            </div>
          ) : (
            <APIProvider apiKey={GOOGLE_MAPS_KEY}>
              <Map
                defaultCenter={centerPosition}
                defaultZoom={14}
                gestureHandling="greedy"
                disableDefaultUI
                zoomControl
                zoomControlOptions={{ position: ControlPosition.LEFT_BOTTOM }}
                styles={isDark ? DARK_MAP_STYLE : undefined}
                reuseMaps
                className="h-full w-full"
                style={{ background: 'var(--bg-primary)' }}
              >
                <MapResizeHandler />
                <MapCenterHandler center={centerPosition} />
                <MapFocusHandler target={focusTarget} />
                <DriverMarkersLayer
                  drivers={drivers}
                  orders={orders}
                  currentTime={currentTime}
                  lastCompletedTimes={lastCompletedTimes}
                />
              </Map>
            </APIProvider>
          )}

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
          className={`w-full ${railWidthClass} shrink-0 border-t md:border-t-0 md:border-l md:overflow-y-auto p-3 space-y-3 transition-[width] duration-300 ease-out`}
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)' }}
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

          {/* «Ενεργές» + «Αποδεκτές»: δίπλα-δίπλα όταν το μενού είναι μαζεμένο (και
              μόνο σε ≥1280px), αλλιώς η μία κάτω από την άλλη όπως πάντα. Το
              `items-start` κρατά κάθε στήλη στο ύψος που της αναλογεί — χωρίς αυτό
              η άδεια στήλη τεντωνόταν στο ύψος της γεμάτης. */}
          <div className={navHidden ? 'grid gap-3 items-start xl:grid-cols-2' : 'space-y-3'}>
          {/* Εκκρεμείς→Ενεργές (client feedback 08/08: μετονομασία καρτελών) */}
          <RailSection Icon={Package} title="Ενεργές" count={pendingOrders.length} tint="var(--accent)">
            {pendingOrders.length === 0 ? (
              <RailEmpty Icon={CheckCircle2}>Καμία εκκρεμής — όλα καθαρά</RailEmpty>
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

          {/* Ενεργές→Αποδεκτές (client feedback 08/08: μετονομασία καρτελών) */}
          <RailSection Icon={Bike} title="Αποδεκτές" count={acceptedOrders.length} tint="var(--success)">
            {acceptedOrders.length === 0 ? (
              <RailEmpty>Καμία ενεργή διανομή αυτή τη στιγμή</RailEmpty>
            ) : (
              <AnimatePresence>
                {acceptedOrders.map((order, idx) => {
                  // Οι ΔΥΟ χρόνοι που ζήτησε ο πελάτης: πόση ώρα ήταν «ενεργή»
                  // (πριν την πάρει διανομέας) και πόση είναι «αποδεκτή» — ώστε να
                  // βγαίνει ο πραγματικός συνολικός χρόνος της παραγγελίας.
                  const { activeMins, acceptedMins } = orderDurations(order, currentTime);
                  // Λεπτά από την παραλαβή (client feedback 08/08 — τρίτο κουτάκι):
                  // δεν υπάρχει έτοιμο helper όπως το orderDurations γιατί μέχρι τώρα
                  // δεν χρειαζόταν πουθενά αλλού αυτός ο χρόνος ξεχωριστά.
                  const pickedUpMins = order.picked_up_at
                    ? Math.max(0, Math.floor(((order.completed_at ? new Date(order.completed_at) : currentTime) - new Date(order.picked_up_at)) / 60000))
                    : null;
                  // Συνολικός χρόνος παραγγελίας (client feedback 08/09): άθροισμα των τριών
                  // φάσεων. ΔΕΝ χρησιμοποιούμε το acceptedMins όπως είναι (αυτό μετρά μέχρι
                  // completed_at/τώρα, όχι μέχρι την παραλαβή) — αλλιώς το διάστημα
                  // παραλαβή→τώρα θα μετρούσε ΔΙΠΛΑ, και μέσα στο «Αποδεκτή» και ξανά μέσα
                  // στο «Παρελήφθη». Το κουτάκι «Αποδεκτή» δεν αγγίζεται, μένει όπως είναι.
                  const acceptedToPickupMins = (order.picked_up_at && order.accepted_at)
                    ? Math.max(0, Math.floor((new Date(order.picked_up_at) - new Date(order.accepted_at)) / 60000))
                    : acceptedMins;
                  const totalMins = activeMins + acceptedToPickupMins + (pickedUpMins || 0);
                  return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-lg px-2.5 py-2 mb-2 last:mb-0 text-[13px]"
                    style={railCardStyle('var(--success)')}
                  >
                    {/* Ζευγάρι: κατάστημα → διεύθυνση (βασική πληροφορία, πρώτη στην ιεραρχία) */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <OrderNumber n={idx + 1} />
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <Building size={11} className="shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
                        <span className="font-extrabold shrink-0" style={{ color: 'var(--text-primary)' }}>{order.stores?.name}</span>
                        <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>➔</span>
                        <MapPin size={11} className="shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
                        <span className="truncate" style={{ color: 'var(--text-secondary)' }} title={order.address}>{order.address}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <DistanceChip order={order} />
                        {/* Συνολικός χρόνος παραγγελίας (client feedback 08/09): πάνω δεξιά
                            στην κάρτα — Ενεργή + Αποδεκτή + Παρελήφθη. */}
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded inline-flex items-center gap-1 tabular-nums"
                          style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                          title={`Συνολικός χρόνος: Ενεργή ${activeMins}′ + Αποδεκτή ${acceptedToPickupMins}′${order.picked_up_at ? ` + Παρελήφθη ${pickedUpMins}′` : ''} = ${totalMins}′`}
                        >
                          <Clock size={10} /> {totalMins}′
                        </span>
                      </div>
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

                    {/* Διανομέας */}
                    <div className="flex items-center gap-1.5 min-w-0 mt-1.5">
                      <User size={12} className="shrink-0" style={{ color: 'var(--success)' }} />
                      <span className="font-semibold truncate text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{order.drivers?.full_name}</span>
                    </div>

                    {/* 3 κουτάκια κατάστασης (client feedback 08/08): πορτοκαλί=Ενεργή
                        (δημιουργία→αποδοχή), μπλε=Αποδεκτή (αποδοχή→παραλαβή/τώρα),
                        πράσινη=Παρελήφθη (παραλαβή→τώρα) — τα λεπτά μέσα σε κάθε κουτάκι.
                        Η πράσινη μένει «κενή» μέχρι να παραλάβει ο διανομέας. */}
                    <div className="flex items-center gap-1 mt-1.5">
                      <div
                        className="flex-1 flex flex-col items-center py-1 rounded-md"
                        style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid var(--accent)' }}
                        title={`Ενεργή: ${activeMins} λ. (από τη δημιουργία μέχρι την αποδοχή)`}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Ενεργή</span>
                        <span className="text-[13px] font-black tabular-nums leading-none" style={{ color: 'var(--accent)' }}>{activeMins}′</span>
                      </div>
                      <div
                        className="flex-1 flex flex-col items-center py-1 rounded-md"
                        style={{ backgroundColor: 'var(--info-bg)', border: '1px solid var(--info)' }}
                        title={`Αποδεκτή: ${acceptedMins} λ. (από την αποδοχή μέχρι ${order.picked_up_at ? 'την παραλαβή' : 'τώρα'})`}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--info)' }}>Αποδεκτή</span>
                        <span className="text-[13px] font-black tabular-nums leading-none" style={{ color: 'var(--info)' }}>{acceptedMins}′</span>
                      </div>
                      <div
                        className="flex-1 flex flex-col items-center py-1 rounded-md"
                        style={order.picked_up_at
                          ? { backgroundColor: 'var(--success-bg)', border: '1px solid var(--success)' }
                          : { backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', opacity: 0.5 }}
                        title={order.picked_up_at ? `Παρελήφθη: ${pickedUpMins} λ. (από την παραλαβή μέχρι τώρα)` : 'Δεν έχει παραληφθεί ακόμα από το κατάστημα'}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: order.picked_up_at ? 'var(--success)' : 'var(--text-muted)' }}>Παρελήφθη</span>
                        <span className="text-[13px] font-black tabular-nums leading-none" style={{ color: order.picked_up_at ? 'var(--success)' : 'var(--text-muted)' }}>
                          {order.picked_up_at ? `${pickedUpMins}′` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Ενέργειες: απλωμένα ισομερώς σε όλο το πλάτος της κάρτας (client
                        feedback 08/09) αντί να στριμώχνονται στην κάτω δεξιά γωνία. */}
                    <div className="flex items-center justify-between gap-1.5 mt-2">
                      <button
                        onClick={() => setReassigningOrderId(reassigningOrderId === order.id ? null : order.id)}
                        className="w-[30px] h-[30px] rounded-lg cursor-pointer transition-all flex items-center justify-center shrink-0"
                        style={reassigningOrderId === order.id
                          ? { color: '#fff', backgroundColor: 'var(--accent)', border: '1px solid var(--accent)' }
                          : { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}
                        title="Μετάθεση σε άλλον διανομέα"
                      >
                        <Repeat size={14} />
                      </button>
                      <button
                        onClick={() => completeOrder(order.id)}
                        className="w-[30px] h-[30px] rounded-lg cursor-pointer transition-all flex items-center justify-center shrink-0"
                        style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                        title="Ολοκλήρωση Παραγγελίας"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => cancelOrder(order.id)}
                        className="w-[30px] h-[30px] rounded-lg cursor-pointer transition-all flex items-center justify-center shrink-0"
                        style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}
                        title="Ακύρωση Παραγγελίας"
                      >
                        <X size={15} />
                      </button>
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
          </div>

          {/* Σήμερα με μια ματιά — client feedback 08/09: αντάλλαξε θέση με τους
              διανομείς. Τα πλακίδια είναι σύνοψη και χωράνε άνετα 2×2 στα 340px,
              ενώ οι διανομείς χρειάζονται πλάτος για να φαίνονται όλοι μαζί.
              ΧΩΡΙΣ το πλακίδιο «Διανομείς σε βάρδια» (αίτημα πελάτη): ο ίδιος
              αριθμός φαίνεται πλέον στην κεφαλίδα της λωρίδας κάτω από τον χάρτη. */}
          <RailSection Icon={TrendingUp} title="Σήμερα με μια ματιά" tint="var(--text-secondary)">
            <div className="flex flex-wrap gap-2">
              <StatTile
                Icon={Check}
                value={ordersToday}
                label="Ολοκληρωμένες"
                tint="var(--success)"
                bg="var(--success-bg)"
                border="var(--success-border)"
                title="Παραγγελίες που ολοκληρώθηκαν σήμερα"
              />

              <StatTile
                Icon={Timer}
                value={avgDeliveryToday !== null ? `${avgDeliveryToday} λ.` : '—'}
                label="Μ.Ο. χρόνος"
                tint="var(--info)"
                bg="var(--info-bg)"
                border="var(--info-border)"
                title="Μέσος χρόνος από την ανάθεση μέχρι την ολοκλήρωση, για τις σημερινές παραγγελίες"
              />

              <StatTile
                Icon={Flame}
                value={nowLoadText}
                label="Αναμενόμενος φόρτος"
                tint={NOW_LOAD_STYLE[nowLoadLevel].tint}
                bg={NOW_LOAD_STYLE[nowLoadLevel].bg}
                border={NOW_LOAD_STYLE[nowLoadLevel].border}
                title={nowLoad === null
                  ? 'Δεν υπάρχουν ακόμη αρκετά δεδομένα για εκτίμηση'
                  : `${DOW_FULL[currentTime.getDay()]} ${String(currentTime.getHours()).padStart(2, '0')}:00–${String((currentTime.getHours() + 1) % 24).padStart(2, '0')}:00 · ιστορικά μ.ό. ${fmtLoad(nowLoad)} παραγγελίες`
                    + (peakValue > 0 ? ` — ${Math.round(nowLoadRatio * 100)}% της σημερινής αιχμής` : '')}
              />

              <StatTile
                Icon={TrendingUp}
                value={peakHour !== null ? `${String(peakHour).padStart(2, '0')}:00` : '—'}
                label="Ώρα αιχμής"
                tint="var(--purple)"
                bg="var(--purple-bg)"
                border="var(--purple-border)"
                title={peakHour !== null
                  ? `Ιστορικά η πιο φορτωμένη ώρα για σήμερα — μ.ό. ${peakValue >= 10 ? Math.round(peakValue) : peakValue.toFixed(1)} παραγγελίες`
                  : 'Δεν υπάρχουν ακόμη αρκετά δεδομένα'}
              />
            </div>
          </RailSection>
        </aside>
      </div>

      {/* ════════ ΚΑΤΩ ΓΡΑΜΜΗ: ΔΙΑΝΟΜΕΙΣ + ΦΟΡΤΟΣ ════════ */}
      {/* Ίδιο πλάτος στηλών με τον χάρτη/δεξιά στήλη από πάνω, ώστε οι διανομείς
          να κάθονται κάτω από τον χάρτη και ο φόρτος κάτω από τη λίστα. */}
      <div
        className="flex flex-col md:flex-row shrink-0 border-t"
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {/* ── Διανομείς σε βάρδια (οριζόντια λωρίδα κάτω από τον χάρτη) ── */}
        <div className="flex-1 min-w-0 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Users size={13} /> Διανομείς σε βάρδια
              <span
                className="text-[11px] font-bold px-1.5 rounded-full tabular-nums"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                {visibleDrivers.length}
              </span>
            </span>
            <span className="text-[10px] flex items-center gap-1.5 shrink-0" style={{ color: 'var(--text-muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ backgroundColor: 'var(--success)' }} />
              Live · {lastUpdate.toLocaleTimeString('el-GR', { hour12: false })}
            </span>
          </div>

          {visibleDrivers.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[12px] py-3 m-0" style={{ color: 'var(--text-muted)' }}>
              <Bike size={14} /> Κανένας διανομέας συνδεδεμένος — η βάρδια δεν έχει ξεκινήσει.
            </p>
          ) : (
            // Grid αντί για flex-wrap: με 7 διανομείς το flex-wrap τέντωνε τις 2
            // κάρτες της τελευταίας σειράς στο διπλάσιο πλάτος. Το auto-fill κρατά
            // ίδιο πλάτος σε όλες και γεμίζει όσο πλάτος υπάρχει. Τα 200px είναι το
            // ελάχιστο που χωράει ολόκληρο ελληνικό ονοματεπώνυμο χωρίς «…»
            // (μετρημένο: «Γιώργος Παπαδόπουλος» θέλει ~135px κειμένου) — σε οθόνη
            // 1280px βγαίνουν 4 στήλες, δηλαδή 8 διανομείς σε 2 σειρές.
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {visibleDrivers.map(driver => {
                const ageMin = signalAgeMin(driver);
                const noSignal = ageMin > SIGNAL_FRESH_MIN;
                const activeCount = acceptedOrders.filter(o => o.driver_id === driver.id).length;

                // Ίδιος χρωματικός κώδικας με τους δείκτες του χάρτη: χρυσό =
                // ελεύθερος, πράσινο = σε διανομή, γκρι = χωρίς σήμα.
                let dotColor = 'var(--accent)';
                let subText = 'Ελεύθερος';
                let subColor = 'var(--text-secondary)';

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
                    subColor = diffMins > 10 ? 'var(--danger)' : 'var(--text-secondary)';
                  }
                }

                return (
                  <DriverStripCard
                    key={driver.id}
                    driver={driver}
                    dotColor={dotColor}
                    subText={subText}
                    subColor={subColor}
                    battery={batteryVisual(driver.battery_level)}
                    signalText={ageMin < 1 ? 'μόλις τώρα' : `πριν ${Math.floor(ageMin)} λ.`}
                    deliveries={deliveriesToday[driver.id] || 0}
                    onFocus={() => {
                      setFocusTarget({ lat: driver.latitude, lng: driver.longitude, ts: Date.now() });
                      mapWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Φόρτος (στη θέση των παλιών «Γρήγορων ενεργειών») ── */}
        <div
          className={`w-full ${railWidthClass} shrink-0 border-t md:border-t-0 md:border-l transition-[width] duration-300 ease-out`}
          style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <WorkloadChart
            matrix={workloadMatrix}
            loading={loadingWorkload}
            isDark={isDark}
          />
        </div>
      </div>
    </div>
  );
}

// ════════ Bar chart φόρτου ανά ώρα (για επιλεγμένη ημέρα) ════════
const START_HOUR = 7;  // πρωί
const END_HOUR = 23;   // η μπάρα 23:00 καλύπτει 23:00–00:00 (μεσάνυχτα)

// Ζει στην κάρτα κάτω δεξιά (πλάτος 340px), οπότε είναι σφιχτό: χαμηλές μπάρες
// και καμία τιμή πάνω από τις μπάρες — 17 νούμερα δεν χωρούν. Οι ακριβείς τιμές
// μένουν διαθέσιμες στο tooltip κάθε μπάρας.
// Ο άξονας ωρών ζει σε ξεχωριστή γραμμή κάτω από τις μπάρες: έτσι το πλάτος της
// ετικέτας δεν επηρεάζει το ύψος/πλάτος της μπάρας και μπορεί να είναι αναγνώσιμη
// (10px, ανά 4 ώρες, μορφή «07:00»). Η τρέχουσα ώρα δεν παίρνει δικό της νούμερο
// — θα στοίβαζε ετικέτες — αλλά πράσινη κουκκίδα στον άξονα.
function WorkloadChart({ matrix, loading, isDark }) {
  const todayDow = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(todayDow);

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);

  const dayData = (matrix && matrix[selectedDay]) || {};
  const dayMax = Math.max(...hours.map(h => dayData[h] || 0), 0);
  const currentHour = new Date().getHours();

  return (
    <div className="p-3">
      {/* Επιλογή ημέρας */}
      <div className="flex items-center justify-between mb-2.5">
        <h4
          className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color: 'var(--text-muted)' }}
          title="Εκπαιδεύεται αυτόματα με τα δεδομένα των παραγγελιών — όσο περνάει ο καιρός γίνεται πιο ακριβές."
        >
          <Flame size={13} style={{ color: 'var(--accent)' }} /> Φόρτος ανά ώρα
        </h4>
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
        <span className="text-[13px] font-bold" style={{ color: isDark ? '#f1f5f9' : '#1e293b' }}>
          {DOW_FULL[selectedDay]}
        </span>
        {selectedDay === todayDow && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--map-tint-green)', color: 'var(--map-green-deep)' }}>
            Σήμερα
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-center text-[12px]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
          Φόρτωση δεδομένων…
        </div>
      ) : !matrix || dayMax === 0 ? (
        <div className="py-6 text-center text-[12px]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
          Δεν υπάρχουν ακόμη αρκετά δεδομένα για {DOW_FULL[selectedDay]}.
        </div>
      ) : (
        <>
          {/* Μπάρες — κάθονται πάνω σε γραμμή βάσης, ώστε ο άξονας από κάτω να
              διαβάζεται ως άξονας και όχι ως σκόρπια νούμερα. */}
          <div
            className="flex items-end justify-between gap-[3px] border-b"
            style={{ height: 96, borderColor: 'var(--border-default)' }}
          >
            {hours.map(h => {
              const val = dayData[h] || 0;
              const pct = dayMax > 0 ? (val / dayMax) * 100 : 0;
              const isNow = selectedDay === todayDow && h === currentHour;
              return (
                <div
                  key={h}
                  className="flex-1 min-w-0 flex items-end h-full"
                  title={`${DOW_FULL[selectedDay]} ${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00 · μ.ό. ${fmtLoad(val)} παραγγελίες`}
                >
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
                </div>
              );
            })}
          </div>

          {/* Άξονας ωρών: ετικέτα ανά 4 ώρες (07:00 · 11:00 · 15:00 · 19:00 · 23:00).
              Ζει σε δική της γραμμή, οπότε το πλάτος της ετικέτας δεν πειράζει τις
              μπάρες: ξεχειλίζει συμμετρικά πάνω στις κενές διπλανές στήλες και
              χωράει άνετα μέσα στο p-3 της κάρτας. Η τρέχουσα ώρα δεν παίρνει δικό
              της νούμερο (θα στοίβαζε ετικέτες) αλλά πράσινη κουκκίδα. */}
          <div className="flex justify-between gap-[3px] mt-1.5">
            {hours.map(h => {
              const isLabelled = (h - START_HOUR) % 4 === 0;
              const isNow = selectedDay === todayDow && h === currentHour;
              return (
                <div key={h} className="flex-1 min-w-0 flex items-center justify-center h-3">
                  {isLabelled ? (
                    <span
                      className="text-[10px] font-semibold tabular-nums"
                      style={{
                        whiteSpace: 'nowrap',
                        // Σε light το --map-green-deep (#16a34a) πιάνει μόλις 3.3:1 πάνω
                        // σε λευκό — κάτω από το AA για 10px. Πιο βαθύ πράσινο εδώ (5.0:1).
                        color: isNow
                          ? (isDark ? 'var(--map-green)' : '#15803d')
                          : (isDark ? '#94a3b8' : '#64748b'),
                      }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </span>
                  ) : isNow ? (
                    <span
                      title="Τρέχουσα ώρα"
                      style={{ width: 4, height: 4, borderRadius: 9999, background: 'var(--map-green)' }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
