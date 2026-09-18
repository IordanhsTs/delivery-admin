import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { ThemeProvider, useTheme } from '../src/ThemeContext.jsx';

// ── Πρωτότυπο πλοήγησης (18/09/2026) ────────────────────────────────────────
// ΜΟΝΟ για να δει ο πελάτης/χρήστης πώς θα ένιωθε η αναδιοργάνωση σε 5
// κατηγορίες. Δεν συνδέεται με supabase, δεν δείχνει πραγματικό περιεχόμενο —
// κάθε οθόνη είναι μια κάρτα με τίτλο + περιγραφή. Ο σκελετός (χρώματα,
// τυπογραφία, δομή sidebar/mobile bar) είναι αντιγραμμένος από το src/App.jsx
// ώστε η αίσθηση να είναι ακριβώς αυτή του πραγματικού admin.

// ── Εικονίδια (ίδιο σύνολο με το App.jsx + 3 καινούρια για τις νέες κατηγορίες) ──
const MapIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
);
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);
const ReceiptIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>
  </svg>
);
const FuelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>
  </svg>
);
const BuildingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>
  </svg>
);
const BarChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);
const MessageSquareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>
  </svg>
);
const MegaphoneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
  </svg>
);
const BikeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
  </svg>
);
const WalletIcon = () => <Wallet size={20} />;
const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </svg>
);
const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
  </svg>
);
const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
// Νέα, για τις 3 ομαδοποιημένες κατηγορίες.
const ZapIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const GearIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const EuroIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10h12"/><path d="M4 14h9"/><path d="M17 5.32a7.57 7.57 0 0 0-1-.32C11.5 5 9 7.5 9 12s2.5 7 7 6.68a7.57 7.57 0 0 0 1-.32"/>
  </svg>
);

// ── Η προτεινόμενη δομή: 5 κατηγορίες, 3 από αυτές ομαδοποιούν παλιά tabs ──
const NAV = [
  { id: 'map', label: 'Live Χάρτης', Icon: MapIcon },
  {
    id: 'actions', label: 'Ενέργειες', Icon: ZapIcon,
    children: [
      { id: 'create-order', label: 'Νέα Παραγγελία', Icon: PlusIcon },
      { id: 'messages', label: 'Μηνύματα', Icon: MessageSquareIcon },
    ],
  },
  { id: 'stats', label: 'Στατιστικά', Icon: BarChartIcon, mergedHint: 'Αναζήτηση' },
  {
    id: 'operations', label: 'Λειτουργία', Icon: GearIcon,
    children: [
      { id: 'stores', label: 'Διαχείριση', Icon: BuildingIcon },
      { id: 'announcements', label: 'Ανακοινώσεις', Icon: MegaphoneIcon },
      { id: 'fleet', label: 'Στόλος μηχανών', Icon: BikeIcon },
      { id: 'schedule', label: 'Πρόγραμμα εβδομάδας', Icon: CalendarIcon },
    ],
  },
  {
    // Το Ταμείο μετακόμισε εδώ (αίτημα χρήστη 18/09/2026) — είναι κίνηση
    // μετρητών, πιο κοντά στην Εκκαθάριση/Καύσιμα παρά στη ρύθμιση λειτουργίας.
    id: 'finance', label: 'Οικονομικά', Icon: EuroIcon,
    children: [
      { id: 'billing', label: 'Εκκαθάριση', Icon: ReceiptIcon },
      { id: 'cash-float', label: 'Ταμείο', Icon: WalletIcon },
      { id: 'fuel', label: 'Χιλιόμετρα & Καύσιμα', Icon: FuelIcon },
    ],
  },
];

const DESCRIPTIONS = {
  map: 'Μένει ακριβώς όπως είναι σήμερα — ζωντανός χάρτης με διανομείς και δεξιά στήλη με ενεργές παραγγελίες.',
  'create-order': 'Φόρμα νέας παραγγελίας: κατάστημα, διεύθυνση με προτεινόμενες οδούς, τρόπος πληρωμής.',
  messages: 'Συνομιλίες με καταστήματα, με κόκκινη κουκκίδα αδιάβαστων.',
  stats: 'Οι σημερινές κάρτες KPI + το αναλυτικό ιστορικό, ΚΑΙ ένα δεύτερο tab μέσα στην ίδια οθόνη για την Αναζήτηση (εκκρεμείς/ακυρωμένες παραγγελίες).',
  stores: 'Κάρτες καταστημάτων και διανομέων — ενεργοποίηση/απενεργοποίηση, στοιχεία επικοινωνίας.',
  announcements: 'Ανακοίνωση διανομέα προς όλους τους συναδέλφους.',
  fleet: 'Στόλος εταιρικών μηχανών — ποιος έχει πάρει μηχανάκι σήμερα.',
  'cash-float': 'Ταμείο διανομέων — μετρητά που παρέλαβαν, καύσιμα, εκκρεμείς/διακανονισμένες κινήσεις.',
  schedule: 'Πρόγραμμα εβδομάδας — διαθεσιμότητα διανομέων ανά ημέρα.',
  billing: 'Οικονομική εκκαθάριση ανά διανομέα και κατάστημα, με γραφήματα.',
  fuel: 'Χιλιόμετρα βάρδιας ανά διανομέα και υπολογισμός χρέωσης καυσίμου.',
};

// Όλα τα «φύλλα» (ό,τι αντιστοιχεί σε πραγματική οθόνη) σε μία επίπεδη λίστα —
// βολεύει το εύρεσε-τον-γονιό και το περιεχόμενο.
const LEAVES = NAV.flatMap((n) => (n.children ? n.children : [n]));
const findParent = (childId) => NAV.find((n) => n.children?.some((c) => c.id === childId));

function NavMockupInner() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [active, setActive] = useState('map');
  // 'actions' ξεκινά ανοιχτή για να φανεί αμέσως τι κρύβει (desktop accordion).
  const [expanded, setExpanded] = useState({ actions: true });
  // Ποιο group-κουμπί είναι ανοιχτό στο ΚΙΝΗΤΟ (μία μικρή λίστα κάτω από τη
  // μπάρα, όχι ολόκληρο «Περισσότερα» — μόνο 5 κατηγορίες χωράνε πλέον
  // απευθείας στην μπάρα, δεν χρειάζεται ξεχωριστό overflow μενού).
  const [mobileOpenGroup, setMobileOpenGroup] = useState(null);
  // Toggle μέσα στην οθόνη «Στατιστικά» (αίτημα χρήστη 18/09/2026): η
  // Αναζήτηση δεν χάνεται, γίνεται δεύτερο tab ΜΕΣΑ στην ίδια οθόνη — εδώ
  // δείχνουμε ποιο από τα δύο είναι επιλεγμένο.
  const [statsSubTab, setStatsSubTab] = useState('analytics');

  const select = (id) => {
    setActive(id);
    const parent = findParent(id);
    if (parent) setExpanded((e) => ({ ...e, [parent.id]: true }));
    setMobileOpenGroup(null);
    if (id !== 'stats') setStatsSubTab('analytics');
  };

  const toggleExpand = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const toggleMobileGroup = (id) => setMobileOpenGroup((g) => (g === id ? null : id));

  const getStyle = (id) =>
    active === id
      ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff', boxShadow: '0 2px 8px var(--accent-muted)' }
      : { background: 'transparent', color: 'var(--text-secondary)' };

  const activeLeaf = LEAVES.find((l) => l.id === active);
  const activeParent = findParent(active);

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', fontFamily: 'Inter, sans-serif' }}>
      {/* ══════════════ SIDEBAR ══════════════ */}
      <div
        className="w-full shrink-0 flex flex-col z-10 border-r card-surface sidebar-gold md:w-72"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-sm)' }}
      >
        {/* ── MOBILE: λογότυπο + ΟΛΕΣ οι 5 κατηγορίες απευθείας στη μπάρα ──
            Χωρίς «Περισσότερα»: 5 κατηγορίες (κάτω από τις παλιές 11) χωράνε
            πλέον μία-μία. Οι 3 με παιδιά (Ενέργειες/Λειτουργία/Οικονομικά)
            ανοίγουν μια μικρή λίστα ΚΑΤΩ από τη μπάρα αντί για ξεχωριστό
            μενού πάνω δεξιά. */}
        <div className="md:hidden relative">
          <div className="flex items-center gap-1 px-1.5 py-2 border-b" style={{ borderColor: 'var(--border-default)' }}>
            <div
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-base"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', boxShadow: '0 2px 8px var(--accent-muted)' }}
            >V</div>

            <nav className="flex-1 flex items-stretch gap-1">
              {NAV.map((n) => {
                // Ομάδα: γεμάτο χρυσό μόνο όσο η λίστα παιδιών είναι ανοιχτή·
                // αχνό χρυσό όταν είναι κλειστή αλλά η ενεργή οθόνη ανήκει σε
                // αυτήν (ώστε να ξέρεις «είσαι εδώ» και με τη λίστα κλειστή).
                // Φύλλο (Χάρτης/Στατιστικά): ίδιο γεμάτο χρυσό με το desktop.
                let style;
                if (n.children) {
                  style = mobileOpenGroup === n.id
                    ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff', boxShadow: '0 2px 8px var(--accent-muted)' }
                    : findParent(active)?.id === n.id
                      ? { background: 'var(--accent-muted)', color: 'var(--accent)' }
                      : { background: 'transparent', color: 'var(--text-secondary)' };
                } else {
                  style = getStyle(n.id);
                }
                return (
                  <button
                    key={n.id}
                    onClick={() => (n.children ? toggleMobileGroup(n.id) : select(n.id))}
                    className="relative flex-1 h-11 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-200 px-0.5"
                    style={style}
                  >
                    <n.Icon />
                    <span className="text-[9px] font-semibold leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                      {n.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Θέμα (light/dark) — δεν είναι κατηγορία περιεχομένου, οπότε
                μένει εκτός της βασικής μπάρας πλοήγησης, σε δικό του κουμπί. */}
            <button
              onClick={toggleTheme}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
              style={{ color: 'var(--text-muted)' }}
              title={isDark ? 'Light Mode' : 'Dark Mode'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>

          {/* Μικρή λίστα με τα παιδιά ΤΗΣ ανοιχτής κατηγορίας — όχι ολόκληρο
              «Περισσότερα» με όλες τις κατηγορίες μαζί, αφού οι κατηγορίες
              είναι πια ήδη ορατές στη μπάρα. */}
          {mobileOpenGroup && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMobileOpenGroup(null)} />
              <div className="absolute left-2 right-2 top-full mt-1 z-40 rounded-2xl overflow-hidden p-1.5 card-surface" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xl)' }}>
                {NAV.find((n) => n.id === mobileOpenGroup)?.children.map((c) => (
                  <button key={c.id} onClick={() => select(c.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150" style={getStyle(c.id)}>
                    <c.Icon />
                    <span className="text-sm font-semibold">{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Brand (desktop only) */}
        <div className="hidden md:flex px-5 py-5 items-center gap-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-base" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', boxShadow: '0 2px 8px var(--accent-muted)' }}>V</div>
          <div>
            <p className="font-bold tracking-widest text-sm leading-none" style={{ color: 'var(--text-primary)', letterSpacing: '0.18em' }}>VERTEX</p>
            <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>Πρωτότυπο πλοήγησης</p>
          </div>
        </div>

        {/* ── DESKTOP NAV: 5 κατηγορίες, 3 με ανοιγόμενα παιδιά ── */}
        <nav className="hidden md:flex md:flex-col p-3 gap-1 md:flex-1 overflow-y-auto">
          {NAV.map((n) => (
            <div key={n.id}>
              {n.children ? (
                <>
                  <button
                    onClick={() => toggleExpand(n.id)}
                    className="w-full flex items-center gap-3 py-2.5 px-4 rounded-xl transition-all duration-200 text-left"
                    style={activeParent?.id === n.id ? { background: 'var(--accent-muted)', color: 'var(--accent)' } : { background: 'transparent', color: 'var(--text-secondary)' }}
                  >
                    <n.Icon />
                    <span className="text-sm font-semibold flex-1">{n.label}</span>
                    <span style={{ transform: expanded[n.id] ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><ChevronDownIcon /></span>
                  </button>
                  {expanded[n.id] && (
                    <div className="pl-4 mt-0.5 mb-1 flex flex-col gap-0.5 border-l ml-6" style={{ borderColor: 'var(--border-default)' }}>
                      {n.children.map((c) => (
                        <button key={c.id} onClick={() => select(c.id)} className="flex items-center gap-3 py-2 px-3 rounded-xl transition-all duration-150 text-left" style={getStyle(c.id)}>
                          <c.Icon />
                          <span className="text-sm font-medium">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <button onClick={() => select(n.id)} className="w-full flex items-center gap-3 py-2.5 px-4 rounded-xl transition-all duration-200 text-left" style={getStyle(n.id)}>
                  <n.Icon />
                  <span className="text-sm font-semibold">{n.label}</span>
                </button>
              )}
            </div>
          ))}
        </nav>

        <div className="hidden md:flex flex-col gap-2 p-3 border-t" style={{ borderColor: 'var(--border-default)' }}>
          <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl transition-all duration-150" style={{ color: 'var(--text-muted)' }}>
            {isDark ? <SunIcon /> : <MoonIcon />}
            <span className="text-sm font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </div>

      {/* ══════════════ ΠΕΡΙΕΧΟΜΕΝΟ (placeholder — όχι πραγματική οθόνη) ══════════════ */}
      <div className="flex-1 overflow-y-auto relative p-6 md:p-10" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--text-muted)' }}>
            {activeParent ? `${activeParent.label} · ` : ''}Πλοήγηση
          </p>
          <div className="card-glass backdrop-blur-md p-6 md:p-8 rounded-2xl border shadow-[0_8px_30px_rgba(0,0,0,0.15)]" style={{ borderColor: 'var(--border-default)' }}>
            <div className="flex items-center gap-3 mb-3" style={{ color: 'var(--accent)' }}>
              {activeLeaf && <activeLeaf.Icon />}
              <h2 className="m-0 text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{activeLeaf?.label}</h2>
            </div>
            {active === 'stats' ? (
              <>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setStatsSubTab('analytics')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={statsSubTab === 'analytics' ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    Αναλυτικά
                  </button>
                  <button
                    onClick={() => setStatsSubTab('search')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                    style={statsSubTab === 'search' ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    <SearchIcon /> Αναζήτηση
                  </button>
                </div>
                <p className="m-0 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {statsSubTab === 'analytics'
                    ? 'Οι σημερινές κάρτες KPI + το αναλυτικό ιστορικό ολοκληρωμένων παραγγελιών, με φίλτρα καταστήματος/διανομέα/διαστήματος.'
                    : 'Η σημερινή Αναζήτηση, αμετάβλητη: βρίσκει ΟΠΟΙΑΔΗΠΟΤΕ παραγγελία (και εκκρεμή, και ακυρωμένη) με λέξη-κλειδί ή διάστημα — για να εντοπίσεις γρήγορα μία συγκεκριμένη παραγγελία, όχι για μετρήσεις απόδοσης.'}
                </p>
              </>
            ) : (
              <p className="m-0 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{DESCRIPTIONS[active]}</p>
            )}
          </div>

          <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
            Πάτα στα στοιχεία του μενού αριστερά (ή στις κατηγορίες πάνω στο κινητό) για να δεις πώς ανοίγουν οι 3 ομαδοποιημένες κατηγορίες.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NavMockup() {
  return (
    <ThemeProvider>
      <NavMockupInner />
    </ThemeProvider>
  );
}
