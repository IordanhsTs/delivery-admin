import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { PlusCircle, Store, MapPin, MessageSquare, Rocket, Send } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function CreateOrder() {
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [address, setAddress] = useState('');
  const [comments, setComments] = useState(''); // 1. Νέο state για τα σχόλια
  const [loading, setLoading] = useState(false);

  // Ανάκτηση των καταστημάτων για το dropdown
  useEffect(() => {
    async function fetchStores() {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name')
        .order('name', { ascending: true });
      
      if (data) setStores(data);
      if (error) console.error("Σφάλμα φόρτωσης καταστημάτων:", error);
    }
    fetchStores();
  }, []);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    
    if (!selectedStoreId || !address.trim()) {
      toast.warning("Παρακαλώ επιλέξτε κατάστημα και συμπληρώστε τη διεύθυνση.");
      return;
    }

    setLoading(true);

    // Εισαγωγή της νέας παραγγελίας με status 'pending' και προσθήκη των σχολίων
    const { error } = await supabase
      .from('orders')
      .insert([
        {
          store_id: selectedStoreId,
          address: address.trim(),
          comments: comments.trim() || null, // 2. Αποστολή σχολίων (ή null αν είναι άδειο)
          status: 'pending', 
          created_at: new Date().toISOString()
        }
      ]);

    setLoading(false);

    if (error) {
      toast.error("Υπήρξε σφάλμα κατά τη δημιουργία της παραγγελίας.");
      console.error(error);
    } else {
      toast.success("Η παραγγελία δημιουργήθηκε και προωθήθηκε στους διανομείς!", { icon: <Rocket size={18} /> });
      setAddress('');
      setSelectedStoreId('');
      setComments(''); // 3. Καθαρισμός του πεδίου σχολίων
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