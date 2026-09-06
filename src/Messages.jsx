import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { liveChannel } from './live';
import { pushFailureReason, invokeWithAuthRetry } from './pushErrors';
import { Megaphone, Send, ChevronDown, Search, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import StoreInbox from './StoreInbox';
import { useBackClose } from './backNav';
import { norm } from './searchText';

/** Καταστήματα έχουν `name`, διανομείς `full_name` — μία θέση να το ξέρει. */
const labelOf = (entity) => entity.name || entity.full_name || '';

export default function Messages() {
  const [targetType, setTargetType] = useState('store'); // 'store' or 'driver'
  const [selectedTargets, setSelectedTargets] = useState(['all']);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [message, setMessage] = useState('');
  // ΑΝΑΖΗΤΗΣΗ ΠΑΡΑΛΗΠΤΗ (αίτημα πελάτη 06/09/2026): «αν έχω 29 διανομείς ή 50
  // καταστήματα δεν θα κάθομαι να ψάχνω αυτόν που θέλω». Πληκτρολογείς όνομα,
  // από κάτω μένουν μόνο όσοι ταιριάζουν.
  const [query, setQuery] = useState('');
  const pickerRef = useRef(null);

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
  // Το κανάλι εκπομπής ζει σε ref, όχι σε state: το liveChannel το ΞΑΝΑΧΤΙΖΕΙ όταν
  // πέσει (καρτέλα admin ανοιχτή όλη μέρα), οπότε μια παγωμένη αναφορά θα έστελνε
  // τα μηνύματα σε νεκρό κανάλι.
  const broadcastRef = useRef(null);
  // Το `disabled={loading}` στο κουμπί δεν προλαβαίνει ένα γρήγορο διπλό κλικ πριν
  // ξαναγίνει render — δύο ταυτόχρονες κλήσεις functions.invoke() με το ίδιο token
  // υπό ανανέωση μπορεί η μία να πετύχει (φτάνει το push) και η άλλη να πέσει σε 401,
  // δείχνοντας σφάλμα ενώ το μήνυμα ήδη παραδόθηκε. Το ref μπλοκάρει συγχρονισμένα.
  const sendingRef = useRef(false);

  // ── Η λίστα παραληπτών, φιλτραρισμένη με ό,τι πληκτρολογείται ─────────────
  const entities = targetType === 'store' ? stores : drivers;
  const q = norm(query);
  const filtered = q ? entities.filter((e) => norm(labelOf(e)).includes(q)) : entities;
  // Τα ονόματα των ήδη επιλεγμένων — για τα chips πάνω από το πεδίο. Δεν
  // φιλτράρονται: ο διαχειριστής πρέπει να βλέπει τι έχει διαλέξει ακόμη κι όσο
  // ψάχνει τον επόμενο.
  const chosen = selectedTargets.includes('all')
    ? []
    : entities.filter((e) => selectedTargets.includes(e.id));

  // Κλείσιμο με κλικ έξω από το πλαίσιο. Χωρίς αυτό το μενού έμενε ανοιχτό και
  // σκέπαζε το πεδίο του μηνύματος από κάτω.
  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const onDown = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dropdownOpen]);

  // Το κουμπί «πίσω» του κινητού κλείνει πρώτα το μενού, όπως κάθε άλλο στρώμα.
  useBackClose(dropdownOpen, () => setDropdownOpen(false));

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

    // Προετοιμασία του καναλιού για αποστολή μηνυμάτων (πρέπει να είμαστε subscribed
    // για να κάνουμε broadcast). ΠΡΟΣΟΧΗ: unique:false — σε broadcast το όνομα ΕΙΝΑΙ
    // η διεύθυνση και πρέπει να ταιριάζει με αυτό που ακούν καταστήματα/διανομείς.
    const stop = liveChannel({
      name: 'system_alerts',
      unique: false,
      bind: (channel) => {
        broadcastRef.current = channel;
        return channel;
      },
    });

    return () => {
      stop();
      broadcastRef.current = null;
    };
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (sendingRef.current) return;
    if (!message.trim()) {
      toast.error('Παρακαλώ πληκτρολογήστε ένα μήνυμα.');
      return;
    }
    if (!broadcastRef.current) {
      toast.error('Αποτυχία σύνδεσης στο σύστημα μηνυμάτων. Ανανεώστε τη σελίδα.');
      return;
    }

    sendingRef.current = true;
    setLoading(true);

    try {
      const payload = {
        target_type: targetType,
        target_ids: selectedTargets,
        message: message.trim(),
        timestamp: new Date().toISOString()
      };

      // Η αποστολή γίνεται μέσω του ήδη συνδεδεμένου καναλιού
      const response = await broadcastRef.current.send({
        type: 'broadcast',
        event: 'admin_message',
        payload: payload
      });

      if (response === 'ok') {
        toast.success('Το μήνυμα εστάλη επιτυχώς!');
        setMessage('');

        // Το broadcast φτάνει μόνο σε ανοιχτή/συνδεδεμένη εφαρμογή. Ο διανομέας
        // συχνά οδηγεί με κλειδωμένο κινητό, οπότε στέλνουμε ΚΑΙ πραγματικό OS
        // push (FCM) με ήχο — τα καταστήματα δεν το χρειάζονται, μένουν ανοιχτά
        // σε συσκευή στο μαγαζί.
        if (targetType === 'driver') {
          try {
            const { data, error: pushError } = await invokeWithAuthRetry('send-message-notification', {
              body: { targetIds: selectedTargets, message: payload.message },
            });
            // Η αποτυχία εδώ ήταν ΕΝΤΕΛΩΣ σιωπηλή (μόνο console.error): το πράσινο
            // «εστάλη επιτυχώς» αφορά το broadcast, που δουλεύει μόνο με ανοιχτή
            // εφαρμογή. Αν έπεφτε το push, ο διαχειριστής νόμιζε ότι ειδοποίησε
            // διανομείς με κλειδωμένο κινητό ενώ δεν είχε φτάσει τίποτα.
            if (pushError) {
              const reason = await pushFailureReason(pushError);
              console.error('[message push]', pushError, reason);
              toast.error(`Το μήνυμα δεν έφτασε ως ειδοποίηση στα κινητά. ${reason}`);
            } else if (data?.skipped || data?.sent === 0) {
              toast.warning('Κανένας από τους επιλεγμένους διανομείς δεν έχει ενεργές ειδοποιήσεις — θα το δουν μόνο αν ανοίξουν την εφαρμογή.');
            }
          } catch (e) {
            console.error('[message push]', e);
            toast.error('Το μήνυμα δεν έφτασε ως ειδοποίηση στα κινητά — δεν υπήρξε απάντηση από τον διακομιστή.');
          }
        }
      } else {
        toast.error(`Αποτυχία αποστολής (${response}). Ελέγξτε τη σύνδεσή σας.`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Παρουσιάστηκε σφάλμα κατά την αποστολή.');
    } finally {
      setLoading(false);
      sendingRef.current = false;
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

      {/* Η καρτέλα εισερχομένων μπαίνει ΔΙΠΛΑ στη φόρμα (σε μεγάλες οθόνες), όχι από
          κάτω — ο πελάτης δεν ήθελε να κάνει scroll για να δει τα μηνύματα καταστημάτων
          ενώ γράφει ένα νέο μήνυμα. Σε στενή οθόνη πέφτουν η μία κάτω από την άλλη. */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div
        className="w-full lg:flex-1 max-w-2xl backdrop-blur-md p-6 rounded-2xl border shadow-lg card-surface"
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
                  onChange={() => { setTargetType('store'); setSelectedTargets(['all']); setQuery(''); }}
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
                  onChange={() => { setTargetType('driver'); setSelectedTargets(['all']); setQuery(''); }}
                  className="w-4 h-4 accent-[#C5A066]"
                />
                <span className="font-medium" style={{ color: targetType === 'driver' ? 'var(--accent)' : 'var(--text-secondary)' }}>Διανομείς</span>
              </label>
            </div>
          </div>

          {/* 2. Επιλογή Συγκεκριμένου ή Όλων (πληκτρολόγηση ονόματος + πολλαπλή επιλογή) */}
          <div className="flex flex-col gap-2" ref={pickerRef}>
            <label className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              2. Ποιοι θα το δουν; (γράψτε όνομα ή επιλέξτε)
            </label>

            {/* Οι ήδη επιλεγμένοι, ως αφαιρούμενα chips. Το «Όλοι» δεν γίνεται chip —
                είναι η προεπιλογή και φαίνεται μέσα στο πεδίο. */}
            {chosen.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chosen.map(entity => (
                  <span
                    key={entity.id}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}
                  >
                    {labelOf(entity)}
                    <button
                      type="button"
                      onClick={() => toggleTarget(entity.id)}
                      className="p-0.5 rounded hover:bg-black/10"
                      title="Αφαίρεση παραλήπτη"
                      aria-label={`Αφαίρεση ${labelOf(entity)}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedTargets(['all'])}
                  className="text-xs font-semibold px-2 py-1 rounded-lg"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Καθαρισμός
                </button>
              </div>
            )}

            {/* Το πεδίο είναι ΚΑΝΟΝΙΚΟ input, όχι ψεύτικο κουμπί: στο κινητό ανοίγει
                πληκτρολόγιο και ο διαχειριστής γράφει κατευθείαν το όνομα. */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                placeholder={
                  selectedTargets.includes('all')
                    ? `Όλοι οι ${targetType === 'store' ? 'Καταστηματάρχες' : 'Διανομείς'} — γράψτε για συγκεκριμένο`
                    : `${selectedTargets.length} επιλεγμένοι — γράψτε για να προσθέσετε`
                }
                className={`${inputClass} pl-9 pr-10`}
                style={getDynamicInputStyle()}
              />
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg"
                style={{ color: 'var(--text-muted)' }}
                title={dropdownOpen ? 'Κλείσιμο λίστας' : 'Άνοιγμα λίστας'}
                aria-label={dropdownOpen ? 'Κλείσιμο λίστας' : 'Άνοιγμα λίστας'}
              >
                <ChevronDown size={18} className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-2 z-20 flex flex-col gap-1.5 max-h-60 overflow-y-auto p-3 rounded-xl border text-sm shadow-xl"
                  style={{ ...getDynamicInputStyle(), backgroundColor: 'var(--bg-card)' }}
                >
                  {/* Το «Όλοι» κρύβεται μόλις αρχίσει η αναζήτηση: όποιος γράφει
                      όνομα δεν ψάχνει το «σε όλους». */}
                  {!q && (
                    <label className="flex items-center gap-3 cursor-pointer p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedTargets.includes('all')}
                        onChange={() => toggleTarget('all')}
                        className="w-4 h-4 accent-[#C5A066]"
                      />
                      <span className="font-semibold text-[var(--text-primary)]">Όλοι οι {targetType === 'store' ? 'Καταστηματάρχες' : 'Διανομείς'}</span>
                    </label>
                  )}

                  {filtered.length === 0 ? (
                    <p className="m-0 p-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                      Κανένα αποτέλεσμα για «{query}».
                    </p>
                  ) : (
                    filtered.map(entity => {
                      const picked = selectedTargets.includes(entity.id);
                      return (
                        <label key={entity.id} className="flex items-center gap-3 cursor-pointer p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            checked={picked}
                            onChange={() => toggleTarget(entity.id)}
                            className="w-4 h-4 accent-[#C5A066]"
                          />
                          <span className="text-[var(--text-primary)] flex-1">{labelOf(entity)}</span>
                          {picked && <Check size={14} style={{ color: 'var(--accent)' }} />}
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>
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

      {/* Εισερχόμενα από τα καταστήματα */}
      <div className="w-full lg:flex-1">
        <StoreInbox />
      </div>
      </div>
    </motion.div>
  );
}
