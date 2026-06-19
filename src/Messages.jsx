import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Messages() {
  const [targetType, setTargetType] = useState('store'); // 'store' or 'driver'
  const [targetId, setTargetId] = useState('all'); // 'all' or specific ID
  const [message, setMessage] = useState('');
  
  const [stores, setStores] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' }); // type: 'success' | 'error'
  const [broadcastChannel, setBroadcastChannel] = useState(null);

  useEffect(() => {
    async function fetchEntities() {
      const [storesRes, driversRes] = await Promise.all([
        supabase.from('stores').select('id, name').order('name'),
        supabase.from('drivers').select('id, full_name').order('full_name')
      ]);
      
      if (storesRes.data) setStores(storesRes.data);
      if (driversRes.data) setDrivers(driversRes.data);
    }
    fetchEntities();

    // Προετοιμασία του καναλιού για αποστολή μηνυμάτων (πρέπει να είμαστε subscribed για να κάνουμε broadcast)
    const channel = supabase.channel('system_alerts');
    channel.subscribe((status) => {
      console.log('Broadcast channel status:', status);
    });
    setBroadcastChannel(channel);

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      setFeedback({ type: 'error', text: 'Παρακαλώ πληκτρολογήστε ένα μήνυμα.' });
      return;
    }
    if (!broadcastChannel) {
      setFeedback({ type: 'error', text: 'Αποτυχία σύνδεσης στο σύστημα μηνυμάτων. Ανανεώστε τη σελίδα.' });
      return;
    }

    setLoading(true);
    setFeedback({ type: '', text: '' });

    try {
      const payload = {
        target_type: targetType,
        target_id: targetId,
        message: message.trim(),
        timestamp: new Date().toISOString()
      };

      // Η αποστολή γίνεται μέσω του ήδη συνδεδεμένου καναλιού
      const response = await broadcastChannel.send({
        type: 'broadcast',
        event: 'admin_message',
        payload: payload
      });

      if (response === 'ok') {
        setFeedback({ type: 'success', text: 'Το μήνυμα εστάλη επιτυχώς!' });
        setMessage('');
      } else {
        setFeedback({ type: 'error', text: `Αποτυχία αποστολής (${response}). Ελέγξτε τη σύνδεσή σας.` });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', text: 'Παρουσιάστηκε σφάλμα κατά την αποστολή.' });
    } finally {
      setLoading(false);
      
      // Καθαρισμός του μηνύματος επιτυχίας μετά από 5 δευτερόλεπτα
      setTimeout(() => {
        setFeedback(prev => prev.type === 'success' ? { type: '', text: '' } : prev);
      }, 5000);
    }
  };

  const inputClass = "w-full p-3 rounded-xl focus:outline-none transition-colors text-sm";
  const getDynamicInputStyle = () => ({
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-primary)'
  });

  return (
    <div className="font-sans" style={{ color: 'var(--text-primary)' }}>
      <div className="mb-6">
        <h2 className="m-0 mb-1 text-xl font-bold tracking-wide" style={{ color: 'var(--accent)' }}>
          📢 Αποστολή Μηνυμάτων
        </h2>
        <p className="m-0 text-sm" style={{ color: 'var(--text-muted)' }}>
          Στείλτε ζωντανές ειδοποιήσεις στα Καταστήματα ή τους Διανομείς.
        </p>
      </div>

      <div 
        className="max-w-2xl backdrop-blur-md p-6 rounded-2xl border shadow-lg"
        style={{ 
          backgroundColor: 'var(--bg-card)', 
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-md)'
        }}
      >
        <form onSubmit={handleSend} className="flex flex-col gap-5">
          
          {/* 1. Επιλογή Παραλήπτη (Καταστήματα / Διανομείς) */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              1. Αποστολη προς:
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="targetType" 
                  value="store" 
                  checked={targetType === 'store'} 
                  onChange={() => { setTargetType('store'); setTargetId('all'); }}
                  className="w-4 h-4 accent-[#C5A066]"
                />
                <span className="font-medium" style={{ color: targetType === 'store' ? 'var(--accent)' : 'var(--text-secondary)' }}>Καταστήματα</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="targetType" 
                  value="driver" 
                  checked={targetType === 'driver'} 
                  onChange={() => { setTargetType('driver'); setTargetId('all'); }}
                  className="w-4 h-4 accent-[#C5A066]"
                />
                <span className="font-medium" style={{ color: targetType === 'driver' ? 'var(--accent)' : 'var(--text-secondary)' }}>Διανομείς</span>
              </label>
            </div>
          </div>

          {/* 2. Επιλογή Συγκεκριμένου ή Όλων */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              2. Ποιοι θα το δουν;
            </label>
            <select 
              value={targetId} 
              onChange={e => setTargetId(e.target.value)}
              className={inputClass}
              style={getDynamicInputStyle()}
            >
              <option value="all">Όλοι οι {targetType === 'store' ? 'Καταστηματάρχες' : 'Διανομείς'}</option>
              {targetType === 'store' 
                ? stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                : drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)
              }
            </select>
          </div>

          {/* 3. Μήνυμα */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              3. Το Μηνυμα σας:
            </label>
            <textarea 
              rows="4"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Πληκτρολογήστε το μήνυμά σας εδώ..."
              className={inputClass}
              style={{ ...getDynamicInputStyle(), resize: 'vertical' }}
            />
          </div>

          {/* Feedback (Success/Error) */}
          {feedback.text && (
            <div 
              className="p-3 rounded-xl text-sm font-medium animate-fade-in text-center"
              style={{
                backgroundColor: feedback.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: feedback.type === 'success' ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${feedback.type === 'success' ? 'var(--success-border)' : 'var(--danger-border)'}`
              }}
            >
              {feedback.text}
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-white font-bold transition-all duration-200 mt-2 flex justify-center items-center gap-2"
            style={{ 
              background: loading ? 'var(--accent-hover)' : 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
              boxShadow: loading ? 'none' : '0 4px 16px var(--accent-muted)',
              opacity: loading ? 0.8 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                Αποστολή...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z"/>
                  <path d="M22 2 11 13"/>
                </svg>
                Αποστολή Μηνύματος
              </>
            )}
          </button>

        </form>
      </div>
    </div>
  );
}
