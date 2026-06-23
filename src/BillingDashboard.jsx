import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import { Receipt, Download, Wallet, Banknote, TrendingUp, Building, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function BillingDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Βοηθητική συνάρτηση για το format YYYY-MM-DDTHH:mm
  const formatDateTimeLocal = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const today = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [startDate, setStartDate] = useState(formatDateTimeLocal(startOfToday));
  const [endDate, setEndDate] = useState(formatDateTimeLocal(today));

  async function fetchCompletedOrders() {
    if (!startDate || !endDate) return;
    setLoading(true);

    const startIso = new Date(startDate).toISOString();
    const endIso = new Date(endDate).toISOString();

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, created_at, status, store_id, driver_id,
        stores ( name, delivery_fee ),
        drivers ( full_name )
      `)
      .eq('status', 'completed')
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    if (data) {
      setOrders(data);
      if (data.length > 0) {
        toast.success(`Βρέθηκαν ${data.length} παραγγελίες!`);
      } else {
        toast.info("Δεν βρέθηκαν παραγγελίες για αυτό το διάστημα.");
      }
    }
    if (error) {
      console.error("Σφάλμα:", error);
      toast.error("Σφάλμα κατά την ανάκτηση των παραγγελιών.");
    }
    setLoading(false);
  }

  const COLORS = ['#C5A066', '#38EF7D', '#9D4EDD', '#60A5FA', '#FBBF24', '#F87171'];

  const calculateFinancials = () => {
    let totalStoreCharges = 0;
    let totalDriverPayouts = 0;
    let totalCompanyProfit = 0;
    const storeBreakdown = {};
    const driverBreakdown = {};

    orders.forEach(order => {
      const storeName = order.stores?.name || 'Άγνωστο Κατάστημα';
      const driverName = order.drivers?.full_name || 'Άγνωστος Οδηγός';
      const storeRate = order.stores?.delivery_fee || 0; 
      const companyShare = 0.50; 
      const driverPayout = storeRate - companyShare; 

      totalStoreCharges += storeRate;
      totalDriverPayouts += driverPayout;
      totalCompanyProfit += companyShare;

      if (!storeBreakdown[storeName]) storeBreakdown[storeName] = { count: 0, balance: 0 };
      storeBreakdown[storeName].count += 1;
      storeBreakdown[storeName].balance += storeRate;

      if (!driverBreakdown[driverName]) driverBreakdown[driverName] = { totalCount: 0, totalBalance: 0, rates: {} };
      driverBreakdown[driverName].totalCount += 1;
      driverBreakdown[driverName].totalBalance += driverPayout;
      if (!driverBreakdown[driverName].rates[driverPayout]) driverBreakdown[driverName].rates[driverPayout] = 0;
      driverBreakdown[driverName].rates[driverPayout] += 1;
    });

    return { totalStoreCharges, totalDriverPayouts, totalCompanyProfit, storeBreakdown, driverBreakdown };
  };

  const financials = calculateFinancials();

  const exportStoresToExcel = () => {
    const data = Object.keys(financials.storeBreakdown).map(store => ({
      'Κατάστημα': store,
      'Σύνολο Παραγγελιών': financials.storeBreakdown[store].count,
      'Οφειλή προς Εταιρεία (€)': financials.storeBreakdown[store].balance.toFixed(2)
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Καταστήματα");
    XLSX.writeFile(workbook, `Εκκαθάριση_Καταστημάτων.xlsx`);
    toast.success("Το Excel καταστημάτων κατέβηκε επιτυχώς!");
  };

  const exportDriversToExcel = () => {
    const data = Object.keys(financials.driverBreakdown).map(driver => ({
      'Διανομέας': driver,
      'Σύνολο Παραγγελιών': financials.driverBreakdown[driver].totalCount,
      'Πληρωμή (€)': financials.driverBreakdown[driver].totalBalance.toFixed(2)
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Διανομείς");
    XLSX.writeFile(workbook, `Μισθοδοσία_Διανομέων.xlsx`);
    toast.success("Το Excel διανομέων κατέβηκε επιτυχώς!");
  };

  const storeChartData = Object.keys(financials.storeBreakdown).map(store => ({
    name: store,
    value: financials.storeBreakdown[store].balance
  }));

  const driverChartData = Object.keys(financials.driverBreakdown).map(driver => ({
    name: driver,
    value: financials.driverBreakdown[driver].totalBalance
  }));

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="font-sans text-adaptive-light"
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Receipt className="text-[#C5A066]" size={24} />
          <h2 className="m-0 text-[#C5A066] text-xl font-bold drop-shadow-[0_0_8px_rgba(197,160,102,0.5)] tracking-wide">Οικονομική Εκκαθάριση</h2>
        </div>
        <p className="m-0 text-adaptive text-sm">Υπολογισμός οφειλών και μισθοδοσίας με ακρίβεια ώρας/λεπτού.</p>
      </div>
      
      {/* Φίλτρα Ημερομηνιών */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-start md:items-center card-glass backdrop-blur-md p-4 rounded-xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        <input 
          type="datetime-local" 
          value={startDate} 
          onChange={e => setStartDate(e.target.value)} 
          className="w-full md:w-auto p-2.5 rounded-lg border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 transition-colors btn-glass text-adaptive-light"
        />
        <span className="text-[#C5A066] font-bold hidden md:inline">έως</span>
        <input 
          type="datetime-local" 
          value={endDate} 
          onChange={e => setEndDate(e.target.value)} 
          className="w-full md:w-auto p-2.5 rounded-lg border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 transition-colors btn-glass text-adaptive-light"
        />
        <button 
          onClick={fetchCompletedOrders} 
          disabled={loading} 
          className="w-full md:w-auto py-2.5 px-6 btn-glass text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] rounded-lg cursor-pointer font-bold transition-all disabled:opacity-50 mt-2 md:mt-0"
        >
          {loading ? 'Υπολογισμός...' : 'Έκδοση Λογαριασμών'}
        </button>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-32 skeleton"></div>
            <div className="h-32 skeleton"></div>
            <div className="h-32 skeleton"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="h-[400px] skeleton"></div>
            <div className="h-[400px] skeleton"></div>
          </div>
        </div>
      ) : orders.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          {/* Κουμπιά Λήψης Excel */}
          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <button 
              onClick={exportStoresToExcel} 
              className="w-full md:w-auto btn-glass text-[#38EF7D] border border-[#38EF7D]/50 hover:shadow-[inset_0_0_15px_rgba(56,239,125,0.4)] py-3 px-5 rounded-xl cursor-pointer font-bold transition-all flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Λήψη Οφειλών Καταστημάτων
            </button>
            <button 
              onClick={exportDriversToExcel} 
              className="w-full md:w-auto btn-glass text-[#9D4EDD] border border-[#9D4EDD]/50 hover:shadow-[inset_0_0_15px_rgba(157,78,221,0.4)] py-3 px-5 rounded-xl cursor-pointer font-bold transition-all flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Λήψη Μισθοδοσίας
            </button>
          </div>

          {/* Στατιστικές Κάρτες */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
            <div className="p-6 card-glass backdrop-blur-md border border-[#38EF7D]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] hover:-translate-y-1 transition-transform">
              <div className="flex items-center gap-2 mb-2 text-[#38EF7D] drop-shadow-[0_0_5px_rgba(56,239,125,0.5)]">
                <Wallet size={20} />
                <h3 className="m-0 text-base font-bold">Είσπραξη από Μαγαζιά</h3>
              </div>
              <p className="m-0 text-3xl font-black text-adaptive-light">{financials.totalStoreCharges.toFixed(2)} €</p>
              <small className="text-adaptive font-medium">Από {orders.length} παραγγελίες</small>
            </div>
            <div className="p-6 card-glass backdrop-blur-md border border-[#9D4EDD]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] hover:-translate-y-1 transition-transform">
              <div className="flex items-center gap-2 mb-2 text-[#9D4EDD] drop-shadow-[0_0_5px_rgba(157,78,221,0.5)]">
                <Banknote size={20} />
                <h3 className="m-0 text-base font-bold">Πληρωμές Διανομέων</h3>
              </div>
              <p className="m-0 text-3xl font-black text-adaptive-light">{financials.totalDriverPayouts.toFixed(2)} €</p>
            </div>
            <div className="p-6 card-glass backdrop-blur-md border border-[#C5A066]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] hover:-translate-y-1 transition-transform">
              <div className="flex items-center gap-2 mb-2 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.5)]">
                <TrendingUp size={20} />
                <h3 className="m-0 text-base font-bold">Καθαρό Κέρδος</h3>
              </div>
              <p className="m-0 text-3xl font-black text-adaptive-light">{financials.totalCompanyProfit.toFixed(2)} €</p>
            </div>
          </div>

          {/* Γραφήματα */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="card-glass backdrop-blur-md p-6 rounded-2xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              <h4 className="text-center font-bold mb-4 text-[#38EF7D]">Οφειλές ανά Κατάστημα</h4>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={storeChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {storeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value) => `${value.toFixed(2)} €`}
                      contentStyle={{ backgroundColor: '#1A1A1A', borderColor: '#C5A066', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card-glass backdrop-blur-md p-6 rounded-2xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              <h4 className="text-center font-bold mb-4 text-[#9D4EDD]">Αποδοχές ανά Διανομέα</h4>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={driverChartData}>
                    <XAxis dataKey="name" stroke="#A89C8E" tick={{fontSize: 12}} />
                    <YAxis stroke="#A89C8E" />
                    <RechartsTooltip 
                      formatter={(value) => `${value.toFixed(2)} €`}
                      contentStyle={{ backgroundColor: '#1A1A1A', borderColor: '#9D4EDD', borderRadius: '8px' }}
                    />
                    <Bar dataKey="value" fill="#9D4EDD" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Αναλύσεις (Cards για Κινητά / Grids για Desktop) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Ανάλυση Καταστημάτων */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">
                <Building size={20} />
                <h4 className="m-0 font-bold text-lg">Ανάλυση ανά Κατάστημα</h4>
              </div>
              <div className="bg-transparent md:card-glass backdrop-blur-md md:rounded-xl md:border md:border-[#C5A066]/40 md:shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="hidden md:grid grid-cols-3 table-header-glass border-b border-[#C5A066]/40 text-[#C5A066] font-bold p-4">
                  <div>Κατάστημα</div>
                  <div>Παραγγελίες</div>
                  <div>Οφειλή</div>
                </div>
                <div className="flex flex-col gap-3 md:gap-0">
                  {Object.keys(financials.storeBreakdown).map(store => (
                    <div key={store} className="grid grid-cols-1 md:grid-cols-3 items-center bg-transparent p-4 md:p-4 border border-[#C5A066]/20 md:border-0 md:border-b md:border-[#C5A066]/20 rounded-xl md:rounded-none hover-row-glass transition-colors">
                      <div className="font-bold text-adaptive-light text-lg md:text-base mb-2 md:mb-0">{store}</div>
                      <div className="flex justify-between md:block text-adaptive-light mb-2 md:mb-0">
                        <span className="md:hidden font-semibold text-adaptive text-sm">Παραγγελίες:</span>
                        {financials.storeBreakdown[store].count}
                      </div>
                      <div className="flex justify-between md:block font-bold text-[#38EF7D] pt-2 border-t border-[#C5A066]/10 md:border-0 md:pt-0">
                        <span className="md:hidden font-semibold text-adaptive text-sm">Οφειλή:</span>
                        {financials.storeBreakdown[store].balance.toFixed(2)} €
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Μισθοδοσία Διανομέων */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">
                <UserCheck size={20} />
                <h4 className="m-0 font-bold text-lg">Μισθοδοσία Διανομέων</h4>
              </div>
              <div className="bg-transparent md:card-glass backdrop-blur-md md:rounded-xl md:border md:border-[#C5A066]/40 md:shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="hidden md:grid grid-cols-3 table-header-glass border-b border-[#C5A066]/40 text-[#C5A066] font-bold p-4">
                  <div>Διανομέας</div>
                  <div>Ανάλυση</div>
                  <div>Πληρωμή</div>
                </div>
                <div className="flex flex-col gap-3 md:gap-0">
                  {Object.keys(financials.driverBreakdown).map(driver => {
                    const data = financials.driverBreakdown[driver];
                    return (
                      <div key={driver} className="grid grid-cols-1 md:grid-cols-3 items-start md:items-center bg-transparent p-4 md:p-4 border border-[#C5A066]/20 md:border-0 md:border-b md:border-[#C5A066]/20 rounded-xl md:rounded-none hover-row-glass transition-colors">
                        <div className="font-bold text-adaptive-light text-lg md:text-base mb-3 md:mb-0">{driver}</div>
                        <div className="text-adaptive-light mb-3 md:mb-0">
                          <div className="text-[13px]">Σύνολο: <b>{data.totalCount}</b></div>
                          <ul className="m-0 mt-1 pl-4 text-xs text-adaptive list-disc">
                            {Object.keys(data.rates).map(rate => (
                              <li key={rate} className="whitespace-nowrap">{data.rates[rate]} παρ. x {Number(rate).toFixed(2)} €</li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex justify-between items-center md:block font-black text-[#9D4EDD] text-base md:text-lg pt-3 border-t border-[#C5A066]/10 md:border-0 md:pt-0">
                          <span className="md:hidden font-semibold text-adaptive text-sm">Πληρωμή:</span>
                          {data.totalBalance.toFixed(2)} €
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-glass backdrop-blur-md p-6 rounded-xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)] text-center mt-8">
          <p className="text-[#C5A066] italic m-0 drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">Δεν βρέθηκαν ολοκληρωμένες παραγγελίες για αυτό το χρονικό διάστημα.</p>
        </motion.div>
      )}
    </motion.div>
  );
}