import React, { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Χρήση Supabase για αυθεντικοποίηση
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError('Λάθος Email ή Κωδικός');
      } else {
        setError(`Σφάλμα: ${error.message}`);
      }
    } else if (data?.user) {
      // ΕΛΕΓΧΟΣ ΑΣΦΑΛΕΙΑΣ: Είναι αυτός ο χρήστης Διανομέας ή Κατάστημα;
      const { data: isDriver } = await supabase.from('drivers').select('id').eq('email', data.user.email).maybeSingle();
      const { data: isStore } = await supabase.from('stores').select('id').eq('email', data.user.email).maybeSingle();

      if (isDriver || isStore) {
        // Αν είναι, τον κάνουμε αμέσως Αποσύνδεση!
        await supabase.auth.signOut();
        setError('Απαγορεύεται η πρόσβαση. Αυτό το panel είναι μόνο για τους διαχειριστές.');
      } else {
        onLogin(); // Επιτυχής σύνδεση (Είναι ο Admin)
      }
    }
    
    setLoading(false);
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-sky-50 font-sans">
      <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🛵</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 m-0">DeliveryAdmin</h1>
          <p className="text-slate-500 text-sm mt-2">Είσοδος στο Κέντρο Ελέγχου</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm text-center border border-red-200 font-medium">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-slate-700 ml-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all bg-slate-50"
              placeholder="π.χ. admin@example.com"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-slate-700 ml-1">Κωδικός Πρόσβασης</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all bg-slate-50"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className={`mt-4 w-full text-white font-bold py-3.5 rounded-xl transition-all shadow-md text-lg ${
              loading 
                ? 'bg-blue-400 cursor-not-allowed shadow-blue-400/30' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
            }`}
          >
            {loading ? 'Σύνδεση...' : 'Είσοδος'}
          </button>
        </form>

      </div>
    </div>
  );
}
