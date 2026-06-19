import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Statistics() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // Νέο state για το ιστορικό
  
  // Λίστες για τα Dropdowns των Φίλτρων
  const [storesList, setStoresList] = useState([]);
  const [driversList, setDriversList] = useState([]);

  // Επιλεγμένα Φίλτρα
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');

  // Βοηθητική συνάρτηση για το format YYYY-MM-DDTHH:mm
  const formatDateTimeLocal = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  const [startDate, setStartDate] = useState(formatDateTimeLocal(lastWeek));
  const [endDate, setEndDate] = useState(formatDateTimeLocal(today));

  useEffect(() => {
    const fetchFilters = async () => {
      const [storesRes, driversRes] = await Promise.all([
        supabase.from('stores').select('id, name').order('name'),
        supabase.from('drivers').select('id, full_name').order('full_name')
      ]);
      
      if (storesRes.data) setStoresList(storesRes.data);
      if (driversRes.data) setDriversList(driversRes.data);
    };
    
    fetchFilters();
    fetchStats(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setShowHistory(false); // Κρύβουμε το ιστορικό σε κάθε νέα αναζήτηση
    
    const startIso = new Date(startDate).toISOString();
    const endIso = new Date(endDate).toISOString();

    // Προσθέσαμε το "address" στο select για να φαίνεται στο ιστορικό
    let query = supabase
      .from('orders')
      .select('id, created_at, accepted_at, completed_at, status, address, store_id, driver_id, stores ( name ), drivers ( full_name )')
      .eq('status', 'completed')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('completed_at', { ascending: false }); // Τα πιο πρόσφατα πρώτα

    if (selectedStore) query = query.eq('store_id', selectedStore);
    if (selectedDriver) query = query.eq('driver_id', selectedDriver);

    const { data, error } = await query;

    if (data) setOrders(data);
    if (error) console.error("Σφάλμα:", error);
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
        const mins = Math.floor((tComplete - tCreate) / 60000);
        
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
    <div className="font-sans text-slate-200">
      <div className="mb-6">
        <h2 className="m-0 mb-1 text-[#C5A066] text-xl font-bold drop-shadow-[0_0_8px_rgba(197,160,102,0.5)] tracking-wide">📈 Στατιστικά & Απόδοση</h2>
        <p className="m-0 text-slate-400 text-sm">Ανάλυση χρόνων παράδοσης με δυνατότητα εξειδικευμένου φιλτραρίσματος.</p>
      </div>

      {/* Πίνακας Ελέγχου (Φίλτρα) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8 bg-[#1A1A1A]/90 backdrop-blur-md p-4 md:p-5 rounded-2xl border border-[#C5A066]/40 items-end shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        
        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Από</label>
          <input 
            type="datetime-local" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 bg-[#050505] text-slate-200 transition-colors text-sm"
          />
        </div>
        
        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Έως</label>
          <input 
            type="datetime-local" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 bg-[#050505] text-slate-200 transition-colors text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Κατάστημα</label>
          <select 
            value={selectedStore} 
            onChange={e => setSelectedStore(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 bg-[#050505] text-slate-200 transition-colors text-sm cursor-pointer"
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
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 bg-[#050505] text-slate-200 transition-colors text-sm cursor-pointer"
          >
            <option value="">Όλοι οι διανομείς</option>
            {driversList.map(driver => (
              <option key={driver.id} value={driver.id}>{driver.full_name}</option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-1 flex justify-center lg:justify-end">
          <button 
            onClick={fetchStats} 
            disabled={loading} 
            className="w-full sm:w-auto px-8 lg:px-6 py-2.5 bg-[#050505] text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] rounded-xl cursor-pointer font-bold transition-all disabled:opacity-50 h-[42px] flex items-center justify-center gap-2"
          >
            {loading ? 'Φόρτωση...' : '🔄 Ανανέωση'}
          </button>
        </div>

      </div>

      {orders.length > 0 ? (
        <div className="animate-fade-in">
          {/* Κάρτες KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8">
            <div className="p-6 bg-[#1A1A1A]/90 backdrop-blur-md border border-[#38EF7D]/40 rounded-2xl text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] relative overflow-hidden">
              <h3 className="m-0 mb-2 text-[#38EF7D] text-base font-bold relative z-10 drop-shadow-[0_0_5px_rgba(56,239,125,0.5)]">⏱️ Μέσος Χρόνος Παράδοσης</h3>
              <p className="m-0 text-4xl font-black text-slate-100 relative z-10">{kpis.avgTime} <span className="text-xl font-bold text-slate-300">λεπτά</span></p>
              <small className="text-slate-400 block mt-2 font-medium relative z-10">Από τη δημιουργία έως την πόρτα</small>
            </div>
            <div className="p-6 bg-[#1A1A1A]/90 backdrop-blur-md border border-[#9D4EDD]/40 rounded-2xl text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] relative overflow-hidden">
              <h3 className="m-0 mb-2 text-[#9D4EDD] text-base font-bold relative z-10 drop-shadow-[0_0_5px_rgba(157,78,221,0.5)]">📦 Συνολικές Παραδόσεις</h3>
              <p className="m-0 text-4xl font-black text-slate-100 relative z-10">{kpis.totalOrders}</p>
              <small className="text-slate-400 block mt-2 font-medium relative z-10">Ολοκληρωμένες στο διάστημα</small>
            </div>
          </div>

          {/* Λίστες Ανάλυσης */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            
            {/* Top Καταστήματα */}
            <div>
              <h4 className="text-[#C5A066] mb-4 font-bold text-lg drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">🏆 {selectedStore ? 'Επιλεγμένο Κατάστημα' : 'Top Καταστήματα (Όγκος)'}</h4>
              <div className="bg-[#1A1A1A]/90 backdrop-blur-md rounded-xl border border-[#C5A066]/40 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                {kpis.sortedStores.length > 0 ? kpis.sortedStores.map(([store, count], index) => (
                  <div 
                    key={store} 
                    className={`flex justify-between items-center p-3 md:px-4 md:py-3 ${index !== kpis.sortedStores.length - 1 ? 'border-b border-[#C5A066]/10' : ''} ${index === 0 && !selectedStore ? 'bg-[#C5A066]/10 rounded-lg' : 'hover:bg-[#252525] transition-colors'}`}
                  >
                    <span className={`text-slate-200 ${index === 0 && !selectedStore ? 'font-bold text-[#C5A066]' : ''}`}>
                      {selectedStore ? store : `${index + 1}. ${store}`}
                    </span>
                    <span className="font-bold text-[#C5A066] bg-[#C5A066]/10 border border-[#C5A066]/30 px-2.5 py-1 rounded-full text-xs whitespace-nowrap">
                      {count} παρ.
                    </span>
                  </div>
                )) : (
                  <div className="p-4 text-center text-slate-400 text-sm italic">Δεν υπάρχουν δεδομένα</div>
                )}
              </div>
            </div>

            {/* Επίδοση Διανομέων */}
            <div>
              <h4 className="text-[#C5A066] mb-4 font-bold text-lg drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">🛵 {selectedDriver ? 'Επίδοση Επιλεγμένου Διανομέα' : 'Επίδοση Διανομέων (Χρόνοι)'}</h4>
              <div className="bg-[#1A1A1A]/90 backdrop-blur-md rounded-xl border border-[#C5A066]/40 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                {kpis.sortedDrivers.length > 0 ? kpis.sortedDrivers.map((driver, index) => (
                  <div 
                    key={driver.name} 
                    className={`flex justify-between items-center p-3 md:px-4 md:py-3 ${index !== kpis.sortedDrivers.length - 1 ? 'border-b border-[#C5A066]/10' : ''} hover:bg-[#252525] transition-colors`}
                  >
                    <span className="text-slate-200">
                      {selectedDriver ? <b>{driver.name}</b> : <>{index + 1}. <b>{driver.name}</b></>} 
                      <span className="text-slate-400 text-xs ml-1">({driver.deliveries} παρ.)</span>
                    </span>
                    <span className={`font-bold border px-2.5 py-1 rounded-full text-xs whitespace-nowrap ${driver.avg < 15 ? 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10' : (driver.avg > 25 ? 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10' : 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10')}`}>
                      {driver.avg} λ.
                    </span>
                  </div>
                )) : (
                  <div className="p-4 text-center text-slate-400 text-sm italic">Δεν υπάρχουν δεδομένα</div>
                )}
              </div>
            </div>
            
          </div>

          {/* Κουμπί Εμφάνισης/Απόκρυψης Ιστορικού */}
          <div className="border-t border-[#C5A066]/30 pt-8 pb-4 text-center">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="bg-[#050505] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] text-[#C5A066] font-bold py-3 px-6 rounded-xl cursor-pointer transition-all"
            >
              {showHistory ? '🔼 Απόκρυψη Ιστορικού' : '📄 Προβολή Αναλυτικού Ιστορικού'}
            </button>
          </div>

          {/* Αναλυτικό Ιστορικό Παραγγελιών */}
          {showHistory && (
            <div className="animate-fade-in bg-[#1A1A1A]/90 backdrop-blur-md rounded-2xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden mt-2">
              <div className="bg-[#111111] border-b border-[#C5A066]/40 p-4">
                <h4 className="m-0 text-[#C5A066] font-bold drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">Αναλυτικές Παραγγελίες ({orders.length})</h4>
              </div>
              
              {/* Desktop Table (Hidden on mobile) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#111111] text-slate-400 text-xs uppercase tracking-wider border-b border-[#C5A066]/40">
                      <th className="p-4 font-bold">Ημερ/νια</th>
                      <th className="p-4 font-bold">Κατάστημα & Διεύθυνση</th>
                      <th className="p-4 font-bold">Διανομέας</th>
                      <th className="p-4 font-bold text-center">Χρόνος (Λεπτά)</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-[#C5A066]/10">
                    {orders.map(order => {
                      const mins = order.created_at && order.completed_at 
                        ? Math.floor((new Date(order.completed_at) - new Date(order.created_at)) / 60000) 
                        : '-';
                      
                      return (
                        <tr key={order.id} className="hover:bg-[#252525] transition-colors">
                          <td className="p-4 text-slate-400">
                            <div className="font-bold">{formatDate(order.created_at)}</div>
                            <div className="text-xs">{formatTime(order.created_at)}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-200">{order.stores?.name}</div>
                            <div className="text-slate-500 text-xs mt-0.5">📍 <span className="text-slate-400">{order.address || 'Μη διαθέσιμη διεύθυνση'}</span></div>
                          </td>
                          <td className="p-4 text-slate-300 font-medium">
                            {order.drivers?.full_name}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-block border px-2.5 py-1 rounded-full text-xs font-bold ${mins < 15 ? 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10' : (mins > 25 ? 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10' : 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10')}`}>
                              {mins} λ.
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile List (Hidden on desktop) */}
              <div className="md:hidden flex flex-col divide-y divide-[#C5A066]/10">
                {orders.map(order => {
                  const mins = order.created_at && order.completed_at 
                    ? Math.floor((new Date(order.completed_at) - new Date(order.created_at)) / 60000) 
                    : '-';
                  
                  return (
                    <div key={order.id} className="p-4 hover:bg-[#252525]">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-slate-200 text-[15px]">{order.stores?.name}</div>
                        <span className={`border px-2 py-0.5 rounded text-[11px] font-bold ${mins < 15 ? 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10' : (mins > 25 ? 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10' : 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10')}`}>
                          {mins} λεπτά
                        </span>
                      </div>
                      <div className="text-slate-400 text-sm mb-2">📍 {order.address || 'Μη διαθέσιμη διεύθυνση'}</div>
                      <div className="flex justify-between items-center text-xs text-slate-500 pt-2 border-t border-[#C5A066]/10">
                        <span>👤 {order.drivers?.full_name}</span>
                        <span>🗓️ {formatDate(order.created_at)} {formatTime(order.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </div>
      ) : (
        <div className="bg-[#1A1A1A]/90 backdrop-blur-md p-8 rounded-2xl border border-[#C5A066]/40 text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
          <p className="text-slate-500 text-lg m-0 mb-2">📭</p>
          <p className="text-[#C5A066] font-medium m-0 drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">Δεν βρέθηκαν ολοκληρωμένες παραγγελίες για αυτά τα φίλτρα.</p>
          <p className="text-slate-400 text-sm m-0 mt-1">Δοκιμάστε να διευρύνετε το χρονικό διάστημα ή να αλλάξετε τις επιλογές σας.</p>
        </div>
      )}
    </div>
  );
}