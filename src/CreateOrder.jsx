import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { PlusCircle, Store, MapPin, MessageSquare, Rocket, Send, Bike } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function CreateOrder() {
  const [stores, setStores] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [address, setAddress] = useState('');
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  // Ανάκτηση δεδομένων για τα dropdowns
  useEffect(() => {
    async function fetchData() {
      const [storesRes, driversRes] = await Promise.all([
        supabase.from('stores').select('id, name').order('name', { ascending: true }),
        supabase.from('drivers').select('id, full_name').eq('is_active', true).order('full_name', { ascending: true })
      ]);
      
      if (storesRes.data) setStores(storesRes.data);
      if (storesRes.error) console.error("Σφάλμα φόρτωσης καταστημάτων:", storesRes.error);
      
      if (driversRes.data) setDrivers(driversRes.data);
      if (driversRes.error) console.error("Σφάλμα φόρτωσης διανομέων:", driversRes.error);
    }
    fetchData();
  }, []);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    
    if (!selectedStoreId || !address.trim()) {
      toast.warning("Παρακαλώ επιλέξτε κατάστημα και συμπληρώστε τη διεύθυνση.");
      return;
    }

    setLoading(true);

    const isDirectAssignment = !!selectedDriverId;
    const newOrder = {
      store_id: selectedStoreId,
      address: address.trim(),
      comments: comments.trim() || null,
      status: isDirectAssignment ? 'accepted' : 'pending',
      created_at: new Date().toISOString()
    };
    
    if (isDirectAssignment) {
      newOrder.driver_id = selectedDriverId;
      newOrder.accepted_at = new Date().toISOString();
    }

    // Εισαγωγή της νέας παραγγελίας
    const { error } = await supabase.from('orders').insert([newOrder]);

    setLoading(false);

    if (error) {
      toast.error("Υπήρξε σφάλμα κατά τη δημιουργία της παραγγελίας.");
      console.error(error);
    } else {
      if (isDirectAssignment) {
        toast.success("Η παραγγελία ανατέθηκε απευθείας στον διανομέα!", { icon: <Rocket size={18} /> });
      } else {
        toast.success("Η παραγγελία δημιουργήθηκε και προωθήθηκε σε όλους!", { icon: <Rocket size={18} /> });
      }
      setAddress('');
      setSelectedStoreId('');
      setSelectedDriverId('');
      setComments('');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="font-sans max-w-xl mx-auto text-adaptive-light"
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <PlusCircle className="text-[#C5A066]" size={24} />
          <h2 className="m-0 text-[#C5A066] text-xl font-bold drop-shadow-[0_0_8px_rgba(197,160,102,0.5)] tracking-wide">Δημιουργία Νέας Παραγγελίας</h2>
        </div>
        <p className="m-0 text-adaptive text-sm">Καταχωρήστε μια παραγγελία χειροκίνητα για άμεση ανάθεση ή λήψη από τους διανομείς.</p>
      </div>

      <div className="card-glass backdrop-blur-md border border-[#C5A066]/40 rounded-2xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        <form onSubmit={handleCreateOrder} className="flex flex-col gap-5">
          
          {/* Επιλογή Καταστήματος */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#C5A066] font-bold text-sm flex items-center gap-2"><Store size={16} /> Επιλογή Καταστήματος</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="p-3 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light font-medium transition-colors cursor-pointer"
            >
              <option value="">-- Επιλέξτε Κατάστημα --</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          {/* Επιλογή Διανομέα (Απευθείας Ανάθεση) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#C5A066] font-bold text-sm flex items-center gap-2"><Bike size={16} /> Απευθείας Ανάθεση (Προαιρετικό)</label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="p-3 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light font-medium transition-colors cursor-pointer"
            >
              <option value="">-- Χωρίς Απευθείας Ανάθεση (Προς όλους) --</option>
              {drivers.map(driver => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Διεύθυνση Παράδοσης */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#C5A066] font-bold text-sm flex items-center gap-2"><MapPin size={16} /> Διεύθυνση Παράδοσης</label>
            <input
              type="text"
              placeholder="π.χ. Μεγάλου Αλεξάνδρου 45, Φλώρινα"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="p-3 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light placeholder-slate-600 transition-colors"
            />
          </div>

          {/* 4. Νέο Πεδίο για Σχόλια/Οδηγίες */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#C5A066] font-bold text-sm flex items-center gap-2"><MessageSquare size={16} /> Σχόλια / Οδηγίες (Προαιρετικό)</label>
            <textarea
              placeholder="π.χ. Κουδούνι Παπαδόπουλος, όροφος 2ος..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows="3"
              className="p-3 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light placeholder-slate-600 transition-colors resize-none"
            />
          </div>

          {/* Κουμπί Υποβολής */}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-glass border border-[#C5A066]/50 text-[#C5A066] hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] font-bold py-3 px-5 rounded-xl cursor-pointer transition-all disabled:opacity-50 mt-2 text-base flex items-center justify-center gap-2"
          >
            {loading ? 'Αποστολή στο σύστημα...' : <><Send size={18} /> Προώθηση Παραγγελίας</>}
          </button>

        </form>
      </div>
    </motion.div>
  );
}