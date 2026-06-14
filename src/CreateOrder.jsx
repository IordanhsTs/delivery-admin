import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CreateOrder() {
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [address, setAddress] = useState('');
  const [comments, setComments] = useState(''); // 1. Νέο state για τα σχόλια
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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
      alert("Παρακαλώ επιλέξτε κατάστημα και συμπληρώστε τη διεύθυνση.");
      return;
    }

    setLoading(true);
    setSuccessMessage('');

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
      alert("Υπήρξε σφάλμα κατά τη δημιουργία της παραγγελίας.");
      console.error(error);
    } else {
      setSuccessMessage("🚀 Η παραγγελία δημιουργήθηκε και προωθήθηκε στους διανομείς!");
      setAddress('');
      setSelectedStoreId('');
      setComments(''); // 3. Καθαρισμός του πεδίου σχολίων
      
      // Εξαφάνιση του μηνύματος επιτυχίας μετά από 4 δευτερόλεπτα
      setTimeout(() => setSuccessMessage(''), 4000);
    }
  };

  return (
    <div className="font-sans max-w-xl mx-auto">
      <div className="mb-6">
        <h2 className="m-0 mb-1 text-slate-800 text-xl font-bold">➕ Δημιουργία Νέας Παραγγελίας</h2>
        <p className="m-0 text-slate-500 text-sm">Καταχωρήστε μια παραγγελία χειροκίνητα για άμεση ανάθεση ή λήψη από τους διανομείς.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <form onSubmit={handleCreateOrder} className="flex flex-col gap-5">
          
          {/* Επιλογή Καταστήματος */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-700 font-bold text-sm">🏢 Επιλογή Καταστήματος</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 bg-white text-slate-800 font-medium transition-colors cursor-pointer"
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
            <label className="text-slate-700 font-bold text-sm">📍 Διεύθυνση Παράδοσης</label>
            <input
              type="text"
              placeholder="π.χ. Μεγάλου Αλεξάνδρου 45, Φλώρινα"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 bg-white text-slate-800 transition-colors"
            />
          </div>

          {/* 4. Νέο Πεδίο για Σχόλια/Οδηγίες */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-700 font-bold text-sm">📝 Σχόλια / Οδηγίες (Προαιρετικό)</label>
            <textarea
              placeholder="π.χ. Κουδούνι Παπαδόπουλος, όροφος 2ος..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows="3"
              className="p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 bg-white text-slate-800 transition-colors resize-none"
            />
          </div>

          {/* Μήνυμα Επιτυχίας */}
          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-sm font-semibold text-center animate-fade-in">
              {successMessage}
            </div>
          )}

          {/* Κουμπί Υποβολής */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-5 border-none rounded-xl cursor-pointer shadow-md shadow-blue-500/20 transition-colors disabled:opacity-50 mt-2 text-base"
          >
            {loading ? 'Αποστολή στο σύστημα...' : '📣 Προώθηση Παραγγελίας'}
          </button>

        </form>
      </div>
    </div>
  );
}