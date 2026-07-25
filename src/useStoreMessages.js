import { useState, useEffect, useCallback } from 'react';
import { supabase, getTenantSchema } from './supabaseClient';

// ── Εισερχόμενα μηνύματα από τα καταστήματα ─────────────────────────────────
// Τα μηνύματα admin→κατάστημα/διανομέα ταξιδεύουν με realtime broadcast (εφήμερα).
// Η αντίστροφη κατεύθυνση ΔΕΝ μπορεί να δουλέψει έτσι: ο διαχειριστής μπορεί να
// μην είναι συνδεδεμένος τη στιγμή που στέλνει το κατάστημα, και το broadcast θα
// χανόταν. Γι' αυτό ζουν σε πίνακα (store_messages) και τα διαβάζουμε από εκεί.

const RECENT_LIMIT = 50;

export function useStoreMessages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('store_messages')
      .select('id, message, created_at, read_at, store_id, stores ( name )')
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT);
    if (!error && data) setMessages(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMessages();

    // Μοναδικό όνομα ανά instance: το hook χρησιμοποιείται σε δύο σημεία ταυτόχρονα
    // (badge στο μενού + λίστα εισερχομένων) και δύο κανάλια με το ίδιο όνομα
    // συγκρούονται στον supabase client.
    const channel = supabase
      .channel(`store_messages_inbox_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: getTenantSchema(), table: 'store_messages' },
        () => fetchMessages()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchMessages]);

  const unreadCount = messages.filter(m => !m.read_at).length;

  const markRead = useCallback(async (id) => {
    // Αισιόδοξη ενημέρωση: το UI αντιδρά αμέσως, το realtime event απλώς επιβεβαιώνει.
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, read_at: new Date().toISOString() } : m)));
    await supabase.from('store_messages').update({ read_at: new Date().toISOString() }).eq('id', id);
  }, []);

  const markAllRead = useCallback(async () => {
    const stamp = new Date().toISOString();
    setMessages(prev => prev.map(m => (m.read_at ? m : { ...m, read_at: stamp })));
    await supabase.from('store_messages').update({ read_at: stamp }).is('read_at', null);
  }, []);

  return { messages, loading, unreadCount, markRead, markAllRead, refresh: fetchMessages };
}
