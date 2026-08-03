import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, isReadOnly } from './supabaseClient';
import {
  CalendarDays, ChevronLeft, ChevronRight, Wand2, Save, Send, Undo2,
  Settings2, Plus, Trash2, AlertTriangle, CheckCircle2, Clock, Users, RefreshCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { confirmDialog } from './ConfirmDialog';

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
 * Οι ώρες που καλύπτει ένα διάστημα, ως ζεύγη [ημέρα, ώρα]. ΝΥΧΤΕΡΙΝΟ: όταν η
 * λήξη δεν είναι μετά την έναρξη, το διάστημα περνά τα μεσάνυχτα και οι πρώτες
 * ώρες μετράνε στην ΕΠΟΜΕΝΗ ημέρα — αλλιώς μια βάρδια 17:00-01:00 θα εμφανιζόταν
 * να καλύπτει όλο το πρωί της ίδιας μέρας.
 */
function coveredHours(dayIndex, start, end) {
  const h = (t) => Number(String(t).slice(0, 2));
  const m = (t) => Number(String(t).slice(3, 5));
  // Στρογγυλοποίηση προς τα «μέσα»: μια βάρδια 09:30-17:00 δεν καλύπτει
  // ολόκληρη την ώρα 9, καλύπτει από τις 10. Έτσι η μπάρα δεν δείχνει ποτέ
  // κάλυψη που δεν υπάρχει.
  const from = h(start) + (m(start) > 0 ? 1 : 0);
  const rawTo = h(end) + (m(end) > 0 ? 1 : 0);
  const out = [];
  const overnight = String(end) <= String(start);
  const to = overnight ? rawTo + 24 : rawTo;
  for (let x = from; x < to; x++) {
    out.push([(dayIndex + Math.floor(x / 24)) % 7, x % 24]);
  }
  return out;
}

export default function Schedule() {
  // Ο διαχειριστής μπαίνει εδώ για να φτιάξει την ΕΠΟΜΕΝΗ εβδομάδα — αυτή
  // ανοίγει, όχι η τρέχουσα που έχει ήδη τελειώσει ως απόφαση.
  const [weekStart, setWeekStart] = useState(() => addDays(mondayOf(new Date()), 7));
  const [drivers, setDrivers] = useState([]);
  const [availability, setAvailability] = useState({});   // driverId → { ymd: [slot] }
  const [submitted, setSubmitted] = useState({});         // driverId → updated_at
  const [draft, setDraft] = useState({});                 // driverId → { ymd: [slot] }
  const [publishedAt, setPublishedAt] = useState(null);
  const [targets, setTargets] = useState([]);
  const [settings, setSettings] = useState({ deadline_dow: 4, deadline_time: '22:00' });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState(null); // { driverId, date, index }

  const weekEnd = addDays(weekStart, 6);
  const weekKey = ymd(weekStart);
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ymd(addDays(weekStart, i))),
    [weekStart]
  );

  // ── Φόρτωση ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [driverRes, availRes, weeksRes, shiftRes, schedRes, targetRes, setRes] = await Promise.all([
        supabase.from('drivers').select('id, full_name, is_active, is_blocked').order('full_name'),
        supabase.from('driver_availability')
          .select('driver_id, work_date, start_time, end_time, all_day')
          .eq('week_start', weekKey).order('work_date').order('start_time'),
        supabase.from('driver_availability_weeks')
          .select('driver_id, updated_at, revisions').eq('week_start', weekKey),
        supabase.from('schedule_shifts')
          .select('driver_id, work_date, start_time, end_time, source')
          .eq('week_start', weekKey).order('work_date').order('start_time'),
        supabase.from('schedule_weeks').select('published_at').eq('week_start', weekKey).maybeSingle(),
        supabase.from('schedule_coverage_targets').select('*').order('start_hour'),
        supabase.from('schedule_settings').select('deadline_dow, deadline_time').maybeSingle(),
      ]);

      if (driverRes.error) throw driverRes.error;

      // Μπλοκαρισμένοι διανομείς δεν μπαίνουν σε πρόγραμμα. Οι ανενεργοί ΝΑΙ:
      // το `is_active` εδώ σημαίνει «σε βάρδια τώρα», όχι «εργαζόμενος».
      setDrivers((driverRes.data || []).filter((d) => !d.is_blocked));

      const avail = {};
      (availRes.data || []).forEach((r) => {
        if (!avail[r.driver_id]) avail[r.driver_id] = {};
        if (!avail[r.driver_id][r.work_date]) avail[r.driver_id][r.work_date] = [];
        avail[r.driver_id][r.work_date].push({
          start: hhmm(r.start_time), end: hhmm(r.end_time), all_day: r.all_day,
        });
      });
      setAvailability(avail);

      const sub = {};
      (weeksRes.data || []).forEach((r) => { sub[r.driver_id] = r; });
      setSubmitted(sub);

      const d = {};
      (shiftRes.data || []).forEach((r) => {
        if (!d[r.driver_id]) d[r.driver_id] = {};
        if (!d[r.driver_id][r.work_date]) d[r.driver_id][r.work_date] = [];
        d[r.driver_id][r.work_date].push({
          start: hhmm(r.start_time), end: hhmm(r.end_time), source: r.source,
        });
      });
      setDraft(d);
      setDirty(false);

      setPublishedAt(schedRes.data?.published_at || null);
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

  // ── Αυτόματη κατάρτιση ────────────────────────────────────────────────────
  // Αντιγράφει αυτούσιες τις δηλώσεις. Ο πελάτης το είπε καθαρά: «μπορεί να μη
  // στέκει» — δεν προσπαθούμε να λύσουμε πρόβλημα βελτιστοποίησης, δίνουμε την
  // αφετηρία και δείχνουμε τα κενά.
  function autoFill() {
    const next = {};
    Object.entries(availability).forEach(([driverId, byDate]) => {
      next[driverId] = {};
      Object.entries(byDate).forEach(([date, slots]) => {
        next[driverId][date] = slots.map((s) => ({
          // «Όλη την ημέρα» δεν μπορεί να μπει ως 00:00-23:59 σε πρόγραμμα
          // βάρδιας: ο διανομέας δήλωσε ευελιξία, όχι 24ωρη παρουσία. Μπαίνει
          // ένα κανονικό βράδυ και το διορθώνει ο διαχειριστής αν θέλει.
          start: s.all_day ? '17:00' : s.start,
          end: s.all_day ? '23:00' : s.end,
          source: 'auto',
        }));
      });
    });
    setDraft(next);
    setDirty(true);
    toast.success('Το προσχέδιο δημιουργήθηκε από τις δηλώσεις.');
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
    const declared = availability[driverId]?.[date]?.[0];
    const existing = draft[driverId]?.[date] || [];
    const fresh = declared && !declared.all_day
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
    if (isReadOnly()) {
      toast.error('Εφεδρική λειτουργία — το σύστημα είναι προσωρινά μόνο για ανάγνωση.');
      return false;
    }
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
    if (!silent) toast.success('Το προσχέδιο αποθηκεύτηκε.');
    return true;
  }

  async function publish() {
    const ok = await confirmDialog(
      'Το πρόγραμμα θα γίνει ορατό σε όλους τους διανομείς και οι δηλώσεις διαθεσιμότητας της εβδομάδας θα κλειδώσουν. Συνέχεια;',
      { title: 'Δημοσίευση προγράμματος', confirmLabel: 'Δημοσίευση' }
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
    toast.success('Το πρόγραμμα ανακοινώθηκε στους διανομείς.');
  }

  async function unpublish() {
    const ok = await confirmDialog(
      'Το πρόγραμμα θα πάψει να φαίνεται στους διανομείς και θα ξεκλειδώσουν οι δηλώσεις. Συνέχεια;',
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

  // ── Κάλυψη ────────────────────────────────────────────────────────────────
  // Πίνακας 7×24 με το πλήθος διανομέων και τον στόχο κάθε ώρας.
  const coverage = useMemo(() => {
    const counts = Array.from({ length: 7 }, () => Array(24).fill(0));
    Object.values(draft).forEach((byDate) => {
      Object.entries(byDate).forEach(([date, slots]) => {
        const dayIndex = dates.indexOf(date);
        if (dayIndex < 0) return;
        slots.forEach((s) => {
          coveredHours(dayIndex, s.start, s.end).forEach(([d, h]) => {
            // `d < dayIndex` συμβαίνει μόνο όταν μια βάρδια Κυριακής ξεχειλίζει
            // στη Δευτέρα: εκείνες οι ώρες ανήκουν στην ΕΠΟΜΕΝΗ εβδομάδα και δεν
            // μετριούνται εδώ — αλλιώς θα «κάλυπταν» τη Δευτέρα αυτής.
            if (d >= dayIndex) counts[d][h] += 1;
          });
        });
      });
    });

    const minFor = (dayIndex, hour) => {
      // Κανόνας συγκεκριμένης ημέρας υπερισχύει του γενικού.
      const specific = targets.find(
        (t) => t.day_of_week === dayIndex + 1 && hour >= t.start_hour && hour < t.end_hour
      );
      if (specific) return specific.min_drivers;
      const generic = targets.find(
        (t) => t.day_of_week === null && hour >= t.start_hour && hour < t.end_hour
      );
      return generic ? generic.min_drivers : 0;
    };

    return { counts, minFor };
  }, [draft, targets, dates]);

  const gaps = useMemo(() => {
    const list = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const need = coverage.minFor(d, h);
        if (need > 0 && coverage.counts[d][h] < need) {
          list.push({ day: d, hour: h, have: coverage.counts[d][h], need });
        }
      }
    }
    return list;
  }, [coverage]);

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

  const notSubmitted = drivers.filter((d) => !submitted[d.id]);

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
          <button onClick={autoFill} disabled={publishedAt || busy}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-40" style={btn}>
            <Wand2 size={16} /> Αυτόματη κατάρτιση
          </button>
          <button onClick={() => save()} disabled={!dirty || busy}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-40" style={btn}>
            <Save size={16} /> Αποθήκευση
          </button>
          {publishedAt ? (
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
          <div className="p-5" style={card}>
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
              Εμφανίζεται ως υπενθύμιση στην εφαρμογή. Δεν κλειδώνει τίποτα — το κλείδωμα γίνεται με τη δημοσίευση.
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
          className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ ...card, color: 'var(--text-secondary)' }}>
          <ChevronLeft size={20} />
        </button>
        <div className="px-5 py-2 rounded-lg text-center min-w-[260px]" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Δευτέρα – Κυριακή
          </div>
          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{prettyRange(weekStart, weekEnd)}</div>
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ ...card, color: 'var(--text-secondary)' }}>
          <ChevronRight size={20} />
        </button>
        <button onClick={() => setWeekStart(addDays(mondayOf(new Date()), 7))}
          className="px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
          Επόμενη εβδομάδα
        </button>

        {publishedAt ? (
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

      {/* ── Σύνοψη: ποιοι δήλωσαν, πού είναι τα κενά ───────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="p-4" style={card}>
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
            <p className="text-xs" style={{ color: 'var(--success)' }}>Δήλωσαν όλοι.</p>
          )}
        </div>

        <div className="p-4" style={card}>
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
                  <strong style={{ color: 'var(--danger)' }}>{DAYS[g.day]}</strong>{' '}
                  {String(g.fromHour).padStart(2, '0')}:00–{String(g.toHour).padStart(2, '0')}:00 ·
                  {' '}{g.have} από {g.need}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Μπάρα κάλυψης 7 × 24 ───────────────────────────────────────── */}
      <div className="p-4 mb-6 overflow-x-auto" style={card}>
        <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
          Κάλυψη ανά ώρα
        </div>
        <div style={{ minWidth: 640 }}>
          <div className="flex items-center gap-1 mb-1 pl-12">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
          </div>
          {DAYS_SHORT.map((d, dayIndex) => (
            <div key={d} className="flex items-center gap-1 mb-1">
              <div className="w-11 text-[11px] font-bold shrink-0" style={{ color: 'var(--text-secondary)' }}>{d}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const have = coverage.counts[dayIndex][h];
                const need = coverage.minFor(dayIndex, h);
                return (
                  <div
                    key={h}
                    title={`${DAYS[dayIndex]} ${String(h).padStart(2, '0')}:00 — ${have} διανομείς${need ? ` (στόχος ${need})` : ''}`}
                    className="flex-1 h-6 rounded flex items-center justify-center text-[9px] font-bold"
                    style={{ ...hourStyle(dayIndex, h), border: '1px solid var(--border-subtle)' }}
                  >
                    {have || ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Πίνακας: διανομείς × ημέρες ────────────────────────────────── */}
      <div style={card} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 980 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <th className="px-4 py-3 text-left font-bold text-xs uppercase tracking-wider sticky left-0"
                    style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
                  Διανομέας
                </th>
                {dates.map((date, i) => (
                  <th key={date} className="px-2 py-3 font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <div>{DAYS_SHORT[i]}</div>
                    <div className="font-normal text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {Number(date.slice(8))}/{Number(date.slice(5, 7))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>Φόρτωση…</td></tr>
              )}
              {!loading && !drivers.length && (
                <tr><td colSpan={8} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                  Δεν υπάρχουν διανομείς.
                </td></tr>
              )}
              {!loading && drivers.map((driver) => (
                <tr key={driver.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="px-4 py-2 sticky left-0" style={{ backgroundColor: 'var(--bg-card)' }}>
                    <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{driver.full_name}</div>
                    <div className="text-[11px]" style={{ color: submitted[driver.id] ? 'var(--text-muted)' : 'var(--warning)' }}>
                      {submitted[driver.id]
                        ? `δήλωσε ${new Date(submitted[driver.id].updated_at).toLocaleDateString('el-GR')}`
                        : 'χωρίς δήλωση'}
                    </div>
                  </td>

                  {dates.map((date) => {
                    const slots = draft[driver.id]?.[date] || [];
                    const declared = availability[driver.id]?.[date] || [];
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
                              onClick={() => !publishedAt && setEditing({ driverId: driver.id, date, index })}
                              className="w-full mb-1 px-2 py-1 rounded-lg text-xs font-bold text-left"
                              style={{
                                backgroundColor: s.source === 'manual' ? 'var(--accent)' : 'var(--accent-muted)',
                                color: s.source === 'manual' ? '#fff' : 'var(--accent)',
                                border: '1px solid var(--accent)',
                                cursor: publishedAt ? 'default' : 'pointer',
                              }}
                              title={s.source === 'manual' ? 'Χειροκίνητη αλλαγή' : 'Από τη δήλωση του διανομέα'}>
                              {s.start}–{s.end}
                            </button>
                          );
                        })}

                        {/* Τι είχε δηλώσει, όταν δεν μπήκε αυτούσιο στο πρόγραμμα.
                            Χωρίς αυτό ο διαχειριστής θα έπρεπε να θυμάται τι ζήτησε ο καθένας. */}
                        {declared.length > 0 && !slots.length && (
                          <div className="text-[10px] leading-tight mb-1" style={{ color: 'var(--text-muted)' }}>
                            δήλωσε {declared.map((d) => (d.all_day ? 'όλη μέρα' : `${d.start}–${d.end}`)).join(', ')}
                          </div>
                        )}

                        {!publishedAt && (
                          <button onClick={() => addSlot(driver.id, date)}
                            className="w-full py-1 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px dashed var(--border-default)' }}
                            title="Προσθήκη βάρδιας">
                            <Plus size={12} />
                          </button>
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

      <div className="mt-4 p-4 text-xs leading-relaxed" style={{ ...card, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Πώς δουλεύει:</strong> οι διανομείς δηλώνουν από την
        εφαρμογή πότε μπορούν να δουλέψουν την επόμενη εβδομάδα. Το κουμπί «Αυτόματη κατάρτιση» αντιγράφει
        αυτούσιες τις δηλώσεις σε προσχέδιο — δεν αποφασίζει, απλώς σου δίνει την αφετηρία. Ό,τι αλλάξεις με το
        χέρι σημειώνεται με γεμάτο χρυσό. Με τη <strong>Δημοσίευση</strong> το πρόγραμμα γίνεται ορατό στους
        διανομείς («Το πρόγραμμά μου») και κλειδώνουν οι δηλώσεις της εβδομάδας.
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
