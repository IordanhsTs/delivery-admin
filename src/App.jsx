import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useTheme } from './ThemeContext.jsx';
import BillingDashboard from './BillingDashboard';
import FuelReport from './FuelReport';
import FleetVehicles from './FleetVehicles';
import Schedule from './Schedule';
import Announcements from './Announcements';
import LiveMap from './LiveMap';
import StoreManagement from './StoreManagement';
import Statistics from './Statistics';
import CreateOrder from './CreateOrder';
import Messages from './Messages';
import OrderSearch from './OrderSearch';
import Login from './Login';
import { useStoreMessages } from './useStoreMessages';
import ReadOnlyBanner from './ReadOnlyBanner';
import ConfirmDialogHost from './ConfirmDialog';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// ── Lucide-style inline SVG icons (matches store-web-app exactly) ──────────
const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
  </svg>
);

const LogOutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

// ── Nav items — εικονίδια SVG αντί για emoji ───────────────────────────────
const MapIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);

const ReceiptIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
    <path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>
  </svg>
);

const FuelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="22" x2="15" y2="22"/>
    <line x1="4" y1="9" x2="14" y2="9"/>
    <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/>
    <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>
  </svg>
);

const BuildingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
    <path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/>
    <path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/>
    <path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>
  </svg>
);

const BarChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
    <line x1="2"  y1="20" x2="22" y2="20"/>
  </svg>
);

const MessageSquareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const MoreIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
  </svg>
);

// Χάμπουργκερ: εμφανίζεται πάνω αριστερά στον χάρτη όταν το μενού είναι μαζεμένο.
const MenuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
  </svg>
);

// «Μάζεψε το μενού» — ίδιο εικονίδιο λογικής με το panel-left-close του lucide.
const PanelLeftCloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2"/>
    <path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>
  </svg>
);

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/>
    <path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>
  </svg>
);

const MegaphoneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 11 18-5v12L3 14v-3z"/>
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
  </svg>
);

const BikeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/>
    <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
    <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
  </svg>
);

const NAV_ITEMS = [
  { id: 'map',          Icon: MapIcon,      shortLabel: 'Χάρτης',     fullLabel: 'Live Χάρτης' },
  { id: 'create-order', Icon: PlusIcon,     shortLabel: 'Νέα Παρ.',   fullLabel: 'Νέα Παραγγελία' },
  { id: 'search',       Icon: SearchIcon,   shortLabel: 'Αναζήτηση',  fullLabel: 'Αναζήτηση' },
  { id: 'messages',     Icon: MessageSquareIcon, shortLabel: 'Μηνύματα', fullLabel: 'Μηνύματα' },
  { id: 'schedule',     Icon: CalendarIcon, shortLabel: 'Πρόγραμμα',  fullLabel: 'Πρόγραμμα εβδομάδας' },
  { id: 'announcements',Icon: MegaphoneIcon, shortLabel: 'Ανακοιν.',  fullLabel: 'Ανακοινώσεις' },
  { id: 'billing',      Icon: ReceiptIcon,  shortLabel: 'Εκκαθάριση', fullLabel: 'Εκκαθάριση' },
  { id: 'fuel',         Icon: FuelIcon,     shortLabel: 'Καύσιμα',    fullLabel: 'Χιλιόμετρα & Καύσιμα' },
  { id: 'fleet',        Icon: BikeIcon,     shortLabel: 'Μηχανές',    fullLabel: 'Στόλος μηχανών' },
  { id: 'stores',       Icon: BuildingIcon, shortLabel: 'Διαχείριση', fullLabel: 'Διαχείριση' },
  { id: 'stats',        Icon: BarChartIcon, shortLabel: 'Στατιστικά', fullLabel: 'Στατιστικά' },
];

// ΚΙΝΗΤΟ: μόνο οι τρεις λειτουργίες της καθημερινής ροής μένουν στη μπάρα· τα
// υπόλοιπα μαζεύονται πίσω από το κουμπί «Περισσότερα». Επτά εικονίδια σε μια
// οθόνη τηλεφώνου γίνονταν οριζόντιο scroll και έμοιαζαν ακανόνιστα.
const MOBILE_PRIMARY_IDS = ['map', 'create-order', 'messages'];

// Ο χάρτης ('map') μένει εκτός αυτού του object — φορτώνεται ξεχωριστά και μόνιμα
// mounted στο render (βλ. παρακάτω), ώστε να μη χάνει θέση/zoom σε κάθε tab switch.
const VIEW_COMPONENTS = {
  'create-order':  <CreateOrder />,
  'search':        <OrderSearch />,
  'messages':      <Messages />,
  'schedule':      <Schedule />,
  'announcements': <Announcements />,
  'billing':       <BillingDashboard />,
  'fuel':          <FuelReport />,
  'fleet':         <FleetVehicles />,
  'stores':        <StoreManagement />,
  'stats':         <Statistics />,
};

// Κόκκινη κουκκίδα με το πλήθος αδιάβαστων μηνυμάτων από καταστήματα. Ζει σε δικό
// του component ώστε το realtime subscription να στήνεται ΜΟΝΟ αφού συνδεθεί ο admin.
function UnreadMessagesBadge() {
  const { unreadCount } = useStoreMessages();
  if (!unreadCount) return null;
  return (
    <span
      className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-black flex items-center justify-center"
      style={{ backgroundColor: 'var(--danger)', color: '#fff' }}
      title={`${unreadCount} αδιάβαστα μηνύματα από καταστήματα`}
    >
      {unreadCount}
    </span>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('map');
  const [moreOpen, setMoreOpen] = useState(false);
  // ΜΕΝΟΥ ΑΝΑΔΥΟΜΕΝΟ ΣΤΟΝ ΧΑΡΤΗ (desktop): στον χάρτη το μενού μαζεύεται με το κουμπί
  // της μπάρας και ο χώρος που περισσεύει πάει στη δεξιά στήλη, ώστε «Ενεργές» και
  // «Αποδεκτές» να χωρέσουν δίπλα-δίπλα. Όσο είναι ανοιχτό, η οθόνη δείχνει ακριβώς
  // ό,τι έδειχνε και πριν (μία στήλη).
  // ΞΕΚΙΝΑ ΑΝΟΙΧΤΟ (αίτημα χρήστη): κάθε refresh βρίσκει τη γνώριμη οθόνη με το μενού
  // στη θέση του. Από κει και πέρα η επιλογή κρατάει όσο ζει η σελίδα — δεν
  // ξαναπετάγεται ούτε ξαναμαζεύεται μόνο του σε κάθε αλλαγή καρτέλας. Δεν
  // αποθηκεύεται πουθενά, και σε ΚΑΘΕ άλλη καρτέλα το μενού είναι πάντα καρφωμένο.
  const [navOpenOnMap, setNavOpenOnMap] = useState(true);

  const isDark = theme === 'dark';
  const navHidden = activeTab === 'map' && !navOpenOnMap;

  useEffect(() => {
    // Διαβάζει τα claims από το JWT (ίδιο μοτίβο με το applyTenantFromSession).
    const readClaims = (session) => {
      try {
        const b64 = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(b64));
      } catch (_) {
        return {};
      }
    };

    const verifyAdminSession = async (session) => {
      if (!session) {
        setIsAuthenticated(false);
        setSessionLoading(false);
        return;
      }

      const claims = readClaims(session);

      // ΝΕΟ μονοπάτι (multi-tenant, με auth hook): admin ΜΟΝΟ αν το `user_role` claim
      // το λέει ρητά. Θετικός έλεγχος (allowlist) — όχι το παλιό fail-open «ό,τι δεν
      // είναι driver/store = admin». Ο hook εισάγει το claim από τον πίνακα memberships.
      if (typeof claims.user_role === 'string') {
        const isAdmin = claims.user_role === 'admin';
        if (!isAdmin) await supabase.auth.signOut();
        setIsAuthenticated(isAdmin);
        setSessionLoading(false);
        return;
      }

      // ΜΕΤΑΒΑΤΙΚΟ fallback: production ΠΡΙΝ το cutover δεν έχει ακόμα auth hook, άρα
      // κανένα `user_role` claim. Κρατάμε προσωρινά την προηγούμενη συμπεριφορά ώστε να
      // μη σπάσει ο ήδη ζωντανός admin. Μόλις ενεργοποιηθεί ο hook (βήμα A5), το claim
      // υπάρχει πάντα και εκτελείται αποκλειστικά το ασφαλές θετικό μονοπάτι παραπάνω.
      const { data: isDriver } = await supabase.from('drivers').select('id').eq('email', session.user.email).maybeSingle();
      const { data: isStore }  = await supabase.from('stores').select('id').eq('email', session.user.email).maybeSingle();

      if (isDriver || isStore) {
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      } else {
        setIsAuthenticated(true);
      }
      setSessionLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      verifyAdminSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setSessionLoading(false);
      } else if (_event === 'SIGNED_IN') {
        verifyAdminSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // ── Loading screen ───────────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div
        className="h-screen w-screen flex flex-col items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mb-5 animate-pulse"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
            boxShadow: '0 8px 24px var(--accent-muted)',
          }}
        >
          V
        </div>
        <p
          className="font-semibold tracking-widest uppercase text-sm"
          style={{ color: 'var(--accent)' }}
        >
          Φόρτωση Συστήματος...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  // ── Nav button style helper ──────────────────────────────────────────────
  const getNavStyle = (tabId) =>
    activeTab === tabId
      ? {
          background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
          color: '#fff',
          boxShadow: '0 2px 8px var(--accent-muted)',
        }
      : {
          background: 'transparent',
          color: 'var(--text-secondary)',
        };

  return (
    <div
      className="flex flex-col md:flex-row h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--bg-primary)', fontFamily: 'Inter, sans-serif' }}
    >
      <Toaster position="bottom-center" theme={isDark ? 'dark' : 'light'} richColors />
      <ConfirmDialogHost />
      {/* ══════════════════════════════
          SIDEBAR
      ══════════════════════════════ */}
      <div
        className={
          'w-full shrink-0 flex flex-col z-10 border-r card-surface sidebar-gold ' +
          'md:transition-[width] md:duration-300 md:ease-out ' +
          (navHidden ? 'md:w-0 md:overflow-hidden md:border-r-0' : 'md:w-64')
        }
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-default)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* ── MOBILE TOP BAR: λογότυπο + 3 βασικές λειτουργίες + «Περισσότερα» ── */}
        <div className="md:hidden relative">
          <div
            className="flex items-center gap-2 px-2 py-2 border-b"
            style={{ borderColor: 'var(--border-default)' }}
          >
            {/* Logo (refresh) — ίδιο ύψος με τα κουμπιά λειτουργιών */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-lg"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', boxShadow: '0 2px 8px var(--accent-muted)' }}
              title="Ανανέωση σελίδας"
            >
              V
            </button>

            <nav className="flex-1 flex items-stretch gap-1.5">
              {NAV_ITEMS.filter(item => MOBILE_PRIMARY_IDS.includes(item.id)).map(({ id, Icon, shortLabel }) => (
                <button
                  key={id}
                  onClick={() => { setActiveTab(id); setMoreOpen(false); }}
                  className="relative flex-1 h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-200"
                  style={getNavStyle(id)}
                >
                  <Icon />
                  {id === 'messages' && <UnreadMessagesBadge />}
                  <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{shortLabel}</span>
                </button>
              ))}

              <button
                onClick={() => setMoreOpen(v => !v)}
                className="relative flex-1 h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-200"
                style={moreOpen || !MOBILE_PRIMARY_IDS.includes(activeTab) ? getNavStyle(activeTab) : getNavStyle(null)}
              >
                <MoreIcon />
                <span className="text-[10px] font-semibold leading-none whitespace-nowrap">Περισσότερα</span>
              </button>
            </nav>
          </div>

          {moreOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
              <div
                className="absolute right-2 top-full mt-1 z-40 w-56 rounded-2xl overflow-hidden p-1.5 card-surface"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  boxShadow: 'var(--shadow-xl)',
                }}
              >
                {NAV_ITEMS.filter(item => !MOBILE_PRIMARY_IDS.includes(item.id)).map(({ id, Icon, fullLabel, shortLabel }) => (
                  <button
                    key={id}
                    onClick={() => { setActiveTab(id); setMoreOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150"
                    style={getNavStyle(id)}
                  >
                    <Icon />
                    <span className="text-sm font-semibold">{fullLabel || shortLabel}</span>
                  </button>
                ))}

                <div className="h-px my-1.5" style={{ backgroundColor: 'var(--border-default)' }} />

                <button
                  onClick={() => { toggleTheme(); setMoreOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {isDark ? <SunIcon /> : <MoonIcon />}
                  <span className="text-sm font-semibold">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                  style={{ color: 'var(--danger)' }}
                >
                  <LogOutIcon />
                  <span className="text-sm font-semibold">Αποσύνδεση</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Brand (desktop only) */}
        <div
          className="hidden md:flex px-5 py-5 items-center justify-between border-b"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-3 cursor-pointer transition-opacity hover:opacity-80 active:opacity-60 text-left"
            title="Ανανέωση σελίδας"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-base"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                boxShadow: '0 2px 8px var(--accent-muted)',
              }}
            >
              V
            </div>
            <div>
              <p
                className="font-bold tracking-widest text-sm leading-none"
                style={{ color: 'var(--text-primary)', letterSpacing: '0.18em' }}
              >
                VERTEX
              </p>
              <p
                className="text-[10px] uppercase tracking-wider mt-0.5 hidden md:block"
                style={{ color: 'var(--text-muted)' }}
              >
                Admin Control
              </p>
            </div>
          </button>

          {/* Μάζεμα του μενού — μόνο στον χάρτη, εκεί που κερδίζει χώρο η δεξιά στήλη */}
          {activeTab === 'map' && (
            <button
              type="button"
              onClick={() => setNavOpenOnMap(false)}
              className="shrink-0 p-1.5 rounded-lg transition-all duration-150"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--accent-muted)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
              title="Απόκρυψη μενού — περισσότερος χώρος για τις παραγγελίες"
            >
              <PanelLeftCloseIcon />
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav className="hidden md:flex md:flex-col p-3 gap-1 md:flex-1">
          {NAV_ITEMS.map(({ id, Icon, shortLabel, fullLabel }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="relative flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-2.5 px-2 md:px-4 rounded-xl transition-all duration-200 min-w-[64px] md:min-w-0 md:w-full text-center md:text-left"
              style={getNavStyle(id)}
              onMouseEnter={e => {
                if (activeTab !== id) {
                  e.currentTarget.style.backgroundColor = 'var(--accent-muted)';
                  e.currentTarget.style.color = 'var(--accent)';
                }
              }}
              onMouseLeave={e => {
                if (activeTab !== id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <span className="relative flex items-center">
                <Icon />
                {id === 'messages' && <UnreadMessagesBadge />}
              </span>
              <span className="text-[10px] md:text-sm font-semibold leading-none">
                <span className="md:hidden">{shortLabel}</span>
                <span className="hidden md:inline">{fullLabel || shortLabel}</span>
              </span>
            </button>
          ))}
        </nav>

        {/* Bottom: theme toggle + profile + logout (desktop only) */}
        <div
          className="hidden md:flex flex-col gap-2 p-3 border-t"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {/* Theme toggle — ίδιο με store-web-app */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl transition-all duration-150"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--accent-muted)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
            title={isDark ? 'Εναλλαγή σε Light Mode' : 'Εναλλαγή σε Dark Mode'}
          >
            {/* Animated icon — ίδιο rotation trick με store-web-app */}
            <div className="relative w-5 h-5">
              <div
                className="absolute inset-0 flex items-center justify-center transition-all duration-300"
                style={{
                  opacity:   isDark ? 1 : 0,
                  transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(-30deg) scale(0.8)',
                }}
              >
                <SunIcon />
              </div>
              <div
                className="absolute inset-0 flex items-center justify-center transition-all duration-300"
                style={{
                  opacity:   isDark ? 0 : 1,
                  transform: isDark ? 'rotate(30deg) scale(0.8)' : 'rotate(0deg) scale(1)',
                }}
              >
                <MoonIcon />
              </div>
            </div>
            <span className="text-sm font-medium">
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>

          {/* Profile + logout */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
              style={{
                backgroundColor: 'var(--success-bg)',
                color: 'var(--success)',
                border: '1px solid var(--success-border)',
              }}
            >
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none truncate" style={{ color: 'var(--text-primary)' }}>
                Admin User
              </p>
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--success)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                Online
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg transition-all duration-150 shrink-0"
              style={{ color: 'var(--danger)' }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--danger-bg)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="Αποσύνδεση"
            >
              <LogOutIcon />
            </button>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════
          MAIN CONTENT
      ══════════════════════════════ */}
      <div
        className="flex-1 overflow-y-auto relative"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <ReadOnlyBanner />
        {/* Ambient glow blobs */}
        <div
          className="fixed top-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full pointer-events-none opacity-30"
          style={{
            background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
            filter: 'blur(100px)',
            zIndex: 0,
          }}
        />
        <div
          className="fixed bottom-[-10%] left-[20%] w-[300px] h-[300px] rounded-full pointer-events-none opacity-10"
          style={{
            background: 'radial-gradient(circle, var(--purple) 0%, transparent 70%)',
            filter: 'blur(100px)',
            zIndex: 0,
          }}
        />

        {/* Ο χάρτης θέλει όλο τον χώρο (full-bleed)· οι υπόλοιπες καρτέλες κρατούν το padding */}
        <div className={activeTab === 'map' ? 'relative z-[1] h-full' : 'relative z-[1] p-4 md:p-8 min-h-full'}>
          {/* Μόνιμα mounted: κρύβεται με CSS αντί να ξηλώνεται, ώστε να μη χάνει θέση/zoom
              και να μην ξανατρέχει fetch+subscriptions κάθε φορά που φεύγεις απ' την καρτέλα. */}
          <div className={activeTab === 'map' ? 'h-full' : 'hidden'}>
            <LiveMap navHidden={navHidden} />
          </div>

          {/* Κουμπί «Μενού»: το μόνο που μένει ορατό όταν η μπάρα είναι μαζεμένη.
              Κάθεται πάνω στην πάνω-αριστερή γωνία του χάρτη (το zoom control ζει
              κάτω αριστερά, οπότε δεν πατάει τίποτα). */}
          {navHidden && (
            <button
              type="button"
              onClick={() => setNavOpenOnMap(true)}
              className="hidden md:flex absolute top-3 left-3 z-[1100] w-11 h-11 rounded-xl items-center justify-center transition-transform duration-150 hover:scale-105 active:scale-95"
              // Ίδιο χρυσό και ίδιο μαύρο μελάνι με το `.sidebar-gold`: το κουμπί
              // διαβάζεται ως «κομμάτι του μενού που ξεπροβάλλει». Άσπρο εικονίδιο
              // πάνω στο χρυσό έπιανε μόλις 2.2:1 — το μαύρο μελάνι πιάνει 7.0:1.
              style={{
                background: '#C5A066',
                color: '#1E1A14',
                boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
              }}
              title="Άνοιγμα μενού"
              aria-label="Άνοιγμα μενού"
            >
              <MenuIcon />
            </button>
          )}
          {activeTab !== 'map' && (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {VIEW_COMPONENTS[activeTab]}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
