import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { invokeWithAuthRetry, pushFailureReason } from './pushErrors';
import {
  PlusCircle, Store, MapPin, MessageSquare, Rocket, Send, Bike,
  Search, Star, Route, AlertTriangle, Loader2, Building,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import SearchableSelect from './SearchableSelect';
import {
  MIN_CHARS, DEBOUNCE_MS, newSessionToken, splitAddress,
  fetchSuggestions, fetchPlaceDetails, measureRoadDistance,
} from './places';
import { surchargeFor, formatKm, formatEuro, MAX_DISTANCE_KM } from './distance';

export default function CreateOrder() {
  const [stores, setStores] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [address, setAddress] = useState('');
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Προτεινόμενες οδοί (αίτημα πελάτη 06/09/2026) ─────────────────────────
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  // Το σημείο που «κλείδωσε» ο διαχειριστής διαλέγοντας πρόταση ή αποθηκευμένη
  // διεύθυνση. Όσο είναι null, η παραγγελία γράφεται χωρίς απόσταση — ακριβώς
  // όπως γινόταν μέχρι σήμερα σε ΚΑΘΕ παραγγελία του admin.
  const [point, setPoint] = useState(null);
  const [distance, setDistance] = useState({ km: null, source: null, minutes: null });
  const [measuring, setMeasuring] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);

  // Ένα session token για ΟΛΗ την αναζήτηση μιας διεύθυνσης — βλ. places.js.
  const sessionRef = useRef(newSessionToken());
  const boxRef = useRef(null);
  // Αγνοεί απαντήσεις που ήρθαν εκπρόθεσμα: με γρήγορη πληκτρολόγηση μπορεί να
  // επιστρέψει πρώτα το αίτημα του «Μεγ» και μετά αυτό του «Μεγάλου».
  const reqIdRef = useRef(0);
  // Όταν το πεδίο γεμίζει ΠΡΟΓΡΑΜΜΑΤΙΣΤΙΚΑ (διάλεξε πρόταση ή αποθηκευμένη
  // διεύθυνση), το effect της αναζήτησης δεν πρέπει να ξαναχτυπήσει: θα ξόδευε
  // κλήση για κείμενο που μόλις επιβεβαιώθηκε ΚΑΙ θα ξανάνοιγε τη λίστα που
  // μόλις έκλεισε, 350ms αφότου ο διαχειριστής νόμιζε ότι τελείωσε.
  const skipSearchRef = useRef(false);

  const selectedStore = stores.find((s) => s.id === selectedStoreId) || null;
  const origin = selectedStore?.latitude != null && selectedStore?.longitude != null
    ? { lat: selectedStore.latitude, lon: selectedStore.longitude }
    : null;

  const surcharge = surchargeFor(distance.km);
  const tooFar = distance.km !== null && distance.km > MAX_DISTANCE_KM;

  // Οι προτάσεις ΠΑΡΑΓΟΝΤΑΙ, δεν καθαρίζονται: μόλις το κείμενο πέσει κάτω από
  // το ελάχιστο, η λίστα αδειάζει μόνη της χωρίς δεύτερο render.
  const visibleSuggestions =
    splitAddress(address).street.length >= MIN_CHARS ? suggestions : [];

  // ── Ανάκτηση δεδομένων για τα dropdowns ───────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      const [storesRes, driversRes] = await Promise.all([
        // latitude/longitude: η αφετηρία για τον υπολογισμό απόστασης. Όταν
        // λείπουν (κατάστημα που δεν έχει γεωκωδικοποιηθεί ποτέ) η φόρμα απλά
        // δεν δείχνει απόσταση — δεν μπλοκάρει παραγγελία.
        supabase.from('stores').select('id, name, latitude, longitude').order('name', { ascending: true }),
        supabase.from('drivers').select('id, full_name').eq('is_active', true).order('full_name', { ascending: true }),
      ]);

      if (storesRes.data) setStores(storesRes.data);
      if (storesRes.error) console.error('Σφάλμα φόρτωσης καταστημάτων:', storesRes.error);

      if (driversRes.data) setDrivers(driversRes.data);
      if (driversRes.error) console.error('Σφάλμα φόρτωσης διανομέων:', driversRes.error);
    }
    fetchData();
  }, []);

  // ── Οι αποθηκευμένες διευθύνσεις του επιλεγμένου καταστήματος ─────────────
  // Αίτημα πελάτη 06/09/2026. Είναι οι ίδιες που βλέπει το κατάστημα στη δική
  // του φόρμα: όταν ο πελάτης τηλεφωνεί στο κέντρο αντί στο μαγαζί, ο
  // διαχειριστής δεν χρειάζεται να ξαναγράψει διεύθυνση που υπάρχει ήδη.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedStoreId) { if (!cancelled) setSavedAddresses([]); return; }
      const { data, error } = await supabase
        .from('saved_addresses')
        .select('id, label, address, latitude, longitude')
        .eq('store_id', selectedStoreId)
        .order('label');
      if (cancelled) return;
      if (error) { console.error('Σφάλμα αποθηκευμένων διευθύνσεων:', error); setSavedAddresses([]); return; }
      setSavedAddresses(data || []);
    })();
    return () => { cancelled = true; };
  }, [selectedStoreId]);

  // ── Μέτρηση απόστασης όποτε αλλάζει σημείο ή κατάστημα ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!point || !origin) {
        if (!cancelled) setDistance({ km: null, source: null, minutes: null });
        return;
      }
      setMeasuring(true);
      const d = await measureRoadDistance(origin, point);
      if (cancelled) return;
      setDistance(d);
      setMeasuring(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, selectedStoreId]);

  // ── Κλείσιμο της λίστας με κλικ έξω ───────────────────────────────────────
  useEffect(() => {
    if (!showSuggestions) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showSuggestions]);

  // ── Αναζήτηση με debounce ─────────────────────────────────────────────────
  // Χωρίς αυτό, κάθε πλήκτρο θα ήταν μία κλήση στη Google.
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return undefined;
    }

    const { street } = splitAddress(address);
    // Πολύ λίγοι χαρακτήρες: δεν ρωτάμε καθόλου. Η λίστα δεν χρειάζεται
    // καθάρισμα με setState — παράγεται από το `visibleSuggestions` παρακάτω.
    if (street.length < MIN_CHARS) return undefined;

    const id = ++reqIdRef.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const list = await fetchSuggestions(street, sessionRef.current);
      // Εκπρόθεσμη απάντηση παλιότερης πληκτρολόγησης — την πετάμε.
      if (id !== reqIdRef.current) return;
      setSuggestions(list);
      setShowSuggestions(list.length > 0);
      setSearching(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [address]);

  /** Ο διαχειριστής διάλεξε πρόταση: κλείνει το session και παίρνει σημείο. */
  const pickSuggestion = useCallback(async (s) => {
    const { number } = splitAddress(address);
    // Ο αριθμός που έγραψε ήδη διατηρείται: η πρόταση δίνει την οδό, ο αριθμός
    // είναι δική του πληροφορία που η Google συχνά δεν ξέρει.
    const text = number ? `${s.street} ${number}` : s.street;
    skipSearchRef.current = true;
    setAddress(text);
    setShowSuggestions(false);
    setSuggestions([]);

    const details = await fetchPlaceDetails(s.placeId, sessionRef.current);
    // Το session έκλεισε με πραγματικό Place Details — από εδώ και πέρα νέο.
    sessionRef.current = newSessionToken();
    if (details) setPoint({ lat: details.lat, lon: details.lon });
  }, [address]);

  /** Αποθηκευμένη διεύθυνση: έτοιμο κείμενο ΚΑΙ έτοιμο σημείο, καμία κλήση. */
  const pickSaved = (a) => {
    skipSearchRef.current = true;
    setAddress(a.address);
    setShowSuggestions(false);
    setSuggestions([]);
    setPoint(a.latitude != null && a.longitude != null ? { lat: a.latitude, lon: a.longitude } : null);
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();

    if (!selectedStoreId || !address.trim()) {
      toast.warning('Παρακαλώ επιλέξτε κατάστημα και συμπληρώστε τη διεύθυνση.');
      return;
    }
    if (tooFar) {
      toast.error(`Η διεύθυνση απέχει ${formatKm(distance.km)} — πάνω από το όριο των ${MAX_DISTANCE_KM} χλμ.`);
      return;
    }

    setLoading(true);

    const isDirectAssignment = !!selectedDriverId;
    const newOrder = {
      store_id: selectedStoreId,
      address: address.trim(),
      comments: comments.trim() || null,
      status: isDirectAssignment ? 'accepted' : 'pending',
      created_at: new Date().toISOString(),
      // ΤΑ ΧΙΛΙΟΜΕΤΡΑ ΚΑΙ Η ΕΠΙΒΑΡΥΝΣΗ ΓΡΑΦΟΝΤΑΙ ΤΩΡΑ (06/09/2026): μέχρι σήμερα
      // κάθε παραγγελία του admin έμπαινε με null και μετρούσε μηδέν επιβάρυνση
      // στην εκκαθάριση, ενώ η ίδια διεύθυνση από το κατάστημα χρεωνόταν κανονικά.
      // Μένουν null όταν δεν ξέρουμε σημείο — καλύτερα κενό από ψεύτικο νούμερο.
      distance_km: distance.km,
      surcharge: distance.km === null ? null : surcharge,
    };

    if (isDirectAssignment) {
      newOrder.driver_id = selectedDriverId;
      newOrder.accepted_at = new Date().toISOString();
    }

    // Εισαγωγή της νέας παραγγελίας. Στην απευθείας ανάθεση η παραγγελία μπαίνει
    // κατευθείαν με status 'accepted', οπότε το webhook του send-order-notification
    // (που πυροδοτεί μόνο σε INSERT με status 'pending') ΔΕΝ θα στείλει τίποτα —
    // ο ήχος ανάθεσης πρέπει να έρθει ρητά από το send-assignment-notification,
    // ακριβώς όπως κάνει το LiveMap όταν αναθέτεις υπάρχουσα παραγγελία.
    const { data: inserted, error } = await supabase.from('orders').insert([newOrder]).select('id').single();

    setLoading(false);

    if (error) {
      toast.error('Υπήρξε σφάλμα κατά τη δημιουργία της παραγγελίας.');
      console.error(error);
    } else {
      if (isDirectAssignment) {
        toast.success('Η παραγγελία ανατέθηκε απευθείας στον διανομέα!', { icon: <Rocket size={18} /> });
        notifyDriverOfAssignment(inserted.id, selectedDriverId, 'assign');
      } else {
        toast.success('Η παραγγελία δημιουργήθηκε και προωθήθηκε σε όλους!', { icon: <Rocket size={18} /> });
      }
      setAddress('');
      setSelectedStoreId('');
      setSelectedDriverId('');
      setComments('');
      setPoint(null);
      setDistance({ km: null, source: null, minutes: null });
      // Νέα παραγγελία = νέα αναζήτηση διεύθυνσης, άρα νέο session token.
      sessionRef.current = newSessionToken();
    }
  };

  // Push στον διανομέα τη ΣΤΙΓΜΗ της απευθείας ανάθεσης — ίδιο pattern με το
  // LiveMap.jsx (notifyDriverOfAssignment). Αστοχία εδώ ΔΕΝ ακυρώνει τη
  // δημιουργία: η παραγγελία έχει ήδη καταχωρηθεί.
  const notifyDriverOfAssignment = async (orderId, driverId, kind) => {
    try {
      const { data, error } = await invokeWithAuthRetry('send-assignment-notification', {
        body: { orderId, driverId, kind },
      });
      if (error) {
        const reason = await pushFailureReason(error);
        console.error('[assignment push]', error, reason);
        toast.error(`Η ειδοποίηση στον διανομέα απέτυχε. ${reason}`);
        return;
      }
      if (data?.skipped) {
        toast.warning('Ο διανομέας δεν έχει ενεργές ειδοποιήσεις στο κινητό του — δεν θα χτυπήσει. Πρέπει να μπει στην εφαρμογή και να δώσει άδεια ειδοποιήσεων.');
      }
    } catch (e) {
      console.error('[assignment push]', e);
      toast.error('Η ειδοποίηση στον διανομέα απέτυχε — δεν υπήρξε απάντηση από τον διακομιστή.');
    }
  };

  const fieldClass = 'p-3 rounded-xl border border-[#C5A066]/30 outline-none focus:border-[#C5A066] focus:ring-1 focus:ring-[#C5A066]/50 btn-glass text-adaptive-light font-medium transition-colors';

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
            <SearchableSelect
              value={selectedStoreId}
              onChange={setSelectedStoreId}
              options={stores.map((store) => ({ value: store.id, label: store.name }))}
              emptyLabel="-- Επιλέξτε Κατάστημα --"
              className={fieldClass}
            />
            {selectedStore && !origin ? (
              <p className="text-[11px] flex items-start gap-1.5 mt-0.5" style={{ color: 'var(--warning)' }}>
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                Το κατάστημα δεν έχει σημείο στον χάρτη — η παραγγελία θα καταχωρηθεί χωρίς χιλιόμετρα και επιβάρυνση.
              </p>
            ) : null}
          </div>

          {/* Επιλογή Διανομέα (Απευθείας Ανάθεση) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#C5A066] font-bold text-sm flex items-center gap-2"><Bike size={16} /> Απευθείας Ανάθεση (Προαιρετικό)</label>
            <SearchableSelect
              value={selectedDriverId}
              onChange={setSelectedDriverId}
              options={drivers.map((driver) => ({ value: driver.id, label: driver.full_name }))}
              emptyLabel="-- Χωρίς Απευθείας Ανάθεση (Προς όλους) --"
              className={fieldClass}
            />
          </div>

          {/* Διεύθυνση Παράδοσης, με προτεινόμενες οδούς */}
          <div className="flex flex-col gap-1.5" ref={boxRef}>
            <label className="text-[#C5A066] font-bold text-sm flex items-center gap-2"><MapPin size={16} /> Διεύθυνση Παράδοσης</label>

            {/* Αποθηκευμένες διευθύνσεις του καταστήματος — ένα κλικ, καμία κλήση */}
            {savedAddresses.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {savedAddresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pickSaved(a)}
                    title={a.address}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}
                  >
                    <Star size={12} /> {a.label}
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="π.χ. Μεγάλου Αλεξάνδρου 45"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  // Το κείμενο άλλαξε χειροκίνητα: το παλιό σημείο δεν το
                  // περιγράφει πια, άρα φεύγει μαζί του και η απόσταση. Καλύτερα
                  // καμία χρέωση από χρέωση άλλης διεύθυνσης.
                  setPoint(null);
                }}
                onFocus={() => { if (visibleSuggestions.length) setShowSuggestions(true); }}
                className={`w-full pl-9 pr-9 ${fieldClass} placeholder-slate-600`}
              />
              {searching && (
                <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--text-muted)' }} />
              )}

              {showSuggestions && visibleSuggestions.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 mt-2 z-30 max-h-64 overflow-y-auto p-1.5 rounded-xl text-sm shadow-xl"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                >
                  {visibleSuggestions.map((s) => (
                    <button
                      key={s.placeId}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                      className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {s.isPlace
                        ? <Building size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                        : <MapPin size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />}
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold" style={{ color: 'var(--text-primary)' }}>{s.street}</span>
                        {s.context ? (
                          <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.context}</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Απόσταση & επιβάρυνση */}
            {measuring ? (
              <p className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={12} className="animate-spin" /> Υπολογισμός απόστασης…
              </p>
            ) : distance.km !== null ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                  style={tooFar
                    ? { color: 'var(--danger)', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }
                    : { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                  title={distance.source === 'road'
                    ? 'Οδική απόσταση από το κατάστημα'
                    : 'Ευθεία απόσταση — η υπηρεσία διαδρομών δεν απάντησε'}
                >
                  <Route size={11} /> {formatKm(distance.km)}
                  {distance.source === 'straight' ? ' (ευθεία)' : ''}
                </span>

                {surcharge > 0 && !tooFar ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                    style={{ color: 'var(--warning)', backgroundColor: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}
                    title="Επιπλέον χρέωση προς το κατάστημα"
                  >
                    +{formatEuro(surcharge)}
                  </span>
                ) : null}

                {tooFar ? (
                  <span className="flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                    <AlertTriangle size={12} /> Πάνω από το όριο των {MAX_DISTANCE_KM} χλμ
                  </span>
                ) : null}
              </div>
            ) : address.trim() && origin ? (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Διάλεξε μια πρόταση από τη λίστα για να υπολογιστούν χιλιόμετρα και επιβάρυνση.
              </p>
            ) : null}
          </div>

          {/* Σχόλια/Οδηγίες */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#C5A066] font-bold text-sm flex items-center gap-2"><MessageSquare size={16} /> Σχόλια / Οδηγίες (Προαιρετικό)</label>
            <textarea
              placeholder="π.χ. Κουδούνι Παπαδόπουλος, όροφος 2ος..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows="3"
              className={`${fieldClass} placeholder-slate-600 resize-none`}
            />
          </div>

          {/* Κουμπί Υποβολής */}
          <button
            type="submit"
            disabled={loading || tooFar}
            className="w-full btn-glass border border-[#C5A066]/50 text-[#C5A066] hover:border-[#C5A066] hover:shadow-[inset_0_0_15px_rgba(197,160,102,0.4)] font-bold py-3 px-5 rounded-xl cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-base flex items-center justify-center gap-2"
          >
            {loading
              ? 'Αποστολή στο σύστημα...'
              : <><Send size={18} /> Προώθηση Παραγγελίας</>}
          </button>

        </form>
      </div>
    </motion.div>
  );
}
