import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function StoreManagement() {
  const [activeTab, setActiveTab] = useState('stores'); // 'stores' | 'couriers'
  const [loading, setLoading] = useState(true);

  // === STORES STATE ===
  const [stores, setStores] = useState([]);
  const [editingStore, setEditingStore] = useState(null);
  const [newFee, setNewFee] = useState('');
  const [isAddingStore, setIsAddingStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStorePhone, setNewStorePhone] = useState('');
  const [newStoreEmail, setNewStoreEmail] = useState('');
  const [newStoreFee, setNewStoreFee] = useState('');

  // === COURIERS STATE ===
  const [couriers, setCouriers] = useState([]);
  const [isAddingCourier, setIsAddingCourier] = useState(false);
  const [newCourierName, setNewCourierName] = useState('');
  const [newCourierPhone, setNewCourierPhone] = useState('');
  const [newCourierEmail, setNewCourierEmail] = useState('');

  useEffect(() => { 
    if (activeTab === 'stores') {
      fetchStores(); 
    } else {
      fetchCouriers();
    }
  }, [activeTab]);

  // === STORES FUNCTIONS ===
  const fetchStores = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('stores').select('*').order('name', { ascending: true });
    if (data) setStores(data);
    if (error) console.error("Σφάλμα φόρτωσης καταστημάτων:", error);
    setLoading(false);
  };

  const saveDeliveryFee = async (storeId) => {
    const { error } = await supabase.from('stores').update({ delivery_fee: parseFloat(newFee) }).eq('id', storeId);
    if (error) alert("Υπήρξε σφάλμα κατά την αποθήκευση.");
    else { setEditingStore(null); fetchStores(); }
  };

  const handleAddStore = async (e) => {
    e.preventDefault();
    if (!newStoreName.trim() || !newStorePhone.trim() || !newStoreEmail.trim()) {
      alert("Παρακαλώ συμπληρώστε το όνομα, το τηλέφωνο και το email.");
      return;
    }
    const fee = parseFloat(newStoreFee) || 0;
    const { error } = await supabase.from('stores').insert([{ name: newStoreName.trim(), phone: newStorePhone.trim(), email: newStoreEmail.trim(), delivery_fee: fee }]);
    if (error) {
      alert(`Σφάλμα: ${error.message}`);
      console.error(error);
    } else {
      setNewStoreName(''); setNewStorePhone(''); setNewStoreEmail(''); setNewStoreFee(''); setIsAddingStore(false); fetchStores();
    }
  };

  // === COURIERS FUNCTIONS ===
  const fetchCouriers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('drivers').select('*').order('full_name', { ascending: true });
    if (data) setCouriers(data);
    if (error && error.code !== '42P01') { // Αγνοούμε το σφάλμα αν δεν υπάρχει ακόμα ο πίνακας
      console.error("Σφάλμα φόρτωσης διανομέων:", error);
    }
    setLoading(false);
  };

  const handleAddCourier = async (e) => {
    e.preventDefault();
    if (!newCourierName.trim() || !newCourierPhone.trim() || !newCourierEmail.trim()) {
      alert("Παρακαλώ συμπληρώστε το όνομα, το τηλέφωνο και το email.");
      return;
    }
    const { error } = await supabase.from('drivers').insert([{ full_name: newCourierName.trim(), phone: newCourierPhone.trim(), email: newCourierEmail.trim(), is_active: true }]);
    if (error) {
      if (error.code === '42P01') {
        alert("Πρέπει να δημιουργήσετε τον πίνακα 'drivers' στο Supabase πρώτα!");
      } else {
        alert(`Σφάλμα: ${error.message}`);
      }
      console.error(error);
    } else {
      setNewCourierName(''); setNewCourierPhone(''); setNewCourierEmail(''); setIsAddingCourier(false); fetchCouriers();
    }
  };

  const toggleDriverStatus = async (driverId, currentStatus) => {
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: !currentStatus })
      .eq('id', driverId);
    if (error) {
      alert("Σφάλμα κατά την αλλαγή κατάστασης του οδηγού.");
      console.error(error);
    } else {
      fetchCouriers();
    }
  };

  return (
    <div className="font-sans">
      <div className="mb-6">
        <h2 className="m-0 mb-1 text-slate-800 text-xl font-bold">🏢 Διαχείριση Συστήματος</h2>
        <p className="m-0 text-slate-500 text-sm">Διαμόρφωση καταστημάτων, προμηθειών και διανομέων.</p>
      </div>

      {/* Tabs Εναλλαγής */}
      <div className="flex gap-6 mb-6 border-b border-slate-200">
        <button 
          onClick={() => { setActiveTab('stores'); setIsAddingStore(false); setIsAddingCourier(false); }} 
          className={`pb-3 font-bold transition-colors ${activeTab === 'stores' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Καταστήματα
        </button>
        <button 
          onClick={() => { setActiveTab('couriers'); setIsAddingStore(false); setIsAddingCourier(false); }} 
          className={`pb-3 font-bold transition-colors ${activeTab === 'couriers' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Διανομείς (Οδηγοί)
        </button>
      </div>

      {/* =====================
          STORES TAB
      ====================== */}
      {activeTab === 'stores' && (
        <>
          <div className="mb-4 flex justify-end">
            <button 
              onClick={() => setIsAddingStore(!isAddingStore)}
              className="w-full md:w-auto bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 px-5 border-none rounded-xl cursor-pointer shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {isAddingStore ? '✖ Ακύρωση' : '➕ Νέο Κατάστημα'}
            </button>
          </div>

          {isAddingStore && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 md:p-6 mb-6 shadow-sm animate-fade-in">
              <h3 className="m-0 mb-4 text-blue-800 font-bold text-base">Στοιχεία Νέου Καταστήματος</h3>
              <form onSubmit={handleAddStore} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700">Όνομα Καταστήματος *</label>
                  <input type="text" placeholder="π.χ. Burger House" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} className="p-2.5 rounded-xl border border-slate-300 outline-none focus:border-blue-500 bg-white" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700">Τηλέφωνο *</label>
                  <input type="text" placeholder="π.χ. 2385012345" value={newStorePhone} onChange={(e) => setNewStorePhone(e.target.value)} className="p-2.5 rounded-xl border border-slate-300 outline-none focus:border-blue-500 bg-white" required />
                </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Email (Login) *</label>
                <input type="email" placeholder="π.χ. store@test.com" value={newStoreEmail} onChange={(e) => setNewStoreEmail(e.target.value)} className="p-2.5 rounded-xl border border-slate-300 outline-none focus:border-blue-500 bg-white" required />
              </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700">Χρέωση ανά Παρ. (€)</label>
                  <input type="number" step="0.10" placeholder="π.χ. 1.50" value={newStoreFee} onChange={(e) => setNewStoreFee(e.target.value)} className="p-2.5 rounded-xl border border-slate-300 outline-none focus:border-blue-500 bg-white" />
                </div>
                <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 border-none rounded-xl cursor-pointer transition-colors shadow-sm h-[42px]">
                  ✓ Αποθήκευση
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <p className="text-slate-500 animate-pulse">Φόρτωση καταστημάτων...</p>
          ) : (
            <div className="bg-transparent md:bg-white md:rounded-2xl md:border md:border-slate-200 md:shadow-sm overflow-hidden">
              <div className="hidden md:grid grid-cols-12 bg-slate-50 border-b-2 border-slate-200 text-slate-600 font-bold p-4">
                <div className="col-span-3">Όνομα Καταστήματος</div>
                <div className="col-span-2">Τηλέφωνο</div>
                <div className="col-span-3">Email (Login)</div>
                <div className="col-span-2">Χρέωση ανά Παραγγελία</div>
                <div className="col-span-2 text-right">Ενέργειες</div>
              </div>
              <div className="flex flex-col gap-4 md:gap-0">
                {stores.map(store => (
                  <div key={store.id} className="grid grid-cols-1 md:grid-cols-12 items-center gap-3 md:gap-0 bg-white p-4 md:px-4 md:py-3 border border-slate-200 md:border-0 md:border-b md:border-slate-100 rounded-xl md:rounded-none hover:bg-slate-50 transition-colors shadow-sm md:shadow-none">
                    <div className="col-span-3 flex flex-col md:block">
                      <span className="font-bold text-slate-800 text-lg md:text-base">{store.name}</span>
                      <span className="text-slate-500 text-sm md:hidden mt-1">📞 {store.phone} | ✉️ {store.email}</span>
                    </div>
                    <div className="col-span-2 hidden md:block text-slate-700">{store.phone}</div>
                    <div className="col-span-3 hidden md:block text-slate-500 text-sm truncate pr-2">{store.email}</div>
                    <div className="col-span-2 flex items-center justify-between md:justify-start mt-2 md:mt-0 pt-3 md:pt-0 border-t border-slate-100 md:border-0">
                      <span className="md:hidden font-semibold text-slate-500 text-sm">Χρέωση:</span>
                      {editingStore === store.id ? (
                        <input type="number" step="0.10" value={newFee} onChange={(e) => setNewFee(e.target.value)} className="p-2 w-24 rounded-md border border-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-right md:text-left" />
                      ) : (
                        <span className="text-base font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg whitespace-nowrap">
                          {store.delivery_fee ? `${store.delivery_fee.toFixed(2)} €` : '0.00 €'}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 flex justify-end mt-1 md:mt-0">
                      {editingStore === store.id ? (
                        <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                          <button onClick={() => saveDeliveryFee(store.id)} className="flex-1 md:flex-none bg-emerald-500 hover:bg-emerald-600 text-white border-none px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-colors shadow-sm">✓ Αποθ.</button>
                          <button onClick={() => setEditingStore(null)} className="flex-1 md:flex-none bg-red-500 hover:bg-red-600 text-white border-none px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-colors shadow-sm">Χ</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingStore(store.id); setNewFee(store.delivery_fee || 0); }} className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-colors whitespace-nowrap">
                          ✏️ Επεξεργασία
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}


      {activeTab === 'couriers' && (
        <>
          <div className="mb-4 flex justify-end">
            <button 
              onClick={() => setIsAddingCourier(!isAddingCourier)}
              className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-5 border-none rounded-xl cursor-pointer shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {isAddingCourier ? '✖ Ακύρωση' : '➕ Νέος Διανομέας'}
            </button>
          </div>

          {isAddingCourier && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 md:p-6 mb-6 shadow-sm animate-fade-in">
              <h3 className="m-0 mb-4 text-emerald-800 font-bold text-base">Στοιχεία Νέου Διανομέα</h3>
              <form onSubmit={handleAddCourier} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700">Ονοματεπώνυμο *</label>
                  <input type="text" placeholder="π.χ. Γιάννης Παπ." value={newCourierName} onChange={(e) => setNewCourierName(e.target.value)} className="p-2.5 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 bg-white" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700">Τηλέφωνο *</label>
                  <input type="text" placeholder="π.χ. 6901234567" value={newCourierPhone} onChange={(e) => setNewCourierPhone(e.target.value)} className="p-2.5 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 bg-white" required />
                </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Email (για Login) *</label>
                <input type="email" placeholder="π.χ. driver@test.com" value={newCourierEmail} onChange={(e) => setNewCourierEmail(e.target.value)} className="p-2.5 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 bg-white" required />
              </div>
                <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 border-none rounded-xl cursor-pointer transition-colors shadow-sm h-[42px]">
                  ✓ Αποθήκευση
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <p className="text-slate-500 animate-pulse">Φόρτωση διανομέων...</p>
          ) : (
            <div className="bg-transparent md:bg-white md:rounded-2xl md:border md:border-slate-200 md:shadow-sm overflow-hidden">
              <div className="hidden md:grid grid-cols-12 bg-slate-50 border-b-2 border-slate-200 text-slate-600 font-bold p-4">
                <div className="col-span-4">Ονοματεπώνυμο</div>
                <div className="col-span-3">Τηλέφωνο</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2 text-right">Κατάσταση</div>
              </div>
              <div className="flex flex-col gap-4 md:gap-0">
                {couriers.length === 0 && !loading && (
                  <div className="p-6 text-center text-slate-500">Δεν υπάρχουν ακόμα εγγεγραμμένοι διανομείς.</div>
                )}
                {couriers.map(courier => (
                  <div key={courier.id} className="grid grid-cols-1 md:grid-cols-12 items-center gap-3 md:gap-0 bg-white p-4 md:px-4 md:py-3 border border-slate-200 md:border-0 md:border-b md:border-slate-100 rounded-xl md:rounded-none hover:bg-slate-50 transition-colors shadow-sm md:shadow-none">
                    <div className="col-span-4 flex flex-col md:block">
                      <span className="font-bold text-slate-800 text-lg md:text-base">🛵 {courier.full_name}</span>
                      <span className="text-slate-500 text-sm md:hidden mt-1">📞 {courier.phone} | ✉️ {courier.email}</span>
                    </div>
                    <div className="col-span-3 hidden md:block text-slate-700">{courier.phone}</div>
                    <div className="col-span-3 hidden md:block text-slate-500 text-sm truncate pr-2">{courier.email}</div>
                    <div className="col-span-2 flex justify-end mt-2 md:mt-0">
                      <button
                        onClick={() => toggleDriverStatus(courier.id, courier.is_active !== false)}
                        className={`w-full md:w-auto px-4 py-2 rounded-xl font-bold text-sm transition-colors border ${
                          courier.is_active !== false 
                            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                            : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {courier.is_active !== false ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
