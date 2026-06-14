import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import BillingDashboard from './BillingDashboard';
import LiveMap from './LiveMap';
import StoreManagement from './StoreManagement';
import Statistics from './Statistics';
import CreateOrder from './CreateOrder';
import Login from './Login'; // Προσθήκη Login component

const NAV_ITEMS = [
  { id: 'map', icon: '🗺️', shortLabel: 'Χάρτης', fullLabel: 'Live Χάρτης' },
  { id: 'create-order', icon: '➕', shortLabel: 'Νέα Παρ.', fullLabel: 'Νέα Παραγγελία' },
  { id: 'billing', icon: '📊', shortLabel: 'Εκκαθάριση' },
  { id: 'stores', icon: '🏢', shortLabel: 'Διαχείρηση' },
  { id: 'stats', icon: '📈', shortLabel: 'Στατιστικά' },
];

const VIEW_COMPONENTS = {
  'map': <LiveMap />,
  'create-order': <CreateOrder />,
  'billing': <BillingDashboard />,
  'stores': <StoreManagement />,
  'stats': <Statistics />
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('map');

  useEffect(() => {
    const verifyAdminSession = async (session) => {
      if (!session) {
        setIsAuthenticated(false);
        setSessionLoading(false);
        return;
      }

      // Έλεγχος ασφαλείας: Αν ο χρήστης υπάρχει στους διανομείς ή στα καταστήματα, τον πετάμε.
      const { data: isDriver } = await supabase.from('drivers').select('id').eq('email', session.user.email).maybeSingle();
      const { data: isStore } = await supabase.from('stores').select('id').eq('email', session.user.email).maybeSingle();

      if (isDriver || isStore) {
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      } else {
        setIsAuthenticated(true);
      }
      setSessionLoading(false);
    };

    // Έλεγχος υπάρχοντος session κατά την αρχική φόρτωση
    supabase.auth.getSession().then(({ data: { session } }) => {
      verifyAdminSession(session);
    });

    // Ακρόαση για αλλαγές στο Auth state (login, logout)
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
  
  const btnBaseClass = "flex flex-1 md:w-full flex-col md:flex-row items-center justify-center md:justify-start py-2 px-1 md:px-5 md:py-3.5 mb-0 md:mb-2 rounded-xl cursor-pointer transition-all duration-200 border-none md:gap-3";
  
  const getBtnClass = (tabName) => {
    return activeTab === tabName
      ? `${btnBaseClass} bg-blue-500 text-white shadow-md shadow-blue-500/30`
      : `${btnBaseClass} bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200`;
  };

  if (sessionLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-sky-50">
        <div className="animate-spin text-4xl mb-4">🛵</div>
        <p className="text-slate-500 font-medium">Φόρτωση...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen font-sans bg-sky-50 overflow-hidden">
      
      {/* --- ΜΕΝΟΥ --- */}
      <div className="w-full md:w-72 h-auto md:h-screen bg-slate-900 text-white flex flex-col p-2 pb-0 md:p-6 shadow-xl z-10 shrink-0">
        
        {/* Λογότυπο */}
        <div className="mb-2 md:mb-12 mt-1 md:mt-0 text-center md:text-left flex justify-between md:block items-center">
          <div>
            <h1 className="m-0 text-lg md:text-2xl text-emerald-400 tracking-wide font-bold">
              🛵 Delivery<span className="text-white">Admin</span>
            </h1>
            <p className="hidden md:block m-0 mt-1 text-xs text-slate-400">Κέντρο Ελέγχου Στόλου</p>
          </div>
          <button 
            onClick={handleLogout}
            className="md:hidden bg-slate-800 text-slate-300 px-3 py-1 rounded-lg text-xs font-bold"
          >
            Αποσύνδεση
          </button>
        </div>

        {/* Κουμπιά Πλοήγησης */}
        <nav className="flex flex-row md:flex-col justify-between w-full gap-1 md:gap-0 pb-2 md:pb-0 overflow-x-auto md:overflow-visible">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={getBtnClass(item.id)}>
              <span className="text-2xl md:text-lg mb-1 md:mb-0">{item.icon}</span>
              <span className="text-[10px] md:text-base font-semibold leading-none tracking-tight">
                {item.fullLabel ? (
                  <>
                    <span className="md:hidden">{item.shortLabel}</span>
                    <span className="hidden md:inline">{item.fullLabel}</span>
                  </>
                ) : (
                  item.shortLabel
                )}
              </span>
            </button>
          ))}
        </nav>

        {/* Προφίλ - Μόνο στο PC */}
        <div className="hidden md:flex mt-auto border-t border-slate-700 pt-5 items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex justify-center items-center font-bold text-white">
              A
            </div>
            <div>
              <p className="m-0 text-sm font-bold text-white">Admin User</p>
              <p className="m-0 text-xs text-slate-400">Online</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            title="Αποσύνδεση"
          >
            ⏏
          </button>
        </div>
      </div>

      {/* --- ΔΕΞΙΟ ΠΕΡΙΕΧΟΜΕΝΟ --- */}
      <div className="flex-1 overflow-y-auto p-3 md:p-8 bg-sky-50 md:bg-sky-100">
        <div className="bg-transparent md:rounded-3xl min-h-[calc(100vh-100px)] md:min-h-[calc(100vh-64px)]">
          {VIEW_COMPONENTS[activeTab]}
        </div>
      </div>

    </div>
  );
}
