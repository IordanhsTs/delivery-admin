import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useTheme } from './ThemeContext.jsx';
import BillingDashboard from './BillingDashboard';
import LiveMap from './LiveMap';
import StoreManagement from './StoreManagement';
import Statistics from './Statistics';
import CreateOrder from './CreateOrder';
import Messages from './Messages';
import Login from './Login';
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

const NAV_ITEMS = [
  { id: 'map',          Icon: MapIcon,      shortLabel: 'Χάρτης',     fullLabel: 'Live Χάρτης' },
  { id: 'create-order', Icon: PlusIcon,     shortLabel: 'Νέα Παρ.',   fullLabel: 'Νέα Παραγγελία' },
  { id: 'messages',     Icon: MessageSquareIcon, shortLabel: 'Μηνύματα', fullLabel: 'Μηνύματα' },
  { id: 'billing',      Icon: ReceiptIcon,  shortLabel: 'Εκκαθάριση', fullLabel: 'Εκκαθάριση' },
  { id: 'stores',       Icon: BuildingIcon, shortLabel: 'Διαχείριση', fullLabel: 'Διαχείριση' },
  { id: 'stats',        Icon: BarChartIcon, shortLabel: 'Στατιστικά', fullLabel: 'Στατιστικά' },
];

const VIEW_COMPONENTS = {
  'map':          <LiveMap />,
  'create-order': <CreateOrder />,
  'messages':     <Messages />,
  'billing':      <BillingDashboard />,
  'stores':       <StoreManagement />,
  'stats':        <Statistics />,
};

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('map');

  const isDark = theme === 'dark';

  useEffect(() => {
    const verifyAdminSession = async (session) => {
      if (!session) {
        setIsAuthenticated(false);
        setSessionLoading(false);
        return;
      }
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
      <Toaster position="top-right" theme={isDark ? 'dark' : 'light'} richColors />
      {/* ══════════════════════════════
          SIDEBAR
      ══════════════════════════════ */}
      <div
        className="w-full md:w-64 shrink-0 flex flex-col z-10 border-r"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border-default)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Brand */}
        <div
          className="px-5 py-5 flex items-center justify-between border-b"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="flex items-center gap-3">
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
          </div>

          {/* Mobile logout */}
          <button
            onClick={handleLogout}
            className="md:hidden p-2 rounded-lg transition-all duration-150"
            style={{ color: 'var(--danger)' }}
            title="Αποσύνδεση"
          >
            <LogOutIcon />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-row md:flex-col p-2 md:p-3 gap-1 overflow-x-auto md:overflow-visible md:flex-1">
          {NAV_ITEMS.map(({ id, Icon, shortLabel, fullLabel }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-2.5 px-2 md:px-4 rounded-xl transition-all duration-200 min-w-[64px] md:min-w-0 md:w-full text-center md:text-left"
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
              <Icon />
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

        {/* Mobile theme toggle (bottom bar) */}
        <div
          className="flex md:hidden justify-end px-2 py-1.5 border-t"
          style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-all duration-150"
            style={{ color: 'var(--text-muted)' }}
            title={isDark ? 'Light Mode' : 'Dark Mode'}
          >
            <div className="relative w-5 h-5">
              <div
                className="absolute inset-0 flex items-center justify-center transition-all duration-300"
                style={{ opacity: isDark ? 1 : 0, transform: isDark ? 'rotate(0deg)' : 'rotate(-30deg) scale(0.8)' }}
              >
                <SunIcon />
              </div>
              <div
                className="absolute inset-0 flex items-center justify-center transition-all duration-300"
                style={{ opacity: isDark ? 0 : 1, transform: isDark ? 'rotate(30deg) scale(0.8)' : 'rotate(0deg)' }}
              >
                <MoonIcon />
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════
          MAIN CONTENT
      ══════════════════════════════ */}
      <div
        className="flex-1 overflow-y-auto relative"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
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

        <div className="relative z-[1] p-4 md:p-8 min-h-full">
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
        </div>
      </div>
    </div>
  );
}
