import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { BarChart2, Clock, Package, Trophy, TrendingUp, RefreshCcw, ChevronUp, FileText, MapPin, User, Calendar, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

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

    if (data) {
      setOrders(data);
      if (data.length > 0) {
        toast.success(`Ανακτήθηκαν ${data.length} παραγγελίες!`);
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8 card-glass backdrop-blur-md p-4 md:p-5 rounded-2xl border border-[#C5A066]/40 items-end shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        
        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Από</label>
          <input 
            type="datetime-local" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm"
          />
        </div>
        
        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Έως</label>
          <input 
            type="datetime-local" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5 lg:col-span-1">
          <label className="text-xs font-bold text-[#C5A066]">Κατάστημα</label>
          <select 
            value={selectedStore} 
            onChange={e => setSelectedStore(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm cursor-pointer"
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
            className="w-full p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors text-sm cursor-pointer"
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
            className="w-full sm:w-auto px-8 lg:px-6 py-2.5 btn-glass text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] rounded-xl cursor-pointer font-bold transition-all disabled:opacity-50 h-[42px] flex items-center justify-center gap-2"
          >
            {loading ? 'Φόρτωση...' : <><RefreshCcw size={16} /> Ανανέωση</>}
          </button>
        </div>

      </div>

      {loading ? (
        <div className="space-y-6">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8">
            <div className="p-6 card-glass backdrop-blur-md border border-[#38EF7D]/40 rounded-2xl text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col items-center hover:-translate-y-1 transition-transform">
              <div className="flex items-center justify-center gap-2 mb-2 text-[#38EF7D] drop-shadow-[0_0_5px_rgba(56,239,125,0.5)] relative z-10">
                <Clock size={20} />
                <h3 className="m-0 text-base font-bold">Μέσος Χρόνος Παράδοσης</h3>
              </div>
              <p className="m-0 text-4xl font-black text-adaptive-light relative z-10">{kpis.avgTime} <span className="text-xl font-bold text-adaptive-light">λεπτά</span></p>
              <small className="text-adaptive block mt-2 font-medium relative z-10">Από τη δημιουργία έως την πόρτα</small>
            </div>
            <div className="p-6 card-glass backdrop-blur-md border border-[#9D4EDD]/40 rounded-2xl text-center shadow-[0_8px_30px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col items-center hover:-translate-y-1 transition-transform">
              <div className="flex items-center justify-center gap-2 mb-2 text-[#9D4EDD] drop-shadow-[0_0_5px_rgba(157,78,221,0.5)] relative z-10">
                <Package size={20} />
                <h3 className="m-0 text-base font-bold">Συνολικές Παραδόσεις</h3>
              </div>
              <p className="m-0 text-4xl font-black text-adaptive-light relative z-10">{kpis.totalOrders}</p>
              <small className="text-adaptive block mt-2 font-medium relative z-10">Ολοκληρωμένες στο διάστημα</small>
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
              <div className="flex items-center gap-2 mb-4 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">
                <TrendingUp size={20} />
                <h4 className="m-0 font-bold text-lg">{selectedDriver ? 'Επίδοση Επιλεγμένου Διανομέα' : 'Επίδοση Διανομέων (Χρόνοι)'}</h4>
              </div>
              <div className="card-glass backdrop-blur-md rounded-xl border border-[#C5A066]/40 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                {kpis.sortedDrivers.length > 0 ? kpis.sortedDrivers.map((driver, index) => (
                  <div 
                    key={driver.name} 
                    className={`flex justify-between items-center p-3 md:px-4 md:py-3 ${index !== kpis.sortedDrivers.length - 1 ? 'border-b border-[#C5A066]/10' : ''} hover-row-glass transition-colors`}
                  >
                    <span className="text-adaptive-light">
                      {selectedDriver ? <b>{driver.name}</b> : <>{index + 1}. <b>{driver.name}</b></>} 
                      <span className="text-adaptive text-xs ml-1">({driver.deliveries} παρ.)</span>
                    </span>
                    <span className={`font-bold border px-2.5 py-1 rounded-full text-xs whitespace-nowrap ${driver.avg < 15 ? 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10' : (driver.avg > 25 ? 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10' : 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10')}`}>
                      {driver.avg} λ.
                    </span>
                  </div>
                )) : (
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
                <h4 className="m-0 text-[#C5A066] font-bold drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">Αναλυτικές Παραγγελίες ({orders.length})</h4>
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
                    {orders.map(order => {
                      const mins = order.created_at && order.completed_at 
                        ? Math.floor((new Date(order.completed_at) - new Date(order.created_at)) / 60000) 
                        : '-';
                      
                      return (
                        <tr key={order.id} className="hover-row-glass transition-colors">
                          <td className="p-4 text-adaptive">
                            <div className="font-bold">{formatDate(order.created_at)}</div>
                            <div className="text-xs">{formatTime(order.created_at)}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-adaptive-light">{order.stores?.name}</div>
                            <div className="text-adaptive text-xs mt-0.5 flex items-center gap-1"><MapPin size={12} /> <span className="text-adaptive">{order.address || 'Μη διαθέσιμη διεύθυνση'}</span></div>
                          </td>
                          <td className="p-4 text-adaptive-light font-medium">
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
                    <div key={order.id} className="p-4 hover-row-glass">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-adaptive-light text-[15px]">{order.stores?.name}</div>
                        <span className={`border px-2 py-0.5 rounded text-[11px] font-bold ${mins < 15 ? 'text-[#38EF7D] border-[#38EF7D]/40 bg-[#38EF7D]/10' : (mins > 25 ? 'text-[#9D4EDD] border-[#9D4EDD]/40 bg-[#9D4EDD]/10' : 'text-[#C5A066] border-[#C5A066]/40 bg-[#C5A066]/10')}`}>
                          {mins} λεπτά
                        </span>
                      </div>
                      <div className="text-adaptive text-sm mb-2 flex items-center gap-1"><MapPin size={14} /> {order.address || 'Μη διαθέσιμη διεύθυνση'}</div>
                      <div className="flex justify-between items-center text-xs text-adaptive pt-2 border-t border-[#C5A066]/10">
                        <span className="flex items-center gap-1"><User size={12} /> {order.drivers?.full_name}</span>
                        <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(order.created_at)} {formatTime(order.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

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