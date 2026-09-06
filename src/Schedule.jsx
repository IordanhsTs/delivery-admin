import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { supabase } from './supabaseClient';
import {
  CalendarDays, ChevronLeft, ChevronRight, Wand2, Save, Send, Undo2,
  Settings2, Plus, Trash2, AlertTriangle, CheckCircle2, Clock, Users, RefreshCcw, Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { confirmDialog } from './ConfirmDialog';
import { onWake } from './live';

// ── Κατάρτιση εβδομαδιαίου προγράμματος ─────────────────────────────────────
// Η ροή του πελάτη: μέσα στην εβδομάδα οι διανομείς δηλώνουν πότε μπορούν·
// Σάββατο ή Κυριακή ο διαχειριστής ανοίγει αυτή τη σελίδα, πατάει «Αυτόματη
// κατάρτιση», βλέπει ΠΟΥ ΥΠΑΡΧΟΥΝ ΚΕΝΑ, τα καλύπτει τηλεφωνικά και δημοσιεύει.
//
// ΤΟ ΝΟΗΜΑ ΤΗΣ ΣΕΛΙΔΑΣ ΕΙΝΑΙ Η ΜΠΑΡΑ ΚΑΛΥΨΗΣ, όχι ο πίνακας: το προσχέδιο
// βγαίνει μόνο του σε ένα κλικ, η αξία είναι να φαίνεται με μια ματιά ποια ώρα
// ποιας ημέρας μένει ακάλυπτη.

const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
const DAYS_SHORT = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];
const GREEK_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
// Τοπική ημερομηνία — ΟΧΙ toISOString(), που θα γύριζε μέρα πίσω σε θερινή ώρα.
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function prettyRange(from, to) {
  return `${from.getDate()} ${GREEK_MONTHS[from.getMonth()]} – ${to.getDate()} ${GREEK_MONTHS[to.getMonth()]} ${to.getFullYear()}`;
}
const hhmm = (t) => String(t || '').slice(0, 5);

/**
 * Οι ώρες που καλύπτει ένα διάστημα, ως ΩΡΕΣ ΑΠΟ ΤΑ ΜΕΣΑΝΥΧΤΑ ΤΗΣ ΙΔΙΑΣ ΗΜΕΡΑΣ
 * (0-47). ΝΥΧΤΕΡΙΝΟ: όταν η λήξη δεν είναι μετά την έναρξη, το διάστημα περνά τα
 * μεσάνυχτα και οι ώρες συνεχίζουν στο 24, 25… — δηλαδή μια βάρδια 17:00-01:00
 * της Δευτέρας δίνει 17…24 και μένει ΟΛΗ στη γραμμή της Δευτέρας.
 *
 * ΓΙΑΤΙ ΟΧΙ ΜΕ ΜΕΤΑΦΟΡΑ ΣΤΗΝ ΕΠΟΜΕΝΗ ΗΜΕΡΑ (όπως ήταν αρχικά): η εταιρεία
 * κλείνει στη 01:00, άρα η «Δευτέρα» ως εργάσιμη ημέρα τελειώνει 01:00 Τρίτης.
 * Με μεταφορά, εκείνη η ώρα εμφανιζόταν στη γραμμή της Τρίτης — και της Κυριακής
 * χανόταν εντελώς, γιατί ξεχείλιζε εκτός εβδομάδας.
 */
function coveredHours(start, end) {
  const h = (t) => Number(String(t).slice(0, 2));
  const m = (t) => Number(String(t).slice(3, 5));
  // Στρογγυλοποίηση προς τα «μέσα»: μια βάρδια 09:30-17:00 δεν καλύπτει
  // ολόκληρη την ώρα 9, καλύπτει από τις 10. Έτσι η μπάρα δεν δείχνει ποτέ
  // κάλυψη που δεν υπάρχει.
  const from = h(start) + (m(start) > 0 ? 1 : 0);
  const rawTo = h(end) + (m(end) > 0 ? 1 : 0);
  const overnight = String(end) <= String(start);
  const to = overnight ? rawTo + 24 : rawTo;
  const out = [];
  for (let x = from; x < to && x < 48; x++) out.push(x);
  return out;
}

/** «25» → «01:00». Οι ώρες μετά το 24 είναι της επόμενης ημερολογιακής ημέρας. */
const hourLabel = (x) => `${String(x % 24).padStart(2, '0')}:00`;

export default function Schedule() {
  // Ο διαχειριστής μπαίνει εδώ για να φτιάξει την ΕΠΟΜΕΝΗ εβδομάδα — αυτή
  // ανοίγει, όχι η τρέχουσα που έχει ήδη τελειώσει ως απόφαση.
  const [weekStart, setWeekStart] = useState(() => addDays(mondayOf(new Date()), 7));
  const [drivers, setDrivers] = useState([]);
  const [availability, setAvailability] = useState({});   // driverId → { ymd: [slot] }
  const [submitted, setSubmitted] = useState({});         // driverId → updated_at
  const [draft, setDraft] = useState({});                 // driverId → { ymd: [slot] }
  const [publishedAt, setPublishedAt] = useState(null);
  // Υπάρχει αποθηκευμένο προσχέδιο που ΔΕΝ έχει φτάσει ακόμη στα κινητά.
  // Διαφορετικό από το `dirty`, που σημαίνει «αλλαγές στην οθόνη, ούτε καν
  // αποθηκευμένες». Και τα δύο μαζί = «γράφει κάτι πάνω σε κάτι αδημοσίευτο».
  const [hasDraft, setHasDraft] = useState(false);
  // Η βάση δεν έχει ακόμη το migration 0032. Όσο ισχύει, η δημοσιευμένη
  // εβδομάδα μένει κλειδωμένη όπως πριν — το παλιό apply_week_schedule γράφει
  // κατευθείαν στη ζωντανή έκδοση και δεν υπάρχει προσχέδιο να προστατεύσει.
  const [legacySchema, setLegacySchema] = useState(false);
  const [targets, setTargets] = useState([]);
  const [settings, setSettings] = useState({
    deadline_dow: 4, deadline_time: '22:00', open_hour: 7, close_hour: 25,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState(null); // { driverId, date, index }
  // null = όλη η εβδομάδα · 0-6 = μία ημέρα. Ο πελάτης «χάνεται» στο πλέγμα 7×24,
  // οπότε η ίδια σελίδα δείχνει είτε την πανοραμική είτε μία ημέρα με ονόματα.
  const [focusDay, setFocusDay] = useState(null);
  // Πόσες δηλώσεις μπήκαν μόνες τους στο προσχέδιο στο τελευταίο φόρτωμα.
  const [autoMerged, setAutoMerged] = useState([]);

  const weekEnd = addDays(weekStart, 6);
  const weekKey = ymd(weekStart);
  // Κλειδωμένη = δημοσιευμένη ΚΑΙ χωρίς υποστήριξη προσχεδίου στη βάση. Με το
  // 0032 δεν κλειδώνει ποτέ τίποτα: γράφεις σε προσχέδιο, δημοσιεύεις όποτε θες.
  const locked = !!publishedAt && legacySchema;
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ymd(addDays(weekStart, i))),
    [weekStart]
  );

  // ── Φόρτωση ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [driverRes, availRes, weeksRes, targetRes, setRes] = await Promise.all([
        supabase.from('drivers').select('id, full_name, is_active, is_blocked').order('full_name'),
        supabase.from('driver_availability')
          .select('driver_id, work_date, start_time, end_time, all_day, by_admin')
          .eq('week_start', weekKey).order('work_date').order('start_time'),
        supabase.from('driver_availability_weeks')
          .select('driver_id, updated_at, revisions').eq('week_start', weekKey),
        supabase.from('schedule_coverage_targets').select('*').order('start_hour'),
        supabase.from('schedule_settings')
          .select('deadline_dow, deadline_time, open_hour, close_hour').maybeSingle(),
      ]);

      if (driverRes.error) throw driverRes.error;

      // ── ΔΟΥΛΕΥΕΙ ΚΑΙ ΜΕ ΤΑ ΔΥΟ ΣΧΗΜΑΤΑ ─────────────────────────────────────
      // Ο κώδικας βγαίνει στον αέρα πριν προλάβει να τρέξει το migration 0032
      // στη βάση — και ανάμεσα στα δύο, η καρτέλα δεν επιτρέπεται ούτε να σκάει
      // ούτε (χειρότερα) να δείχνει άδεια εβδομάδα. Δοκιμάζουμε πρώτα το νέο
      // σχήμα· αν λείπουν οι στήλες, πέφτουμε στο παλιό ερώτημα και η οθόνη
      // συμπεριφέρεται ακριβώς όπως πριν: δημοσιευμένη εβδομάδα = κλειδωμένη.
      let legacy = false;
      let shiftRes = await supabase.from('schedule_shifts')
        .select('driver_id, work_date, start_time, end_time, source, is_draft')
        .eq('week_start', weekKey).order('work_date').order('start_time');
      let schedRes = await supabase.from('schedule_weeks')
        .select('published_at, updated_at, has_draft, revision')
        .eq('week_start', weekKey).maybeSingle();

      const missingColumn = (e) => e && /is_draft|has_draft|revision/.test(e.message || '');
      if (missingColumn(shiftRes.error) || missingColumn(schedRes.error)) {
        legacy = true;
        shiftRes = await supabase.from('schedule_shifts')
          .select('driver_id, work_date, start_time, end_time, source')
          .eq('week_start', weekKey).order('work_date').order('start_time');
        schedRes = await supabase.from('schedule_weeks')
          .select('published_at, updated_at').eq('week_start', weekKey).maybeSingle();
      }
      setLegacySchema(legacy);

      // ΤΑ ΣΦΑΛΜΑΤΑ ΤΩΝ ΒΑΡΔΙΩΝ ΔΕΝ ΣΙΩΠΟΥΝ ΠΙΑ. Μέχρι σήμερα ένα αποτυχημένο
      // shiftRes/schedRes περνούσε ως `|| []`, δηλαδή η οθόνη έδειχνε ΑΔΕΙΑ και
      // ΑΔΗΜΟΣΙΕΥΤΗ εβδομάδα — και ο διαχειριστής θα ξανάχτιζε από την αρχή ένα
      // πρόγραμμα που υπάρχει ήδη.
      if (shiftRes.error) throw shiftRes.error;
      if (schedRes.error) throw schedRes.error;

      // Μπλοκαρισμένοι διανομείς δεν μπαίνουν σε πρόγραμμα. Οι ανενεργοί ΝΑΙ:
      // το `is_active` εδώ σημαίνει «σε βάρδια τώρα», όχι «εργαζόμενος».
      const activeDrivers = (driverRes.data || []).filter((x) => !x.is_blocked);
      setDrivers(activeDrivers);

      const avail = {};
      (availRes.data || []).forEach((r) => {
        if (!avail[r.driver_id]) avail[r.driver_id] = {};
        if (!avail[r.driver_id][r.work_date]) avail[r.driver_id][r.work_date] = [];
        avail[r.driver_id][r.work_date].push({
          start: hhmm(r.start_time), end: hhmm(r.end_time),
          all_day: r.all_day, by_admin: r.by_admin,
        });
      });
      setAvailability(avail);

      const sub = {};
      (weeksRes.data || []).forEach((r) => { sub[r.driver_id] = r; });
      setSubmitted(sub);

      // ── ΠΟΙΑ ΕΚΔΟΣΗ ΕΠΕΞΕΡΓΑΖΟΜΑΣΤΕ (migration 0032) ─────────────────────
      // Ο πίνακας κρατά ΔΥΟ εκδόσεις της εβδομάδας: τη δημοσιευμένη
      // (is_draft = false) που βλέπουν τα κινητά, και το προσχέδιο του
      // διαχειριστή. Όταν υπάρχει προσχέδιο το επεξεργαζόμαστε· αλλιώς
      // ξεκινάμε από τη δημοσιευμένη.
      //
      // Η σημαία `has_draft` έρχεται από τη βάση και ΔΕΝ συνάγεται από το
      // «υπάρχουν γραμμές προσχεδίου»: μια εβδομάδα που ο διαχειριστής άδειασε
      // ολόκληρη είναι έγκυρο προσχέδιο με μηδέν γραμμές.
      const weekHasDraft = !!schedRes.data?.has_draft;
      const shiftRows = (shiftRes.data || []).filter((r) => !!r.is_draft === weekHasDraft);

      const d = {};
      shiftRows.forEach((r) => {
        if (!d[r.driver_id]) d[r.driver_id] = {};
        if (!d[r.driver_id][r.work_date]) d[r.driver_id][r.work_date] = [];
        d[r.driver_id][r.work_date].push({
          start: hhmm(r.start_time), end: hhmm(r.end_time), source: r.source,
        });
      });

      // ── ΟΙ ΔΗΛΩΣΕΙΣ ΜΠΑΙΝΟΥΝ ΜΟΝΕΣ ΤΟΥΣ ΣΤΟ ΠΡΟΣΧΕΔΙΟ ────────────────────
      // Αίτημα πελάτη 03/08/2026: «δεν θέλω να πρέπει να εγκρίνω αυτό που
      // έστειλε ο διανομέας — θέλω με τη μία να εμφανίζεται στο προσχέδιο».
      //
      // Ο κανόνας που κρατάει ΚΑΙ τις αποφάσεις του διαχειριστή: μπαίνει η
      // δήλωση όποιου δήλωσε (ή ξαναδήλωσε) ΜΕΤΑ την τελευταία αποθήκευση του
      // προγράμματος, και μόνο σε ημέρες που το προσχέδιο είναι άδειο γι' αυτόν.
      // Έτσι μια βάρδια που ο διαχειριστής άλλαξε με το χέρι δεν πατιέται, ενώ
      // ό,τι νεότερο στέλνει ο διανομέας φαίνεται αμέσως χωρίς κανένα κλικ.
      const savedAt = schedRes.data?.updated_at ? new Date(schedRes.data.updated_at) : null;
      const mergedNames = [];
      activeDrivers.forEach((dr) => {
        const declaredAt = sub[dr.id]?.updated_at ? new Date(sub[dr.id].updated_at) : null;
        if (!declaredAt) return;
        if (savedAt && declaredAt <= savedAt) return;

        let added = false;
        Object.entries(avail[dr.id] || {}).forEach(([date, slots]) => {
          if (d[dr.id]?.[date]?.length) return;  // ο διαχειριστής έχει ήδη βάλει κάτι εδώ
          // «Όλη μέρα» ΔΕΝ μπαίνει ως πρόταση ωρών στο προσχέδιο — δεν είναι
          // βάρδια, είναι δήλωση ευελιξίας. Φαίνεται στην ενότητα «Διαθέσιμοι
          // όλη μέρα» δίπλα στην κάλυψη· ο διαχειριστής τον βάζει ο ίδιος με
          // πραγματικές ώρες αν τον χρειαστεί για να καλύψει κενό.
          const specific = slots.filter((s) => !s.all_day);
          if (!specific.length) return;
          if (!d[dr.id]) d[dr.id] = {};
          d[dr.id][date] = specific.map((s) => ({ start: s.start, end: s.end, source: 'auto' }));
          added = true;
        });
        if (added) mergedNames.push(dr.full_name);
      });

      setDraft(d);
      // Αν μπήκε κάτι μόνο του, το προσχέδιο ΔΕΝ ταυτίζεται πια με τη βάση.
      setDirty(mergedNames.length > 0);
      setAutoMerged(mergedNames);

      setPublishedAt(schedRes.data?.published_at || null);
      setHasDraft(weekHasDraft);
      setTargets(targetRes.data || []);
      if (setRes.data) setSettings(setRes.data);
    } catch (e) {
      console.error(e);
      toast.error('Σφάλμα φόρτωσης προγράμματος: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [weekKey]);

  useEffect(() => { load(); }, [load]);

  // ── Φρεσκάρισμα μόλις ξαναγίνει ορατή η καρτέλα (αίτημα πελάτη 06/09/2026) ──
  // ΟΧΙ ΟΣΟ ΥΠΑΡΧΟΥΝ ΜΗ ΑΠΟΘΗΚΕΥΜΕΝΕΣ ΑΛΛΑΓΕΣ: το load() ξαναχτίζει το προσχέδιο
  // από τη βάση, οπότε ένα αυτόματο φρεσκάρισμα θα έσβηνε τις βάρδιες που
  // μόλις έστησε ο διαχειριστής και δεν έχει ακόμη αποθηκεύσει. Η καρτέλα
  // μένει ανοιχτή ώρες ενόσω παίρνει τηλέφωνα — ακριβώς η περίπτωση όπου το
  // κόστος μιας χαμένης δουλειάς είναι πολύ μεγαλύτερο από μια μπαγιάτικη οθόνη.
  useEffect(() => onWake(() => { if (!dirty) load(); }), [load, dirty]);

  // ── Επαναφορά από τις δηλώσεις ────────────────────────────────────────────
  // Αντιγράφει αυτούσιες τις δηλώσεις. Ο πελάτης το είπε καθαρά: «μπορεί να μη
  // στέκει» — δεν προσπαθούμε να λύσουμε πρόβλημα βελτιστοποίησης, δίνουμε την
  // αφετηρία και δείχνουμε τα κενά.
  //
  // Πλέον οι δηλώσεις μπαίνουν ΜΟΝΕΣ ΤΟΥΣ στο φόρτωμα (βλ. load), οπότε αυτό το
  // κουμπί έμεινε για ένα πράγμα: να πετάξει τις χειροκίνητες αλλαγές και να
  // ξαναρχίσει από το μηδέν. Γι' αυτό ρωτάει πρώτα.
  async function autoFill() {
    const manual = Object.values(draft)
      .some((byDate) => Object.values(byDate).some((slots) => slots.some((s) => s.source === 'manual')));
    if (manual) {
      const ok = await confirmDialog(
        'Το προσχέδιο θα ξαναχτιστεί από τις δηλώσεις και οι χειροκίνητες αλλαγές σου θα χαθούν. Συνέχεια;',
        { title: 'Επαναφορά από δηλώσεις', confirmLabel: 'Επαναφορά', danger: true }
      );
      if (!ok) return;
    }

    const next = {};
    Object.entries(availability).forEach(([driverId, byDate]) => {
      next[driverId] = {};
      Object.entries(byDate).forEach(([date, slots]) => {
        // «Όλη μέρα» δεν μπαίνει ως πρόταση ωρών — δες σχόλιο στο load().
        const specific = slots.filter((s) => !s.all_day);
        if (specific.length) {
          next[driverId][date] = specific.map((s) => ({ start: s.start, end: s.end, source: 'auto' }));
        }
      });
    });
    setDraft(next);
    setDirty(true);
    setAutoMerged([]);
    toast.success('Το προσχέδιο ξαναχτίστηκε από τις δηλώσεις.');
  }

  // ── Επεξεργασία κελιού ────────────────────────────────────────────────────
  const setSlots = (driverId, date, slots) => {
    setDraft((prev) => {
      const forDriver = { ...(prev[driverId] || {}) };
      if (slots.length) forDriver[date] = slots;
      else delete forDriver[date];
      return { ...prev, [driverId]: forDriver };
    });
    setDirty(true);
  };

  const addSlot = (driverId, date) => {
    // Το «όλη μέρα» (00:00-23:59) δεν είναι πρόταση ωρών — αν είναι η μόνη
    // δήλωση, ξεκινάμε από το προεπιλεγμένο βραδινό και το αλλάζει ο χρήστης.
    const declared = (availability[driverId]?.[date] || []).find((x) => !x.all_day);
    const existing = draft[driverId]?.[date] || [];
    const fresh = declared
      ? { start: declared.start, end: declared.end, source: 'auto' }
      : { start: '17:00', end: '23:00', source: 'manual' };
    setSlots(driverId, date, [...existing, fresh]);
    setEditing({ driverId, date, index: existing.length });
  };

  const patchSlot = (driverId, date, index, patch) => {
    const existing = draft[driverId]?.[date] || [];
    setSlots(driverId, date, existing.map((s, i) => (i === index ? { ...s, ...patch, source: 'manual' } : s)));
  };

  const removeSlot = (driverId, date, index) => {
    const existing = draft[driverId]?.[date] || [];
    setSlots(driverId, date, existing.filter((_, i) => i !== index));
    setEditing(null);
  };

  // ── «Διαθέσιμος όλη μέρα», γραμμένο από τον διαχειριστή ───────────────────
  // Αίτημα πελάτη 30/08/2026: ο διανομέας που δεν έχει πρόσβαση στην εφαρμογή
  // τηλεφωνεί και λέει «τη Δευτέρα δουλεύω, βάλε ό,τι ώρες θες». Χωρίς αυτό, ο
  // διαχειριστής το κρατούσε σε χαρτί — και το Σάββατο δεν το θυμόταν.
  //
  // Γράφει στον ΙΔΙΟ πίνακα με τη δήλωση του διανομέα (`driver_availability`),
  // γιατί είναι η ίδια πληροφορία με άλλη πηγή· το `by_admin` κρατά την
  // προέλευση. ΔΕΝ γράφει στο `driver_availability_weeks`: εκείνο απαντά στο
  // «ποιος έχει υποβάλει από την εφαρμογή» και δεν πρέπει να λέει ψέματα.
  //
  // Ενημερώνει την τοπική κατάσταση αντί να ξαναφορτώσει: ένα load() θα
  // ξανάχτιζε το προσχέδιο από τη βάση και θα έσβηνε τις μη αποθηκευμένες
  // αλλαγές του διαχειριστή.
  async function toggleAllDay(driverId, date) {
    // ΧΩΡΙΣ φράχτη δημοσίευσης (απόφαση πελάτη 06/09/2026): αφού το πρόγραμμα
    // αλλάζει και μετά την ανακοίνωση, έχει νόημα να καταγράφεται και μια
    // διαθεσιμότητα που έρχεται τηλεφωνικά μετά από αυτήν. Στο παλιό σχήμα
    // κρατιέται ο παλιός φράχτης, γιατί εκεί η βάση όντως κλειδώνει.
    if (locked) return;
    const slots = availability[driverId]?.[date] || [];
    const ownDeclaration = slots.find((s) => s.all_day && !s.by_admin);
    if (ownDeclaration) {
      toast.info('Το έχει δηλώσει ο ίδιος ο διανομέας από την εφαρμογή — δεν το σβήνεις από εδώ.');
      return;
    }
    const mine = slots.some((s) => s.all_day && s.by_admin);

    setBusy(true);
    const { error } = mine
      ? await supabase.from('driver_availability').delete()
          .eq('driver_id', driverId).eq('week_start', weekKey)
          .eq('work_date', date).eq('all_day', true).eq('by_admin', true)
      // Κρατάμε ώρες 00:00-23:59 όπως και η εφαρμογή του διανομέα, ώστε καμία
      // μελλοντική ανάγνωση να μη χρειάζεται ειδική περίπτωση για το all_day.
      : await supabase.from('driver_availability').insert({
          driver_id: driverId, week_start: weekKey, work_date: date,
          start_time: '00:00', end_time: '23:59', all_day: true, by_admin: true,
        });
    setBusy(false);

    if (error) {
      toast.error('Δεν αποθηκεύτηκε: ' + error.message);
      return;
    }

    setAvailability((prev) => {
      const byDate = { ...(prev[driverId] || {}) };
      const rest = (byDate[date] || []).filter((s) => !(s.all_day && s.by_admin));
      const next = mine
        ? rest
        : [...rest, { start: '00:00', end: '23:59', all_day: true, by_admin: true }];
      if (next.length) byDate[date] = next;
      else delete byDate[date];
      return { ...prev, [driverId]: byDate };
    });
    toast.success(mine ? 'Αφαιρέθηκε.' : 'Καταγράφηκε «διαθέσιμος όλη μέρα».');
  }

  // ── Αποθήκευση / δημοσίευση ───────────────────────────────────────────────
  function draftToPayload() {
    const out = [];
    Object.entries(draft).forEach(([driverId, byDate]) => {
      Object.entries(byDate).forEach(([date, slots]) => {
        slots.forEach((s) => {
          if (s.start === s.end) return; // το απορρίπτει και η βάση
          out.push({ driver_id: driverId, date, start: s.start, end: s.end, source: s.source || 'manual' });
        });
      });
    });
    return out;
  }

  async function save({ silent } = {}) {
    setBusy(true);
    const { error } = await supabase.rpc('apply_week_schedule', {
      p_week_start: weekKey,
      p_shifts: draftToPayload(),
    });
    setBusy(false);
    if (error) {
      toast.error('Δεν αποθηκεύτηκε: ' + error.message);
      return false;
    }
    setDirty(false);
    // Από τη στιγμή που γράφτηκε, υπάρχει προσχέδιο στη βάση που ΔΕΝ έχει
    // φτάσει στα κινητά — και η οθόνη πρέπει να το λέει.
    setHasDraft(true);
    if (!silent) toast.success('Το προσχέδιο αποθηκεύτηκε. Δεν έχει σταλεί ακόμη στους διανομείς.');
    return true;
  }

  async function publish() {
    // Δύο διαφορετικές πράξεις με το ίδιο κουμπί, άρα δύο διαφορετικά κείμενα:
    // η πρώτη ανακοίνωση απλώς ανοίγει το πρόγραμμα· η επαναδημοσίευση αλλάζει
    // ώρες σε ανθρώπους που έχουν ήδη κανονίσει τη ζωή τους πάνω τους.
    const republish = !!publishedAt;
    const ok = await confirmDialog(
      republish
        ? 'Οι αλλαγές θα αντικαταστήσουν την έκδοση που βλέπουν τώρα οι διανομείς, και θα τους βγει κόκκινη ειδοποίηση ότι το πρόγραμμα άλλαξε. Συνέχεια;'
        : 'Το πρόγραμμα θα γίνει ορατό σε όλους τους διανομείς. Συνέχεια;',
      {
        title: republish ? 'Δημοσίευση αλλαγών' : 'Δημοσίευση προγράμματος',
        confirmLabel: republish ? 'Δημοσίευση αλλαγών' : 'Δημοσίευση',
      }
    );
    if (!ok) return;

    // Αποθήκευση ΠΡΩΤΑ: αλλιώς δημοσιεύεται ό,τι ήταν στη βάση πριν τις
    // τελευταίες αλλαγές της οθόνης — και ο διαχειριστής θα νόμιζε ότι έστειλε
    // κάτι που δεν έστειλε.
    if (dirty && !(await save({ silent: true }))) return;

    setBusy(true);
    const { data, error } = await supabase.rpc('publish_week_schedule', {
      p_week_start: weekKey, p_published: true,
    });
    setBusy(false);
    if (error) { toast.error('Δεν δημοσιεύτηκε: ' + error.message); return; }
    setPublishedAt(data || new Date().toISOString());
    setHasDraft(false);
    toast.success(republish
      ? 'Οι αλλαγές στάλθηκαν. Οι διανομείς θα δουν ειδοποίηση όταν ανοίξουν το πρόγραμμά τους.'
      : 'Το πρόγραμμα ανακοινώθηκε στους διανομείς.');
  }

  async function unpublish() {
    const ok = await confirmDialog(
      'Το πρόγραμμα θα πάψει να φαίνεται στους διανομείς. Συνέχεια;',
      { title: 'Απόσυρση προγράμματος', confirmLabel: 'Απόσυρση', danger: true }
    );
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('publish_week_schedule', {
      p_week_start: weekKey, p_published: false,
    });
    setBusy(false);
    if (error) { toast.error('Δεν αποσύρθηκε: ' + error.message); return; }
    setPublishedAt(null);
    toast.success('Το πρόγραμμα αποσύρθηκε.');
  }

  // ── Ώρες λειτουργίας ──────────────────────────────────────────────────────
  // Οι στήλες της μπάρας. Ώρες από τα μεσάνυχτα της ίδιας ημέρας: το 24 είναι
  // 00:00 της επόμενης, το 25 η 01:00 — δηλαδή το κλείσιμο του πελάτη.
  // Εκτός ωραρίου δεν ζωγραφίζουμε τίποτα: ήταν 6 μόνιμα άδειες στήλες.
  const openHour = Number(settings.open_hour ?? 7);
  const closeHour = Number(settings.close_hour ?? 25);
  const hourCols = useMemo(() => {
    const span = Math.max(1, Math.min(24, closeHour - openHour));
    return Array.from({ length: span }, (_, i) => openHour + i);
  }, [openHour, closeHour]);

  const driverName = useCallback(
    (id) => drivers.find((d) => d.id === id)?.full_name || '—',
    [drivers]
  );

  // ── Κάλυψη ────────────────────────────────────────────────────────────────
  // Πλήθος ΚΑΙ ονόματα ανά [ημέρα][ώρα]. Τα ονόματα είναι απαίτηση του πελάτη:
  // «βλέπεις ότι 1 έχεις δηλωμένο, αλλά ποιος;».
  const coverage = useMemo(() => {
    const counts = Array.from({ length: 7 }, () => Array(48).fill(0));
    const names = Array.from({ length: 7 }, () => Array.from({ length: 48 }, () => []));
    // Τα ids χωριστά από τα ονόματα: η προβολή ημέρας χρειάζεται να ξέρει ΠΟΙΟΣ
    // είναι σε κάθε ώρα για να τον βάλει πάντα στην ίδια στήλη.
    const ids = Array.from({ length: 7 }, () => Array.from({ length: 48 }, () => []));

    Object.entries(draft).forEach(([driverId, byDate]) => {
      const name = driverName(driverId);
      Object.entries(byDate).forEach(([date, slots]) => {
        const dayIndex = dates.indexOf(date);
        if (dayIndex < 0) return;
        slots.forEach((s) => {
          coveredHours(s.start, s.end).forEach((x) => {
            counts[dayIndex][x] += 1;
            // Σπαστό ωράριο θα έβαζε το ίδιο όνομα δύο φορές στην ίδια ώρα μόνο
            // αν τα δύο διαστήματα επικαλύπτονταν — ο έλεγχος είναι φθηνός.
            if (!names[dayIndex][x].includes(name)) names[dayIndex][x].push(name);
            if (!ids[dayIndex][x].includes(driverId)) ids[dayIndex][x].push(driverId);
          });
        });
      });
    });

    const minFor = (dayIndex, x) => {
      // Οι στόχοι ορίζονται σε ημερολογιακές ώρες 0-24, οπότε το 25 («01:00 της
      // επομένης») ψάχνεται ως ώρα 1 της επόμενης ημέρας.
      const hour = x % 24;
      const day = (dayIndex + Math.floor(x / 24)) % 7;
      // Κανόνας συγκεκριμένης ημέρας υπερισχύει του γενικού.
      const specific = targets.find(
        (t) => t.day_of_week === day + 1 && hour >= t.start_hour && hour < t.end_hour
      );
      if (specific) return specific.min_drivers;
      const generic = targets.find(
        (t) => t.day_of_week === null && hour >= t.start_hour && hour < t.end_hour
      );
      return generic ? generic.min_drivers : 0;
    };

    return { counts, names, ids, minFor };
  }, [draft, targets, dates, driverName]);

  // Κενά ΜΟΝΟ μέσα στο ωράριο λειτουργίας — μια ακάλυπτη 04:00 δεν είναι κενό,
  // είναι κλειστό μαγαζί.
  const gaps = useMemo(() => {
    const list = [];
    for (let d = 0; d < 7; d++) {
      for (const x of hourCols) {
        const need = coverage.minFor(d, x);
        if (need > 0 && coverage.counts[d][x] < need) {
          list.push({ day: d, hour: x, have: coverage.counts[d][x], need });
        }
      }
    }
    return list;
  }, [coverage, hourCols]);

  // Ομαδοποίηση των κενών σε συνεχόμενα διαστήματα ανά ημέρα, ώστε η περίληψη
  // να λέει «Τρίτη 18:00-21:00» και όχι τρεις χωριστές γραμμές.
  const gapRanges = useMemo(() => {
    const out = [];
    gaps.forEach((g) => {
      const last = out[out.length - 1];
      if (last && last.day === g.day && last.toHour === g.hour && last.need === g.need && last.have === g.have) {
        last.toHour = g.hour + 1;
      } else {
        out.push({ day: g.day, fromHour: g.hour, toHour: g.hour + 1, have: g.have, need: g.need });
      }
    });
    return out;
  }, [gaps]);

  // Ποιων διανομέων τη διαθεσιμότητα την πέρασε ο ίδιος ο διαχειριστής.
  const adminNoted = useMemo(() => {
    const set = new Set();
    Object.entries(availability).forEach(([driverId, byDate]) => {
      if (Object.values(byDate).some((slots) => slots.some((s) => s.by_admin))) {
        set.add(driverId);
      }
    });
    return set;
  }, [availability]);

  // «Δεν δήλωσαν» = αυτοί που πρέπει ακόμη να κυνηγήσει. Όποιον κατέγραψε ο
  // ίδιος τηλεφωνικά τον έχει ήδη τακτοποιήσει, οπότε βγαίνει από τη λίστα και
  // αναφέρεται χωριστά — αλλιώς θα τηλεφωνούσε δεύτερη φορά στον ίδιο.
  const notSubmitted = drivers.filter((d) => !submitted[d.id] && !adminNoted.has(d.id));
  const notedOnly = drivers.filter((d) => !submitted[d.id] && adminNoted.has(d.id));
  const visibleDays = focusDay === null ? [0, 1, 2, 3, 4, 5, 6] : [focusDay];

  // ── Στήλες της προβολής ημέρας ────────────────────────────────────────────
  // Ο κάθε διανομέας παίρνει ΤΗ ΔΙΚΗ ΤΟΥ στήλη για όλη την ημέρα. Χωρίς αυτό τα
  // ονόματα στοίβαζαν αριστερά (flex-wrap) και στην επόμενη ώρα άλλος έπαιρνε τη
  // θέση του — διαβάζοντας κατακόρυφα έβγαινε λάθος εικόνα για το ποιος δουλεύει.
  // Σειρά: όποιος μπαίνει πρώτος στη βάρδια, πιο αριστερά.
  const dayColumns = useMemo(() => {
    if (focusDay === null) return [];
    const firstHour = new Map();
    hourCols.forEach((x) => {
      coverage.ids[focusDay][x].forEach((id) => {
        if (!firstHour.has(id)) firstHour.set(id, x);
      });
    });
    return [...firstHour.entries()]
      .sort((a, b) => a[1] - b[1] || driverName(a[0]).localeCompare(driverName(b[0]), 'el'))
      .map(([id]) => id);
  }, [focusDay, coverage, hourCols, driverName]);

  // ── Διαθέσιμοι «όλη μέρα» ανά ημέρα ────────────────────────────────────────
  // Ξεχωριστό από το `coverage`: εδώ μας ενδιαφέρει ΤΙ ΔΗΛΩΣΕ ο διανομέας, όχι
  // τι μπήκε (ή δεν μπήκε) στο προσχέδιο — γι' αυτό διαβάζει από `availability`,
  // όχι από `draft`. Ο διαχειριστής το χρησιμοποιεί σαν «δεξαμενή»: βλέπει τα
  // κενά της μέρας και μετά ποιον από εδώ μπορεί να βάλει να τα καλύψει.
  const allDayNames = useMemo(() => {
    const byDay = Array.from({ length: 7 }, () => []);
    Object.entries(availability).forEach(([driverId, byDate]) => {
      Object.entries(byDate).forEach(([date, slots]) => {
        const dayIndex = dates.indexOf(date);
        if (dayIndex < 0 || !slots.some((s) => s.all_day)) return;
        byDay[dayIndex].push(driverName(driverId));
      });
    });
    return byDay;
  }, [availability, dates, driverName]);

  // ── Ρυθμίσεις ─────────────────────────────────────────────────────────────
  async function saveTarget(target) {
    const payload = {
      day_of_week: target.day_of_week === '' || target.day_of_week === null ? null : Number(target.day_of_week),
      start_hour: Number(target.start_hour),
      end_hour: Number(target.end_hour),
      min_drivers: Number(target.min_drivers),
    };
    if (!(payload.start_hour < payload.end_hour)) {
      toast.error('Η ώρα λήξης πρέπει να είναι μετά την έναρξη.');
      return;
    }
    const { error } = target.id
      ? await supabase.from('schedule_coverage_targets').update(payload).eq('id', target.id)
      : await supabase.from('schedule_coverage_targets').insert(payload);
    if (error) toast.error('Δεν αποθηκεύτηκε: ' + error.message);
    else { toast.success('Ο στόχος αποθηκεύτηκε.'); load(); }
  }

  async function deleteTarget(id) {
    const { error } = await supabase.from('schedule_coverage_targets').delete().eq('id', id);
    if (error) toast.error('Δεν διαγράφηκε: ' + error.message);
    else { toast.success('Ο στόχος διαγράφηκε.'); load(); }
  }

  async function saveDeadline() {
    const { error } = await supabase.from('schedule_settings')
      .update({ deadline_dow: Number(settings.deadline_dow), deadline_time: settings.deadline_time, updated_at: new Date().toISOString() })
      .eq('id', true);
    if (error) toast.error('Δεν αποθηκεύτηκε: ' + error.message);
    else toast.success('Η προθεσμία ενημερώθηκε.');
  }

  async function saveBusinessHours() {
    const o = Number(settings.open_hour);
    const c = Number(settings.close_hour);
    if (!(c > o) || c > o + 24) {
      toast.error('Η ώρα κλεισίματος πρέπει να είναι μετά το άνοιγμα, μέσα σε 24 ώρες.');
      return;
    }
    const { error } = await supabase.from('schedule_settings')
      .update({ open_hour: o, close_hour: c, updated_at: new Date().toISOString() })
      .eq('id', true);
    if (error) toast.error('Δεν αποθηκεύτηκαν: ' + error.message);
    else toast.success('Οι ώρες λειτουργίας ενημερώθηκαν.');
  }

  // ── Στυλ ──────────────────────────────────────────────────────────────────
  const card = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg, 12px)',
    boxShadow: 'var(--shadow-sm)',
  };
  const btn = {
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  };
  const goldBtn = { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff' };

  // Φόντο ΚΑΙ κείμενο μαζί: το πορτοκαλί «κάτω από τον στόχο» είναι ΑΝΟΙΧΤΟ
  // χρώμα, οπότε ο αριθμός πάνω του θέλει σκούρα γραφή — με το ανοιχτό γκρι του
  // θέματος ήταν πρακτικά αδιάβαστος ακριβώς στα κελιά που κοιτάει ο διαχειριστής.
  const hourStyle = (day, hour) => {
    const need = coverage.minFor(day, hour);
    const have = coverage.counts[day][hour];
    if (need === 0) {
      return { backgroundColor: have > 0 ? 'var(--accent-muted)' : 'transparent', color: 'var(--text-secondary)' };
    }
    // Το κόκκινο δεν γράφει ποτέ ψηφίο (have === 0 → κενό κελί), αλλά κρατάμε
    // λευκό για συνέπεια αν αλλάξει αυτό. Πράσινο και πορτοκαλί είναι και τα δύο
    // ανοιχτά χρώματα στα δύο θέματα → σκούρα γραφή.
    if (have === 0) return { backgroundColor: 'var(--danger)', color: '#fff' };
    if (have < need) return { backgroundColor: 'var(--warning)', color: '#1A1206' };
    return { backgroundColor: 'var(--success)', color: '#05230F' };
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Κεφαλίδα ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            <CalendarDays size={22} color="#fff" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Πρόγραμμα εβδομάδας</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Από τις δηλώσεις των διανομέων — με τα κενά κάλυψης χρωματισμένα
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowSettings((s) => !s)}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2" style={btn}>
            <Settings2 size={16} /> Ρυθμίσεις
          </button>
          <button onClick={load} disabled={loading}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={btn}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> Ανανέωση
          </button>
          <button onClick={autoFill} disabled={locked || busy}
            title="Πετάει τις χειροκίνητες αλλαγές και ξαναχτίζει το προσχέδιο από τις δηλώσεις"
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-40" style={btn}>
            <Wand2 size={16} /> Επαναφορά από δηλώσεις
          </button>
          <button onClick={() => save()} disabled={!dirty || busy}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-40" style={btn}>
            <Save size={16} /> Αποθήκευση
          </button>
          {/* Τρεις καταστάσεις, όχι δύο (migration 0032):
                 · αδημοσίευτη            → «Δημοσίευση»
                 · δημοσιευμένη + αλλαγές → «Δημοσίευση αλλαγών» (χρυσό, τραβάει
                   το μάτι: όσο δεν πατηθεί, τα κινητά δείχνουν την παλιά έκδοση)
                 · δημοσιευμένη, καθαρή   → μόνο «Απόσυρση» */}
          {publishedAt && !legacySchema && (hasDraft || dirty) ? (
            <button onClick={publish} disabled={busy}
              title="Οι διανομείς βλέπουν ακόμη την προηγούμενη έκδοση. Με τη δημοσίευση θα δουν κόκκινη ειδοποίηση ότι άλλαξε το πρόγραμμα."
              className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50" style={goldBtn}>
              <Send size={16} /> Δημοσίευση αλλαγών
            </button>
          ) : publishedAt ? (
            <button onClick={unpublish} disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>
              <Undo2 size={16} /> Απόσυρση
            </button>
          ) : (
            <button onClick={publish} disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50" style={goldBtn}>
              <Send size={16} /> Δημοσίευση
            </button>
          )}
        </div>
      </div>

      {/* ── Ρυθμίσεις: στόχοι κάλυψης + προθεσμία ──────────────────────── */}
      {showSettings && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 overflow-hidden">
          <div className="p-5 card-surface" style={card}>
            {/* ── Ώρες λειτουργίας ──────────────────────────────────────── */}
            <h3 className="font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Clock size={18} /> Ώρες λειτουργίας
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Μόνο αυτές οι ώρες εμφανίζονται στην κάλυψη και μόνο σε αυτές μετράει «κενό».
              Το κλείσιμο μπορεί να είναι μετά τα μεσάνυχτα.
            </p>
            <div className="flex flex-wrap items-end gap-3 mb-6">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Άνοιγμα</label>
                <select value={settings.open_hour ?? 7}
                  onChange={(e) => setSettings((s) => ({ ...s, open_hour: Number(e.target.value) }))}
                  className="px-3 py-2 rounded-lg outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Κλείσιμο</label>
                <select value={settings.close_hour ?? 25}
                  onChange={(e) => setSettings((s) => ({ ...s, close_hour: Number(e.target.value) }))}
                  className="px-3 py-2 rounded-lg outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                  {Array.from({ length: 24 }, (_, i) => Number(settings.open_hour ?? 7) + i + 1).map((x) => (
                    <option key={x} value={x}>
                      {hourLabel(x)}{x >= 24 ? ' (επόμενη ημέρα)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={saveBusinessHours}
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2" style={goldBtn}>
                <Save size={16} /> Αποθήκευση
              </button>
            </div>

            <h3 className="font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Users size={18} /> Ελάχιστοι διανομείς ανά ζώνη
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Ορίζουν τι μετράει ως «κενό». Ζώνη για συγκεκριμένη ημέρα υπερισχύει της γενικής.
            </p>

            <div className="space-y-2 mb-5">
              {targets.map((t) => (
                <TargetRow key={t.id} target={t} onSave={saveTarget} onDelete={() => deleteTarget(t.id)} />
              ))}
              <TargetRow
                key="new"
                target={{ day_of_week: '', start_hour: 18, end_hour: 24, min_drivers: 2 }}
                isNew
                onSave={saveTarget}
              />
            </div>

            <h3 className="font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Clock size={18} /> Προθεσμία δήλωσης
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Εμφανίζεται ως υπενθύμιση στην εφαρμογή. Δεν κλειδώνει τίποτα: οι διανομείς μπορούν να
              δηλώνουν και μετά τη δημοσίευση.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Ημέρα</label>
                <select value={settings.deadline_dow}
                  onChange={(e) => setSettings((s) => ({ ...s, deadline_dow: e.target.value }))}
                  className="px-3 py-2 rounded-lg outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                  {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Ώρα</label>
                <input type="time" value={hhmm(settings.deadline_time)}
                  onChange={(e) => setSettings((s) => ({ ...s, deadline_time: e.target.value }))}
                  className="px-3 py-2 rounded-lg outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }} />
              </div>
              <button onClick={saveDeadline}
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2" style={goldBtn}>
                <Save size={16} /> Αποθήκευση
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Πλοήγηση εβδομάδας ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="w-10 h-10 rounded-lg flex items-center justify-center card-surface" style={{ ...card, color: 'var(--text-secondary)' }}>
          <ChevronLeft size={20} />
        </button>
        <div className="px-5 py-2 rounded-lg text-center min-w-[260px] card-surface" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Δευτέρα – Κυριακή
          </div>
          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{prettyRange(weekStart, weekEnd)}</div>
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="w-10 h-10 rounded-lg flex items-center justify-center card-surface" style={{ ...card, color: 'var(--text-secondary)' }}>
          <ChevronRight size={20} />
        </button>
        <button onClick={() => setWeekStart(addDays(mondayOf(new Date()), 7))}
          className="px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
          Επόμενη εβδομάδα
        </button>

        {publishedAt && !legacySchema && (hasDraft || dirty) ? (
          <span className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
            style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}
            title="Οι διανομείς βλέπουν ακόμη την έκδοση που ανακοινώθηκε.">
            <AlertTriangle size={14} /> Αλλαγές χωρίς δημοσίευση
          </span>
        ) : publishedAt ? (
          <span className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
            style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
            <CheckCircle2 size={14} /> Ανακοινώθηκε {new Date(publishedAt).toLocaleDateString('el-GR')}
          </span>
        ) : (
          <span className="px-3 py-2 rounded-lg text-xs font-bold"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
            Προσχέδιο
          </span>
        )}
        {dirty && (
          <span className="px-3 py-2 rounded-lg text-xs font-bold"
            style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
            Μη αποθηκευμένες αλλαγές
          </span>
        )}
      </div>

      {/* Τι μπήκε μόνο του — ο διαχειριστής δεν πρέπει να βρίσκει βάρδιες που
          δεν έβαλε ο ίδιος χωρίς να ξέρει από πού ήρθαν. */}
      {autoMerged.length > 0 && (
        <div className="mb-6 p-3 rounded-lg text-xs flex items-start gap-2"
          style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--text-secondary)', border: '1px solid var(--accent)' }}>
          <CheckCircle2 size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
          <span>
            Μπήκαν αυτόματα στο προσχέδιο οι δηλώσεις: <strong style={{ color: 'var(--text-primary)' }}>{autoMerged.join(', ')}</strong>.
            {' '}Πάτησε <strong style={{ color: 'var(--text-primary)' }}>Αποθήκευση</strong> για να καταγραφούν.
          </span>
        </div>
      )}

      {/* ── Σύνοψη: ποιοι δήλωσαν, πού είναι τα κενά ───────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="p-4 card-surface" style={card}>
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Δηλώσεις διαθεσιμότητας
            </span>
          </div>
          <div className="text-2xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
            {drivers.length - notSubmitted.length} / {drivers.length}
          </div>
          {notSubmitted.length ? (
            <p className="text-xs" style={{ color: 'var(--warning)' }}>
              Δεν δήλωσαν: {notSubmitted.map((d) => d.full_name).join(', ')}
            </p>
          ) : (
            // «Δήλωσαν όλοι» ΜΟΝΟ όταν όντως δήλωσαν όλοι μόνοι τους: αν κάποιους
            // τους πέρασε ο διαχειριστής, πράσινο «δήλωσαν όλοι» θα ήταν ψέμα.
            <p className="text-xs" style={{ color: 'var(--success)' }}>
              {notedOnly.length ? 'Δεν εκκρεμεί κανείς.' : 'Δήλωσαν όλοι.'}
            </p>
          )}
          {notedOnly.length > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Καταγράφηκαν από εσένα: {notedOnly.map((d) => d.full_name).join(', ')}
            </p>
          )}
        </div>

        <div className="p-4 card-surface" style={card}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} style={{ color: gaps.length ? 'var(--danger)' : 'var(--text-muted)' }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Κενά κάλυψης
            </span>
          </div>
          {!gapRanges.length ? (
            <p className="text-sm font-bold" style={{ color: 'var(--success)' }}>
              Καμία ώρα κάτω από τον στόχο.
            </p>
          ) : (
            <ul className="text-xs space-y-1 max-h-24 overflow-y-auto" style={{ color: 'var(--text-secondary)' }}>
              {gapRanges.map((g, i) => (
                <li key={i}>
                  <button onClick={() => setFocusDay(g.day)} className="text-left hover:underline">
                    <strong style={{ color: 'var(--danger)' }}>{DAYS[g.day]}</strong>{' '}
                    {hourLabel(g.fromHour)}–{hourLabel(g.toHour)} · {g.have} από {g.need}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Επιλογή ημέρας ─────────────────────────────────────────────── */}
      {/* «Δώσε την επιλογή να εξετάσεις την κάθε ημέρα ξεχωριστά γιατί έτσι
          χάνεσαι» (πελάτης, 03/08/2026). Το πλέγμα της εβδομάδας μένει για την
          πανοραμική· η ημέρα δείχνει ώρα-ώρα ΠΟΙΟΣ δουλεύει. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setFocusDay(null)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold"
          style={focusDay === null
            ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff' }
            : btn}>
          Όλη η εβδομάδα
        </button>
        {DAYS_SHORT.map((d, i) => {
          const on = focusDay === i;
          const dayGaps = gaps.filter((g) => g.day === i).length;
          return (
            <button key={d} onClick={() => setFocusDay(i)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
              style={on
                ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff' }
                : btn}>
              {d}
              <span className="font-normal opacity-70">{Number(dates[i].slice(8))}/{Number(dates[i].slice(5, 7))}</span>
              {dayGaps > 0 && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: on ? '#fff' : 'var(--danger)' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Κάλυψη ─────────────────────────────────────────────────────── */}
      <div className="p-4 mb-6 overflow-x-auto card-surface" style={card}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            {focusDay === null ? 'Κάλυψη ανά ώρα' : `Κάλυψη — ${DAYS[focusDay]}`}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Ωράριο {hourLabel(openHour)}–{hourLabel(closeHour)}
          </div>
        </div>

        {/* Η «δεξαμενή» της ημέρας: ποιος δήλωσε πλήρη ευελιξία, για να τον
            χρησιμοποιήσει ο διαχειριστής στα κενά που βλέπει παρακάτω. Τελείως
            κρυφό όταν κανείς δεν το έχει επιλέξει — δεν είναι ανάγκη να το λέει. */}
        {focusDay !== null && allDayNames[focusDay].length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs flex items-start gap-2"
            style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
            <Sun size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Διαθέσιμοι όλη μέρα: <strong>{allDayNames[focusDay].join(', ')}</strong></span>
          </div>
        )}

        {focusDay === null ? (
          <div style={{ minWidth: Math.max(420, hourCols.length * 26 + 48) }}>
            <div className="flex items-center gap-1 mb-1 pl-12">
              {hourCols.map((x) => (
                <div key={x} className="flex-1 text-center text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {x % 2 === 0 ? x % 24 : ''}
                </div>
              ))}
            </div>
            {DAYS_SHORT.map((d, dayIndex) => (
              <div key={d} className="flex items-center gap-1 mb-1">
                {/* Διακριτικό ηλιάκι δίπλα στο όνομα της ημέρας αντί για ολόκληρη
                    γραμμή κειμένου — τα ονόματα είναι στο title (hover) και στην
                    πλήρη ένδειξη όταν ανοίξει η μέρα. justify-between (όχι gap
                    δίπλα στο κείμενο) ώστε το ηλιάκι να κάθεται πάντα στην ίδια
                    άκρη της στήλης, σε ευθεία κάθετη γραμμή σε όλες τις μέρες. */}
                <button onClick={() => setFocusDay(dayIndex)}
                  className="w-11 text-[11px] font-bold shrink-0 text-left hover:underline flex items-center justify-between"
                  style={{ color: 'var(--text-secondary)' }}
                  title={allDayNames[dayIndex].length ? `Όλη μέρα: ${allDayNames[dayIndex].join(', ')}` : undefined}>
                  {d}
                  {allDayNames[dayIndex].length > 0 && <Sun size={10} style={{ color: 'var(--warning)' }} />}
                </button>
                {hourCols.map((x) => {
                  const have = coverage.counts[dayIndex][x];
                  const need = coverage.minFor(dayIndex, x);
                  const who = coverage.names[dayIndex][x];
                  return (
                    <button
                      key={x}
                      onClick={() => setFocusDay(dayIndex)}
                      title={`${DAYS[dayIndex]} ${hourLabel(x)} — ${who.length ? who.join(', ') : 'κανείς'}${need ? ` (στόχος ${need})` : ''}`}
                      className="flex-1 h-6 rounded flex items-center justify-center text-[9px] font-bold"
                      style={{ ...hourStyle(dayIndex, x), border: '1px solid var(--border-subtle)' }}
                    >
                      {have || ''}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          // ── Μία ημέρα, ώρα-ώρα, ΜΕ ΟΝΟΜΑΤΑ ΣΕ ΣΤΗΛΕΣ ───────────────────
          // Ένα ενιαίο grid για όλες τις ώρες: έτσι οι στήλες έχουν το ίδιο
          // πλάτος σε κάθε γραμμή και ο κάθε διανομέας διαβάζεται κατακόρυφα.
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: `56px 44px repeat(${Math.max(1, dayColumns.length)}, minmax(96px, max-content))`,
              columnGap: 8,
              rowGap: 4,
              width: 'max-content',
              minWidth: '100%',
            }}
          >
            {hourCols.map((x) => {
              const have = coverage.counts[focusDay][x];
              const need = coverage.minFor(focusDay, x);
              const onDuty = coverage.ids[focusDay][x];
              const style = hourStyle(focusDay, x);
              return (
                <Fragment key={x}>
                  <div className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {hourLabel(x)}
                  </div>
                  <div className="h-6 rounded flex items-center justify-center text-[11px] font-bold"
                       style={{ ...style, border: '1px solid var(--border-subtle)' }}>
                    {need ? `${have}/${need}` : have || ''}
                  </div>

                  {onDuty.length === 0 ? (
                    <div className="text-[11px]"
                         style={{ gridColumn: `span ${Math.max(1, dayColumns.length)}`, color: need ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {need ? 'ακάλυπτη ώρα' : 'κανείς'}
                    </div>
                  ) : (
                    dayColumns.map((id) => (
                      onDuty.includes(id) ? (
                        // Χρυσό κείμενο πάνω σε χρυσό φόντο δίνει contrast 2.2 στο
                        // ανοιχτό θέμα — τα ονόματα είναι ΤΟ ζητούμενο εδώ, οπότε
                        // παίρνουν το κανονικό χρώμα κειμένου.
                        <div key={id} className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-center truncate"
                             style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--text-primary)' }}
                             title={driverName(id)}>
                          {driverName(id)}
                        </div>
                      ) : (
                        // Κενό κελί — όχι κενός χώρος: η στήλη πρέπει να φαίνεται
                        // ότι συνεχίζει, αλλιώς το μάτι ξαναενώνει τα ονόματα.
                        <div key={id} className="py-0.5 text-[11px] text-center leading-none"
                             style={{ color: 'var(--border-default)' }}>
                          ·
                        </div>
                      )
                    ))
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Πίνακας: διανομείς × ημέρες ────────────────────────────────── */}
      <div style={card} className="overflow-hidden card-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: focusDay === null ? 980 : 420 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <th className="px-4 py-3 text-left font-bold text-xs uppercase tracking-wider sticky left-0"
                    style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
                  Διανομέας
                </th>
                {visibleDays.map((i) => (
                  <th key={dates[i]} className="px-2 py-3 font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <div>{focusDay === null ? DAYS_SHORT[i] : DAYS[i]}</div>
                    <div className="font-normal text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {Number(dates[i].slice(8))}/{Number(dates[i].slice(5, 7))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={visibleDays.length + 1} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>Φόρτωση…</td></tr>
              )}
              {!loading && !drivers.length && (
                <tr><td colSpan={visibleDays.length + 1} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                  Δεν υπάρχουν διανομείς.
                </td></tr>
              )}
              {!loading && drivers.map((driver) => (
                <tr key={driver.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="px-4 py-2 sticky left-0" style={{ backgroundColor: 'var(--bg-card)' }}>
                    <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{driver.full_name}</div>
                    <div className="text-[11px]"
                         style={{ color: submitted[driver.id] || adminNoted.has(driver.id) ? 'var(--text-muted)' : 'var(--warning)' }}>
                      {submitted[driver.id]
                        ? `δήλωσε ${new Date(submitted[driver.id].updated_at).toLocaleDateString('el-GR')}`
                        : adminNoted.has(driver.id) ? 'το κατέγραψες εσύ' : 'χωρίς δήλωση'}
                    </div>
                  </td>

                  {visibleDays.map((dayIndex) => {
                    const date = dates[dayIndex];
                    const slots = draft[driver.id]?.[date] || [];
                    const declared = availability[driver.id]?.[date] || [];
                    // «Όλη μέρα» δεν είναι βάρδια — έχει δική του ένδειξη και
                    // δεν μπερδεύεται με τις ώρες στη γραμμή «δήλωσε …».
                    const allDay = declared.find((x) => x.all_day);
                    const declaredHours = declared.filter((x) => !x.all_day);
                    return (
                      <td key={date} className="px-1.5 py-2 align-top" style={{ minWidth: 118 }}>
                        {slots.map((s, index) => {
                          const isEditing = editing && editing.driverId === driver.id
                            && editing.date === date && editing.index === index;
                          if (isEditing) {
                            return (
                              <div key={index} className="mb-1 p-1.5 rounded-lg"
                                   style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--accent)' }}>
                                <input type="time" value={s.start}
                                  onChange={(e) => patchSlot(driver.id, date, index, { start: e.target.value })}
                                  className="w-full mb-1 px-1 py-0.5 rounded text-xs outline-none"
                                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
                                <input type="time" value={s.end}
                                  onChange={(e) => patchSlot(driver.id, date, index, { end: e.target.value })}
                                  className="w-full mb-1 px-1 py-0.5 rounded text-xs outline-none"
                                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
                                <div className="flex gap-1">
                                  <button onClick={() => setEditing(null)}
                                    className="flex-1 py-0.5 rounded text-[10px] font-bold" style={goldBtn}>OK</button>
                                  <button onClick={() => removeSlot(driver.id, date, index)}
                                    className="px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}>
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <button key={index}
                              onClick={() => !locked && setEditing({ driverId: driver.id, date, index })}
                              className="w-full mb-1 px-2 py-1 rounded-lg text-xs font-bold text-left"
                              style={{
                                backgroundColor: s.source === 'manual' ? 'var(--accent)' : 'var(--accent-muted)',
                                color: s.source === 'manual' ? '#fff' : 'var(--accent)',
                                border: '1px solid var(--accent)',
                                cursor: locked ? 'default' : 'pointer',
                              }}
                              title={s.source === 'manual' ? 'Χειροκίνητη αλλαγή' : 'Από τη δήλωση του διανομέα'}>
                              {s.start}–{s.end}
                            </button>
                          );
                        })}

                        {/* «Βάλε ό,τι ώρες θες» — δήλωση ευελιξίας, όχι ωράριο.
                            Μένει ορατή ΚΑΙ όταν έχει μπει βάρδια: ο διαχειριστής
                            πρέπει να ξέρει ότι μπορεί να την αλλάξει ελεύθερα. */}
                        {allDay && (
                          // Κείμενο σε --text-primary, όχι --warning: το πορτοκαλί
                          // πάνω στο --warning-bg δίνει 3.07 στο ανοιχτό θέμα (μετρημένο)
                          // και η ένδειξη είναι 11px. Το χρώμα του σήματος το κρατά το
                          // ηλιάκι — ίδια λύση με τα chips ονομάτων της κάλυψης.
                          <div className="mb-1 px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1"
                            style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--text-primary)', border: '1px solid var(--warning-border)' }}
                            title={allDay.by_admin
                              ? 'Το κατέγραψες εσύ — πάτα ξανά τον ήλιο για να το αφαιρέσεις'
                              : 'Το δήλωσε ο διανομέας από την εφαρμογή'}>
                            <Sun size={11} style={{ color: 'var(--warning)', flexShrink: 0 }} /> Όλη μέρα
                          </div>
                        )}

                        {/* Τι είχε δηλώσει, όταν δεν μπήκε αυτούσιο στο πρόγραμμα.
                            Χωρίς αυτό ο διαχειριστής θα έπρεπε να θυμάται τι ζήτησε ο καθένας. */}
                        {declaredHours.length > 0 && !slots.length && (
                          <div className="text-[10px] leading-tight mb-1" style={{ color: 'var(--text-muted)' }}>
                            δήλωσε {declaredHours.map((d) => `${d.start}–${d.end}`).join(', ')}
                          </div>
                        )}

                        {!locked && (
                          <div className="flex gap-1">
                            <button onClick={() => addSlot(driver.id, date)}
                              className="flex-1 py-1 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px dashed var(--border-default)' }}
                              title="Πρόσθεσε ωράριο με το χέρι">
                              <Plus size={12} />
                            </button>
                            {/* Ο ήλιος είναι διακόπτης: χωρίς ένδειξη = δεν έχει
                                δηλωθεί τίποτα, γεμάτος = «όλη μέρα». Ό,τι δήλωσε
                                ο ίδιος ο διανομέας δεν σβήνεται από εδώ. */}
                            <button onClick={() => toggleAllDay(driver.id, date)}
                              disabled={busy || (allDay && !allDay.by_admin)}
                              className="px-2 py-1 rounded-lg flex items-center justify-center disabled:opacity-40"
                              style={allDay
                                ? { backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }
                                : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px dashed var(--border-default)' }}
                              title={allDay
                                ? (allDay.by_admin ? 'Αφαίρεση του «διαθέσιμος όλη μέρα»' : 'Το δήλωσε ο ίδιος ο διανομέας')
                                : 'Μου είπε «βάλε ό,τι ώρες θες» — διαθέσιμος όλη μέρα'}>
                              <Sun size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 p-4 text-xs leading-relaxed card-surface" style={{ ...card, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Πώς δουλεύει:</strong> οι διανομείς δηλώνουν από την
        εφαρμογή πότε μπορούν να δουλέψουν την επόμενη εβδομάδα, και η δήλωσή τους μπαίνει{' '}
        <strong style={{ color: 'var(--text-primary)' }}>μόνη της στο προσχέδιο</strong> — δεν εγκρίνεις τίποτα.
        Ό,τι αλλάξεις με το χέρι σημειώνεται με γεμάτο χρυσό και δεν το πατάει καμία νέα δήλωση· αν ο διανομέας
        ξαναδηλώσει μετά την τελευταία σου αποθήκευση, το νέο του ωράριο μπαίνει στις ημέρες που εσύ έχεις αφήσει
        κενές. Το κουμπί «Επαναφορά από δηλώσεις» ξαναχτίζει το προσχέδιο από το μηδέν.
        {' '}<strong style={{ color: 'var(--text-primary)' }}>Για όποιον δεν μπορεί να δηλώσει μόνος του</strong>{' '}
        (χαλασμένο κινητό, δεν μπαίνει στην εφαρμογή) γράφεις εσύ στο κελί του: με το{' '}
        <strong style={{ color: 'var(--text-primary)' }}>+</strong> βάζεις ώρες με το χέρι, με τον{' '}
        <strong style={{ color: 'var(--warning)' }}>ήλιο</strong> καταγράφεις ότι σου είπε «βάλε ό,τι ώρες θες» —
        μένει σημειωμένο ως «όλη μέρα» για να το θυμάσαι όταν καλύπτεις τα κενά. Με τη{' '}
        <strong>Δημοσίευση</strong> το πρόγραμμα γίνεται ορατό στους διανομείς («Το πρόγραμμά μου»).
        {' '}<strong style={{ color: 'var(--text-primary)' }}>Μπορείς να το αλλάξεις και μετά</strong>: όσο
        δουλεύεις πάνω σε δημοσιευμένη εβδομάδα, οι διανομείς συνεχίζουν να βλέπουν την προηγούμενη έκδοση
        μέχρι να πατήσεις «Δημοσίευση αλλαγών» — και τότε τους βγαίνει κόκκινη ειδοποίηση, μία φορά στον
        καθένα.
      </div>
    </div>
  );
}

// ── Μία γραμμή στόχου κάλυψης ───────────────────────────────────────────────
function TargetRow({ target, onSave, onDelete, isNew }) {
  const [local, setLocal] = useState(target);
  useEffect(() => { setLocal(target); }, [target]);

  const field = {
    backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={local.day_of_week ?? ''} onChange={(e) => setLocal({ ...local, day_of_week: e.target.value })}
        className="px-2 py-1.5 rounded-lg text-sm outline-none" style={field}>
        <option value="">Κάθε ημέρα</option>
        {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
      </select>
      <input type="number" min="0" max="23" value={local.start_hour}
        onChange={(e) => setLocal({ ...local, start_hour: e.target.value })}
        className="w-16 px-2 py-1.5 rounded-lg text-sm outline-none" style={field} />
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>έως</span>
      <input type="number" min="1" max="24" value={local.end_hour}
        onChange={(e) => setLocal({ ...local, end_hour: e.target.value })}
        className="w-16 px-2 py-1.5 rounded-lg text-sm outline-none" style={field} />
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>→ τουλάχιστον</span>
      <input type="number" min="0" max="20" value={local.min_drivers}
        onChange={(e) => setLocal({ ...local, min_drivers: e.target.value })}
        className="w-16 px-2 py-1.5 rounded-lg text-sm outline-none" style={field} />
      <button onClick={() => onSave(local)}
        className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff' }}>
        {isNew ? <Plus size={13} /> : <Save size={13} />} {isNew ? 'Προσθήκη' : 'Αποθήκευση'}
      </button>
      {!isNew && (
        <button onClick={onDelete} className="px-2 py-1.5 rounded-lg"
          style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
