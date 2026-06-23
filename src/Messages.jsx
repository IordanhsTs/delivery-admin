import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Megaphone, Send, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function Messages() {
  const [targetType, setTargetType] = useState('store'); // 'store' or 'driver'
  const [selectedTargets, setSelectedTargets] = useState(['all']);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [message, setMessage] = useState('');

  const toggleTarget = (id) => {
    if (id === 'all') {
      setSelectedTargets(['all']);
    } else {
      let newTargets = selectedTargets.filter(t => t !== 'all');
      if (newTargets.includes(id)) {
        newTargets = newTargets.filter(t => t !== id);
      } else {
        newTargets.push(id);
      }
      if (newTargets.length === 0) newTargets = ['all'];
      setSelectedTargets(newTargets);
    }
  };
  
  const [stores, setStores] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
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
      toast.error('Παρακαλώ πληκτρολογήστε ένα μήνυμα.');
      return;
    }
    if (!broadcastChannel) {
      toast.error('Αποτυχία σύνδεσης στο σύστημα μηνυμάτων. Ανανεώστε τη σελίδα.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        target_type: targetType,
        target_ids: selectedTargets,
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
        toast.success('Το μήνυμα εστάλη επιτυχώς!');
        setMessage('');
      } else {
        toast.error(`Αποτυχία αποστολής (${response}). Ελέγξτε τη σύνδεσή σας.`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Παρουσιάστηκε σφάλμα κατά την αποστολή.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full p-3 rounded-xl focus:outline-none transition-colors text-sm";
  const getDynamicInputStyle = () => ({
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-primary)'
  });

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="font-sans" 
      style={{ color: 'var(--text-primary)' }}
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone className="text-[#C5A066]" size={24} />
          <h2 className="m-0 text-xl font-bold tracking-wide" style={{ color: 'var(--accent)' }}>
            Αποστολή Μηνυμάτων
          </h2>
        </div>
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
                  onChange={() => { setTargetType('store'); setSelectedTargets(['all']); }}
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
                  onChange={() => { setTargetType('driver'); setSelectedTargets(['all']); }}
                  className="w-4 h-4 accent-[#C5A066]"
                />
                <span className="font-medium" style={{ color: targetType === 'driver' ? 'var(--accent)' : 'var(--text-secondary)' }}>Διανομείς</span>
              </label>
            </div>
          </div>

          {/* 2. Επιλογή Συγκεκριμένου ή Όλων (Πολλαπλή Επιλογή) */}
          <div className="flex flex-col gap-2 relative">
            <label className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              2. Ποιοι θα το δουν; (Επιλέξτε ένα ή περισσότερα)
            </label>
            
            <div 
              className={`flex items-center justify-between cursor-pointer ${inputClass}`}
              style={getDynamicInputStyle()}
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <span className="truncate">
                {selectedTargets.includes('all') 
                  ? `Όλοι οι ${targetType === 'store' ? 'Καταστηματάρχες' : 'Διανομείς'}` 
                  : `${selectedTargets.length} επιλεγμένοι παραλήπτες`
                }
              </span>
              <ChevronDown size={18} className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {dropdownOpen && (
              <div 
                className="absolute top-full left-0 right-0 mt-2 z-20 flex flex-col gap-1.5 max-h-60 overflow-y-auto p-3 rounded-xl border text-sm shadow-xl"
                style={{ ...getDynamicInputStyle(), backgroundColor: 'var(--bg-card)' }}
              >
                <label className="flex items-center gap-3 cursor-pointer p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
                  <input 
                    type="checkbox" 
                    checked={selectedTargets.includes('all')} 
                    onChange={() => toggleTarget('all')}
                    className="w-4 h-4 accent-[#C5A066]"
                  />
                  <span className="font-semibold text-[var(--text-primary)]">Όλοι οι {targetType === 'store' ? 'Καταστηματάρχες' : 'Διανομείς'}</span>
                </label>
                
                {(targetType === 'store' ? stores : drivers).map(entity => (
                  <label key={entity.id} className="flex items-center gap-3 cursor-pointer p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
                    <input 
                      type="checkbox" 
                      checked={selectedTargets.includes(entity.id)} 
                      onChange={() => toggleTarget(entity.id)}
                      className="w-4 h-4 accent-[#C5A066]"
                    />
                    <span className="text-[var(--text-primary)]">{entity.name || entity.full_name}</span>
                  </label>
                ))}
              </div>
            )}
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
                <Send size={18} />
                Αποστολή Μηνύματος
              </>
            )}
          </button>

        </form>
      </div>
    </motion.div>
  );
}
