import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';

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

    if (data) setOrders(data);
    if (error) console.error("Σφάλμα:", error);
    setLoading(false);
  }

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
  };

  return (
    <div className="font-sans text-slate-200">
      <div className="mb-6">
        <h2 className="m-0 mb-1 text-[#C5A066] text-xl font-bold drop-shadow-[0_0_8px_rgba(197,160,102,0.5)] tracking-wide">📊 Οικονομική Εκκαθάριση</h2>
        <p className="m-0 text-slate-400 text-sm">Υπολογισμός οφειλών και μισθοδοσίας με ακρίβεια ώρας/λεπτού.</p>
      </div>
      
      {/* Φίλτρα Ημερομηνιών */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-start md:items-center bg-[#1A1A1A]/90 backdrop-blur-md p-4 rounded-xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        <input 
          type="datetime-local" 
          value={startDate} 
          onChange={e => setStartDate(e.target.value)} 
          className="w-full md:w-auto p-2.5 rounded-lg border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 transition-colors bg-[#050505] text-slate-200"
        />
        <span className="text-[#C5A066] font-bold hidden md:inline">έως</span>
        <input 
          type="datetime-local" 
          value={endDate} 
          onChange={e => setEndDate(e.target.value)} 
          className="w-full md:w-auto p-2.5 rounded-lg border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 transition-colors bg-[#050505] text-slate-200"
        />
        <button 
          onClick={fetchCompletedOrders} 
          disabled={loading} 
          className="w-full md:w-auto py-2.5 px-6 bg-[#050505] text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] rounded-lg cursor-pointer font-bold transition-all disabled:opacity-50 mt-2 md:mt-0"
        >
          {loading ? 'Υπολογισμός...' : 'Έκδοση Λογαριασμών'}
        </button>
      </div>

      {orders.length > 0 ? (
        <div>
          {/* Κουμπιά Λήψης Excel */}
          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <button 
              onClick={exportStoresToExcel} 
              className="w-full md:w-auto bg-[#050505] text-[#38EF7D] border border-[#38EF7D]/50 hover:shadow-[inset_0_0_15px_rgba(56,239,125,0.4)] py-3 px-5 rounded-xl cursor-pointer font-bold transition-all"
            >
              📥 Λήψη Οφειλών Καταστημάτων
            </button>
            <button 
              onClick={exportDriversToExcel} 
              className="w-full md:w-auto bg-[#050505] text-[#9D4EDD] border border-[#9D4EDD]/50 hover:shadow-[inset_0_0_15px_rgba(157,78,221,0.4)] py-3 px-5 rounded-xl cursor-pointer font-bold transition-all"
            >
              📥 Λήψη Μισθοδοσίας
            </button>
          </div>

          {/* Στατιστικές Κάρτες */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
            <div className="p-6 bg-[#1A1A1A]/90 backdrop-blur-md border border-[#38EF7D]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              <h3 className="m-0 mb-2 text-[#38EF7D] drop-shadow-[0_0_5px_rgba(56,239,125,0.5)] text-base font-bold">💰 Είσπραξη από Μαγαζιά</h3>
              <p className="m-0 text-3xl font-black text-slate-100">{financials.totalStoreCharges.toFixed(2)} €</p>
              <small className="text-slate-400 font-medium">Από {orders.length} παραγγελίες</small>
            </div>
            <div className="p-6 bg-[#1A1A1A]/90 backdrop-blur-md border border-[#9D4EDD]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              <h3 className="m-0 mb-2 text-[#9D4EDD] drop-shadow-[0_0_5px_rgba(157,78,221,0.5)] text-base font-bold">🛵 Πληρωμές Διανομέων</h3>
              <p className="m-0 text-3xl font-black text-slate-100">{financials.totalDriverPayouts.toFixed(2)} €</p>
            </div>
            <div className="p-6 bg-[#1A1A1A]/90 backdrop-blur-md border border-[#C5A066]/40 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              <h3 className="m-0 mb-2 text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.5)] text-base font-bold">📈 Καθαρό Κέρδος</h3>
              <p className="m-0 text-3xl font-black text-slate-100">{financials.totalCompanyProfit.toFixed(2)} €</p>
            </div>
          </div>

          {/* Αναλύσεις (Cards για Κινητά / Grids για Desktop) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Ανάλυση Καταστημάτων */}
            <div>
              <h4 className="text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)] mb-4 font-bold text-lg">🏢 Ανάλυση ανά Κατάστημα</h4>
              <div className="bg-transparent md:bg-[#1A1A1A]/90 backdrop-blur-md md:rounded-xl md:border md:border-[#C5A066]/40 md:shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="hidden md:grid grid-cols-3 bg-[#111111] border-b border-[#C5A066]/40 text-[#C5A066] font-bold p-4">
                  <div>Κατάστημα</div>
                  <div>Παραγγελίες</div>
                  <div>Οφειλή</div>
                </div>
                <div className="flex flex-col gap-3 md:gap-0">
                  {Object.keys(financials.storeBreakdown).map(store => (
                    <div key={store} className="grid grid-cols-1 md:grid-cols-3 items-center bg-transparent p-4 md:p-4 border border-[#C5A066]/20 md:border-0 md:border-b md:border-[#C5A066]/20 rounded-xl md:rounded-none hover:bg-[#252525] transition-colors">
                      <div className="font-bold text-slate-200 text-lg md:text-base mb-2 md:mb-0">{store}</div>
                      <div className="flex justify-between md:block text-slate-300 mb-2 md:mb-0">
                        <span className="md:hidden font-semibold text-slate-500 text-sm">Παραγγελίες:</span>
                        {financials.storeBreakdown[store].count}
                      </div>
                      <div className="flex justify-between md:block font-bold text-[#38EF7D] pt-2 border-t border-[#C5A066]/10 md:border-0 md:pt-0">
                        <span className="md:hidden font-semibold text-slate-500 text-sm">Οφειλή:</span>
                        {financials.storeBreakdown[store].balance.toFixed(2)} €
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Μισθοδοσία Διανομέων */}
            <div>
              <h4 className="text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.4)] mb-4 font-bold text-lg">🛵 Μισθοδοσία Διανομέων</h4>
              <div className="bg-transparent md:bg-[#1A1A1A]/90 backdrop-blur-md md:rounded-xl md:border md:border-[#C5A066]/40 md:shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="hidden md:grid grid-cols-3 bg-[#111111] border-b border-[#C5A066]/40 text-[#C5A066] font-bold p-4">
                  <div>Διανομέας</div>
                  <div>Ανάλυση</div>
                  <div>Πληρωμή</div>
                </div>
                <div className="flex flex-col gap-3 md:gap-0">
                  {Object.keys(financials.driverBreakdown).map(driver => {
                    const data = financials.driverBreakdown[driver];
                    return (
                      <div key={driver} className="grid grid-cols-1 md:grid-cols-3 items-start md:items-center bg-transparent p-4 md:p-4 border border-[#C5A066]/20 md:border-0 md:border-b md:border-[#C5A066]/20 rounded-xl md:rounded-none hover:bg-[#252525] transition-colors">
                        <div className="font-bold text-slate-200 text-lg md:text-base mb-3 md:mb-0">{driver}</div>
                        <div className="text-slate-300 mb-3 md:mb-0">
                          <div className="text-[13px]">Σύνολο: <b>{data.totalCount}</b></div>
                          <ul className="m-0 mt-1 pl-4 text-xs text-slate-400 list-disc">
                            {Object.keys(data.rates).map(rate => (
                              <li key={rate} className="whitespace-nowrap">{data.rates[rate]} παρ. x {Number(rate).toFixed(2)} €</li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex justify-between items-center md:block font-black text-[#9D4EDD] text-base md:text-lg pt-3 border-t border-[#C5A066]/10 md:border-0 md:pt-0">
                          <span className="md:hidden font-semibold text-slate-500 text-sm">Πληρωμή:</span>
                          {data.totalBalance.toFixed(2)} €
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="bg-[#1A1A1A]/90 backdrop-blur-md p-6 rounded-xl border border-[#C5A066]/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)] text-center">
          <p className="text-[#C5A066] italic m-0 drop-shadow-[0_0_5px_rgba(197,160,102,0.4)]">Δεν βρέθηκαν ολοκληρωμένες παραγγελίες για αυτό το χρονικό διάστημα.</p>
        </div>
      )}
    </div>
  );
}