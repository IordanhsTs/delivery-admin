import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Building2, X, Plus, Check, Phone, Mail, Edit2, Bike } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

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
  const [newStorePassword, setNewStorePassword] = useState('');

  // === COURIERS STATE ===
  const [couriers, setCouriers] = useState([]);
  const [isAddingCourier, setIsAddingCourier] = useState(false);
  const [newCourierName, setNewCourierName] = useState('');
  const [newCourierPhone, setNewCourierPhone] = useState('');
  const [newCourierEmail, setNewCourierEmail] = useState('');
  const [newCourierPassword, setNewCourierPassword] = useState('');
  
  const [editingCourier, setEditingCourier] = useState(null);
  const [editCourierData, setEditCourierData] = useState({ full_name: '', phone: '', email: '' });

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
    if (error) {
      toast.error("Υπήρξε σφάλμα κατά την αποθήκευση.");
    } else { 
      toast.success("Η χρέωση ενημερώθηκε!");
      setEditingStore(null); 
      fetchStores(); 
    }
  };

  const handleAddStore = async (e) => {
    e.preventDefault();
    if (!newStoreName.trim() || !newStorePhone.trim() || !newStoreEmail.trim() || !newStorePassword.trim()) {
      toast.warning("Παρακαλώ συμπληρώστε όλα τα υποχρεωτικά πεδία.");
      return;
    }
    const fee = parseFloat(newStoreFee) || 0;
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('create-user-admin', {
      body: {
        email: newStoreEmail.trim(),
        password: newStorePassword.trim(),
        role: 'store',
        name: newStoreName.trim(),
        phone: newStorePhone.trim(),
        fee: fee
      }
    });

    setLoading(false);

    if (data?.error) {
      toast.error(`Σφάλμα backend: ${data.error}`);
    } else if (error) {
      toast.error(`Σφάλμα: ${error.message}`);
      console.error(error);
    } else {
      toast.success("Το κατάστημα δημιουργήθηκε επιτυχώς!");
      setNewStoreName(''); setNewStorePhone(''); setNewStoreEmail(''); setNewStoreFee(''); setNewStorePassword(''); setIsAddingStore(false); fetchStores();
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
    if (!newCourierName.trim() || !newCourierPhone.trim() || !newCourierEmail.trim() || !newCourierPassword.trim()) {
      toast.warning("Παρακαλώ συμπληρώστε όλα τα υποχρεωτικά πεδία.");
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('create-user-admin', {
      body: {
        email: newCourierEmail.trim(),
        password: newCourierPassword.trim(),
        role: 'driver',
        name: newCourierName.trim(),
        phone: newCourierPhone.trim()
      }
    });

    setLoading(false);

    if (data?.error) {
      toast.error(`Σφάλμα backend: ${data.error}`);
    } else if (error) {
      if (error.code === '42P01') {
        toast.error("Πρέπει να δημιουργήσετε τον πίνακα 'drivers' στο Supabase πρώτα!");
      } else {
        toast.error(`Σφάλμα: ${error.message}`);
      }
      console.error(error);
    } else {
      toast.success("Ο διανομέας δημιουργήθηκε επιτυχώς!");
      setNewCourierName(''); setNewCourierPhone(''); setNewCourierEmail(''); setNewCourierPassword(''); setIsAddingCourier(false); fetchCouriers();
    }
  };

  const toggleDriverStatus = async (driverId, currentStatus) => {
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: !currentStatus })
      .eq('id', driverId);
    if (error) {
      toast.error("Σφάλμα κατά την αλλαγή κατάστασης του οδηγού.");
      console.error(error);
    } else {
      toast.success(`Ο οδηγός ${!currentStatus ? 'ενεργοποιήθηκε' : 'απενεργοποιήθηκε'}.`);
      fetchCouriers();
    }
  };

  const saveCourierDetails = async (courierId) => {
    const { error } = await supabase
      .from('drivers')
      .update({
        full_name: editCourierData.full_name,
        phone: editCourierData.phone,
        email: editCourierData.email,
      })
      .eq('id', courierId);
      
    if (error) {
      toast.error("Σφάλμα κατά την αποθήκευση στοιχείων.");
      console.error(error);
    } else {
      toast.success("Τα στοιχεία του διανομέα ενημερώθηκαν!");
      setEditingCourier(null);
      fetchCouriers();
    }
  };

  const toggleBlockedStatus = async (id, table, currentStatus) => {
    const { error } = await supabase
      .from(table)
      .update({ is_blocked: !currentStatus })
      .eq('id', id);
    if (error) {
      toast.error("Σφάλμα κατά την αλλαγή κατάστασης μπλοκαρίσματος.");
      console.error(error);
    } else {
      toast.success(table === 'stores' ? "Η κατάσταση του καταστήματος ενημερώθηκε." : "Η κατάσταση του οδηγού ενημερώθηκε.");
      if (table === 'stores') fetchStores();
      else fetchCouriers();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="font-sans text-adaptive-light"
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="text-[#C5A066]" size={24} />
          <h2 className="m-0 text-[#C5A066] text-xl font-bold drop-shadow-[0_0_8px_rgba(197,160,102,0.5)] tracking-wide">Διαχείριση Συστήματος</h2>
        </div>
        <p className="m-0 text-adaptive text-sm">Διαμόρφωση καταστημάτων, προμηθειών και διανομέων.</p>
      </div>

      {/* Tabs Εναλλαγής */}
      <div className="flex gap-6 mb-6 border-b border-[#C5A066]/30">
        <button 
          onClick={() => { setActiveTab('stores'); setIsAddingStore(false); setIsAddingCourier(false); }} 
          className={`pb-3 font-bold transition-all ${activeTab === 'stores' ? 'border-b-2 border-[#C5A066] text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.5)]' : 'border-b-2 border-transparent text-adaptive hover:text-adaptive-light'}`}
        >
          Καταστήματα
        </button>
        <button 
          onClick={() => { setActiveTab('couriers'); setIsAddingStore(false); setIsAddingCourier(false); }} 
          className={`pb-3 font-bold transition-all ${activeTab === 'couriers' ? 'border-b-2 border-[#C5A066] text-[#C5A066] drop-shadow-[0_0_5px_rgba(197,160,102,0.5)]' : 'border-b-2 border-transparent text-adaptive hover:text-adaptive-light'}`}
        >
          Διανομείς (Οδηγοί)
        </button>
      </div>

      {/* =====================
          STORES TAB
      ====================== */}
      {activeTab === 'stores' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <div className="mb-4 flex justify-end">
            <button 
              onClick={() => setIsAddingStore(!isAddingStore)}
              className="w-full md:w-auto btn-glass text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] font-bold py-2.5 px-5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              {isAddingStore ? <><X size={18} /> Ακύρωση</> : <><Plus size={18} /> Νέο Κατάστημα</>}
            </button>
          </div>

          {isAddingStore && (
            <div className="card-glass backdrop-blur-md border border-[#C5A066]/40 rounded-2xl p-5 md:p-6 mb-6 shadow-[0_8px_30px_rgba(0,0,0,0.6)] animate-fade-in">
              <h3 className="m-0 mb-4 text-[#C5A066] font-bold text-base drop-shadow-[0_0_5px_rgba(197,160,102,0.5)]">Στοιχεία Νέου Καταστήματος</h3>
              <form onSubmit={handleAddStore} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#C5A066]">Όνομα Καταστήματος *</label>
                  <input type="text" placeholder="π.χ. Burger House" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#C5A066]">Τηλέφωνο *</label>
                  <input type="text" placeholder="π.χ. 2385012345" value={newStorePhone} onChange={(e) => setNewStorePhone(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" required />
                </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#C5A066]">Email (Login) *</label>
                <input type="email" placeholder="π.χ. store@test.com" value={newStoreEmail} onChange={(e) => setNewStoreEmail(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" required />
              </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#C5A066]">Κωδικός *</label>
                  <input type="text" placeholder="π.χ. StorePass123!" value={newStorePassword} onChange={(e) => setNewStorePassword(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" required autoComplete="off" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#C5A066]">Χρέωση ανά Παρ. (€)</label>
                  <input type="number" step="0.10" placeholder="π.χ. 1.50" value={newStoreFee} onChange={(e) => setNewStoreFee(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" />
                </div>
                <button type="submit" className="btn-glass border border-[#38EF7D]/50 text-[#38EF7D] hover:shadow-[inset_0_0_15px_rgba(56,239,125,0.4)] font-bold py-2.5 px-4 rounded-xl cursor-pointer transition-all h-[42px] flex items-center justify-center gap-2">
                  <Check size={18} /> Αποθήκευση
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              <div className="h-16 skeleton w-full"></div>
              <div className="h-16 skeleton w-full"></div>
              <div className="h-16 skeleton w-full"></div>
            </div>
          ) : (
            <div className="bg-transparent md:card-glass backdrop-blur-md md:rounded-2xl md:border md:border-[#C5A066]/40 md:shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="hidden md:grid grid-cols-12 table-header-glass border-b-2 border-[#C5A066]/40 text-[#C5A066] font-bold p-4 drop-shadow-[0_0_3px_rgba(197,160,102,0.4)]">
                <div className="col-span-3">Όνομα Καταστήματος</div>
                <div className="col-span-2">Τηλέφωνο</div>
                <div className="col-span-3">Email (Login)</div>
                <div className="col-span-2">Χρέωση ανά Παραγγελία</div>
                <div className="col-span-2 text-right">Ενέργειες</div>
              </div>
              <div className="flex flex-col gap-4 md:gap-0">
                {stores.map(store => (
                  <div key={store.id} className="grid grid-cols-1 md:grid-cols-12 items-center gap-3 md:gap-0 bg-transparent p-4 md:px-4 md:py-3 border border-[#C5A066]/20 md:border-0 md:border-b md:border-[#C5A066]/20 rounded-xl md:rounded-none hover-row-glass transition-colors">
                    <div className="col-span-3 flex flex-col md:block">
                      <span className="font-bold text-adaptive-light text-lg md:text-base">{store.name}</span>
                      <span className="text-adaptive text-sm md:hidden mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-1"><Phone size={12} /> {store.phone}</span>
                        <span className="flex items-center gap-1"><Mail size={12} /> {store.email}</span>
                      </span>
                    </div>
                    <div className="col-span-2 hidden md:block text-adaptive-light">{store.phone}</div>
                    <div className="col-span-3 hidden md:block text-adaptive text-sm truncate pr-2">{store.email}</div>
                    <div className="col-span-2 flex items-center justify-between md:justify-start mt-2 md:mt-0 pt-3 md:pt-0 border-t border-[#C5A066]/10 md:border-0">
                      <span className="md:hidden font-semibold text-adaptive text-sm">Χρέωση:</span>
                      {editingStore === store.id ? (
                        <input type="number" step="0.10" value={newFee} onChange={(e) => setNewFee(e.target.value)} className="p-2 w-24 rounded-md border border-[#C5A066]/30 btn-glass text-adaptive-light outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 transition-all text-right md:text-left" />
                      ) : (
                        <span className="text-base font-bold text-[#38EF7D] border border-[#38EF7D]/30 bg-[#38EF7D]/10 px-3 py-1.5 rounded-lg whitespace-nowrap">
                          {store.delivery_fee ? `${store.delivery_fee.toFixed(2)} €` : '0.00 €'}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 flex justify-end mt-1 md:mt-0">
                      {editingStore === store.id ? (
                        <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                          <button onClick={() => saveDeliveryFee(store.id)} className="flex-1 md:flex-none btn-glass text-[#38EF7D] border border-[#38EF7D]/50 hover:shadow-[inset_0_0_10px_rgba(56,239,125,0.4)] px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-all flex justify-center items-center"><Check size={16}/></button>
                          <button onClick={() => setEditingStore(null)} className="flex-1 md:flex-none btn-glass text-[#9D4EDD] border border-[#9D4EDD]/50 hover:shadow-[inset_0_0_10px_rgba(157,78,221,0.4)] px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-all flex justify-center items-center"><X size={16}/></button>
                        </div>
                      ) : (
                        <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                          <button onClick={() => { setEditingStore(store.id); setNewFee(store.delivery_fee || 0); }} className="flex-1 md:flex-none btn-glass hover:shadow-[inset_0_0_10px_rgba(197,160,102,0.4)] text-[#C5A066] border border-[#C5A066]/30 px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-all whitespace-nowrap flex items-center justify-center gap-2">
                            <Edit2 size={14} /> Επεξεργασία
                          </button>
                          <button onClick={() => toggleBlockedStatus(store.id, 'stores', store.is_blocked)} className={`flex-1 md:flex-none px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-all whitespace-nowrap flex items-center justify-center border ${store.is_blocked ? 'btn-glass text-[#38EF7D] border-[#38EF7D]/50 hover:shadow-[inset_0_0_15px_rgba(56,239,125,0.4)]' : 'btn-glass text-[#EF4444] border-[#EF4444]/50 hover:shadow-[inset_0_0_15px_rgba(239,68,68,0.4)]'}`}>
                            {store.is_blocked ? 'Ξεμπλοκάρισμα' : 'Μπλοκάρισμα'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}


      {activeTab === 'couriers' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <div className="mb-4 flex justify-end">
            <button 
              onClick={() => setIsAddingCourier(!isAddingCourier)}
              className="w-full md:w-auto btn-glass text-[#C5A066] border border-[#C5A066]/50 hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] font-bold py-2.5 px-5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              {isAddingCourier ? <><X size={18} /> Ακύρωση</> : <><Plus size={18} /> Νέος Διανομέας</>}
            </button>
          </div>

          {isAddingCourier && (
            <div className="card-glass backdrop-blur-md border border-[#C5A066]/40 rounded-2xl p-5 md:p-6 mb-6 shadow-[0_8px_30px_rgba(0,0,0,0.6)] animate-fade-in">
              <h3 className="m-0 mb-4 text-[#C5A066] font-bold text-base drop-shadow-[0_0_5px_rgba(197,160,102,0.5)]">Στοιχεία Νέου Διανομέα</h3>
              <form onSubmit={handleAddCourier} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#C5A066]">Ονοματεπώνυμο *</label>
                  <input type="text" placeholder="π.χ. Γιάννης Παπ." value={newCourierName} onChange={(e) => setNewCourierName(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#C5A066]">Τηλέφωνο *</label>
                  <input type="text" placeholder="π.χ. 6901234567" value={newCourierPhone} onChange={(e) => setNewCourierPhone(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" required />
                </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#C5A066]">Email (για Login) *</label>
                <input type="email" placeholder="π.χ. driver@test.com" value={newCourierEmail} onChange={(e) => setNewCourierEmail(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" required />
              </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#C5A066]">Κωδικός *</label>
                  <input type="text" placeholder="π.χ. DriverPass123!" value={newCourierPassword} onChange={(e) => setNewCourierPassword(e.target.value)} className="p-2.5 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light transition-colors" required autoComplete="off" />
                </div>
                <button type="submit" className="btn-glass border border-[#38EF7D]/50 text-[#38EF7D] hover:shadow-[inset_0_0_15px_rgba(56,239,125,0.4)] font-bold py-2.5 px-4 rounded-xl cursor-pointer transition-all h-[42px] flex items-center justify-center gap-2">
                  <Check size={18} /> Αποθήκευση
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              <div className="h-16 skeleton w-full"></div>
              <div className="h-16 skeleton w-full"></div>
              <div className="h-16 skeleton w-full"></div>
            </div>
          ) : (
            <div className="bg-transparent md:card-glass backdrop-blur-md md:rounded-2xl md:border md:border-[#C5A066]/40 md:shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="hidden md:grid grid-cols-12 table-header-glass border-b-2 border-[#C5A066]/40 text-[#C5A066] font-bold p-4 drop-shadow-[0_0_3px_rgba(197,160,102,0.4)]">
                <div className="col-span-4">Ονοματεπώνυμο</div>
                <div className="col-span-3">Τηλέφωνο</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2 text-right">Κατάσταση</div>
              </div>
              <div className="flex flex-col gap-4 md:gap-0">
                {couriers.length === 0 && !loading && (
                  <div className="p-6 text-center text-adaptive">Δεν υπάρχουν ακόμα εγγεγραμμένοι διανομείς.</div>
                )}
                {couriers.map(courier => (
                  <div key={courier.id} className="grid grid-cols-1 md:grid-cols-12 items-center gap-3 md:gap-0 bg-transparent p-4 md:px-4 md:py-3 border border-[#C5A066]/20 md:border-0 md:border-b md:border-[#C5A066]/20 rounded-xl md:rounded-none hover-row-glass transition-colors">
                    <div className="col-span-4 flex flex-col md:block">
                      {editingCourier === courier.id ? (
                        <input type="text" value={editCourierData.full_name} onChange={(e) => setEditCourierData({...editCourierData, full_name: e.target.value})} className="p-2 w-full rounded-md border border-[#C5A066]/30 btn-glass text-adaptive-light outline-none mb-2" placeholder="Ονοματεπώνυμο" />
                      ) : (
                        <span className="font-bold text-adaptive-light text-lg md:text-base flex items-center gap-2"><Bike size={18} /> {courier.full_name}</span>
                      )}
                      
                      <span className="text-adaptive text-sm md:hidden mt-1 flex flex-col gap-2">
                        {editingCourier === courier.id ? (
                          <>
                            <input type="text" value={editCourierData.phone} onChange={(e) => setEditCourierData({...editCourierData, phone: e.target.value})} className="p-2 w-full rounded-md border border-[#C5A066]/30 btn-glass text-adaptive-light outline-none" placeholder="Τηλέφωνο" />
                            <input type="email" value={editCourierData.email} onChange={(e) => setEditCourierData({...editCourierData, email: e.target.value})} className="p-2 w-full rounded-md border border-[#C5A066]/30 btn-glass text-adaptive-light outline-none" placeholder="Email" />
                          </>
                        ) : (
                          <>
                            <span className="flex items-center gap-1"><Phone size={12} /> {courier.phone}</span>
                            <span className="flex items-center gap-1"><Mail size={12} /> {courier.email}</span>
                          </>
                        )}
                      </span>
                    </div>
                    
                    <div className="col-span-3 hidden md:block text-adaptive-light pr-2">
                      {editingCourier === courier.id ? (
                        <input type="text" value={editCourierData.phone} onChange={(e) => setEditCourierData({...editCourierData, phone: e.target.value})} className="p-2 w-full rounded-md border border-[#C5A066]/30 btn-glass text-adaptive-light outline-none" />
                      ) : (
                        courier.phone
                      )}
                    </div>
                    
                    <div className="col-span-3 hidden md:block text-adaptive text-sm truncate pr-2">
                      {editingCourier === courier.id ? (
                        <input type="email" value={editCourierData.email} onChange={(e) => setEditCourierData({...editCourierData, email: e.target.value})} className="p-2 w-full rounded-md border border-[#C5A066]/30 btn-glass text-adaptive-light outline-none" />
                      ) : (
                        courier.email
                      )}
                    </div>
                    <div className="col-span-2 flex flex-col items-end gap-2 mt-2 md:mt-0">
                      {editingCourier === courier.id ? (
                        <div className="flex gap-2 w-full md:w-auto">
                          <button onClick={() => saveCourierDetails(courier.id)} className="flex-1 md:flex-none btn-glass text-[#38EF7D] border border-[#38EF7D]/50 hover:shadow-[inset_0_0_10px_rgba(56,239,125,0.4)] px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-all flex justify-center items-center"><Check size={16}/></button>
                          <button onClick={() => setEditingCourier(null)} className="flex-1 md:flex-none btn-glass text-[#9D4EDD] border border-[#9D4EDD]/50 hover:shadow-[inset_0_0_10px_rgba(157,78,221,0.4)] px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-all flex justify-center items-center"><X size={16}/></button>
                        </div>
                      ) : (
                        <div className="flex gap-2 w-full md:w-auto">
                          <button onClick={() => { setEditingCourier(courier.id); setEditCourierData({ full_name: courier.full_name, phone: courier.phone, email: courier.email }); }} className="flex-1 md:flex-none btn-glass hover:shadow-[inset_0_0_10px_rgba(197,160,102,0.4)] text-[#C5A066] border border-[#C5A066]/30 px-3 py-2 rounded-md cursor-pointer font-bold text-sm transition-all flex items-center justify-center gap-2">
                            <Edit2 size={14} /> Επεξεργασία
                          </button>
                        </div>
                      )}
                      {!editingCourier && (
                        <div className="flex gap-2 w-full md:w-auto mt-1">
                          <button
                            onClick={() => toggleDriverStatus(courier.id, courier.is_active !== false)}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-xl font-bold text-xs transition-colors border ${
                              courier.is_active !== false 
                                ? 'btn-glass text-[#9D4EDD] border-[#9D4EDD]/50 hover:shadow-[inset_0_0_15px_rgba(157,78,221,0.4)]' 
                                : 'btn-glass text-[#38EF7D] border-[#38EF7D]/50 hover:shadow-[inset_0_0_15px_rgba(56,239,125,0.4)]'
                            }`}
                          >
                            {courier.is_active !== false ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
                          </button>
                          <button
                            onClick={() => toggleBlockedStatus(courier.id, 'drivers', courier.is_blocked)}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-xl font-bold text-xs transition-colors border ${
                              courier.is_blocked 
                                ? 'btn-glass text-[#38EF7D] border-[#38EF7D]/50 hover:shadow-[inset_0_0_15px_rgba(56,239,125,0.4)]' 
                                : 'btn-glass text-[#EF4444] border-[#EF4444]/50 hover:shadow-[inset_0_0_15px_rgba(239,68,68,0.4)]'
                            }`}
                          >
                            {courier.is_blocked ? 'Ξεμπλοκάρισμα' : 'Μπλοκάρισμα'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

    </motion.div>
  );
}
