import { useState, useEffect, useCallback } from 'react';
import { supabase, isReadOnly } from './supabaseClient';
import { Megaphone, Plus, Save, Trash2, Pin, PinOff, Archive, ArchiveRestore, X, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { confirmDialog } from './ConfirmDialog';

// ── Ανακοινώσεις προς διανομείς ─────────────────────────────────────────────
// Ημερομηνία, τίτλος, ελεύθερο κείμενο — ακριβώς όσο ζήτησε ο πελάτης («άλλαξε
// ο κωδικός της πόρτας», κ.λπ.). Εμφανίζονται στο μενού της εφαρμογής με
// κόκκινη κουκκίδα· ΔΕΝ στέλνουν push (απόφαση 03/08/2026), γιατί ο διανομέας
// οδηγεί και μια ανακοίνωση δεν είναι λόγος να χτυπήσει το κινητό του.
//
// «Αρχειοθέτηση» αντί για διαγραφή ως προεπιλογή: μια ανακοίνωση που έφυγε από
// τα κινητά μπορεί να χρειαστεί ξανά (π.χ. ο κωδικός που ξαναγύρισε).

const EMPTY = { title: '', body: '', pinned: false };

export default function Announcements() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) toast.error('Σφάλμα φόρτωσης: ' + error.message);
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startNew() {
    setForm(EMPTY);
    setEditingId(null);
    setComposerOpen(true);
  }

  function startEdit(row) {
    setForm({ title: row.title, body: row.body, pinned: row.pinned });
    setEditingId(row.id);
    setComposerOpen(true);
  }

  async function submit() {
    if (isReadOnly()) {
      toast.error('Εφεδρική λειτουργία — το σύστημα είναι προσωρινά μόνο για ανάγνωση.');
      return;
    }
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) {
      toast.error('Χρειάζονται και τίτλος και κείμενο.');
      return;
    }

    setBusy(true);
    const { error } = editingId
      // ΤΟ created_at ΔΕΝ ΑΓΓΙΖΕΤΑΙ ΣΤΗΝ ΕΠΕΞΕΡΓΑΣΙΑ: είναι η ημερομηνία που
      // βλέπει ο διανομέας. Μια διόρθωση τυπογραφικού δεν κάνει την ανακοίνωση
      // «νέα» — θα ξανάναβε η κόκκινη κουκκίδα σε όλα τα κινητά.
      ? await supabase.from('announcements')
          .update({ title, body, pinned: form.pinned, updated_at: new Date().toISOString() })
          .eq('id', editingId)
      : await supabase.from('announcements').insert({ title, body, pinned: form.pinned });
    setBusy(false);

    if (error) { toast.error('Δεν αποθηκεύτηκε: ' + error.message); return; }
    toast.success(editingId ? 'Η ανακοίνωση ενημερώθηκε.' : 'Η ανακοίνωση δημοσιεύτηκε.');
    setComposerOpen(false);
    setForm(EMPTY);
    setEditingId(null);
    load();
  }

  async function togglePinned(row) {
    const { error } = await supabase.from('announcements')
      .update({ pinned: !row.pinned, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) toast.error('Δεν άλλαξε: ' + error.message);
    else load();
  }

  async function toggleActive(row) {
    const { error } = await supabase.from('announcements')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) toast.error('Δεν άλλαξε: ' + error.message);
    else {
      toast.success(row.is_active ? 'Αρχειοθετήθηκε — έφυγε από τα κινητά.' : 'Επανήλθε στα κινητά.');
      load();
    }
  }

  async function remove(row) {
    const ok = await confirmDialog(
      `Οριστική διαγραφή της ανακοίνωσης «${row.title}»; Αν θέλεις απλώς να μη φαίνεται στους διανομείς, χρησιμοποίησε την αρχειοθέτηση.`,
      { title: 'Διαγραφή ανακοίνωσης', confirmLabel: 'Διαγραφή', danger: true }
    );
    if (!ok) return;
    const { error } = await supabase.from('announcements').delete().eq('id', row.id);
    if (error) toast.error('Δεν διαγράφηκε: ' + error.message);
    else { toast.success('Διαγράφηκε.'); load(); }
  }

  const visible = rows.filter((r) => (showArchived ? !r.is_active : r.is_active));

  const card = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg, 12px)',
    boxShadow: 'var(--shadow-sm)',
  };
  const btn = {
    backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  };
  const goldBtn = { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff' };
  const field = {
    backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Κεφαλίδα ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            <Megaphone size={22} color="#fff" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Ανακοινώσεις</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Εμφανίζονται στο μενού της εφαρμογής των διανομέων
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowArchived((s) => !s)}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2" style={btn}>
            {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            {showArchived ? 'Ενεργές' : 'Αρχείο'}
          </button>
          <button onClick={load} disabled={loading}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={btn}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> Ανανέωση
          </button>
          <button onClick={startNew} className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2" style={goldBtn}>
            <Plus size={16} /> Νέα ανακοίνωση
          </button>
        </div>
      </div>

      {/* ── Σύνταξη ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {composerOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
            <div className="p-5" style={card}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>
                  {editingId ? 'Επεξεργασία ανακοίνωσης' : 'Νέα ανακοίνωση'}
                </h3>
                <button onClick={() => { setComposerOpen(false); setEditingId(null); setForm(EMPTY); }}
                  className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>
                  <X size={18} />
                </button>
              </div>

              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Τίτλος</label>
              <input value={form.title} maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="π.χ. Αλλαγή κωδικού εισόδου καταστήματος"
                className="w-full mb-4 px-3 py-2 rounded-lg outline-none" style={field} />

              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Κείμενο</label>
              <textarea value={form.body} rows={5}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Γράψε ελεύθερα ό,τι θέλεις να δουν οι διανομείς."
                className="w-full mb-4 px-3 py-2 rounded-lg outline-none resize-y" style={field} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={form.pinned}
                    onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                    style={{ accentColor: 'var(--accent)' }} />
                  Σημαντικό — μένει στην κορυφή
                </label>

                <button onClick={submit} disabled={busy}
                  className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50" style={goldBtn}>
                  <Save size={16} /> {editingId ? 'Αποθήκευση' : 'Δημοσίευση'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Λίστα ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="p-10 text-center" style={{ ...card, color: 'var(--text-muted)' }}>Φόρτωση…</div>
      ) : !visible.length ? (
        <div className="p-10 text-center" style={{ ...card, color: 'var(--text-muted)' }}>
          {showArchived ? 'Το αρχείο είναι άδειο.' : 'Καμία ενεργή ανακοίνωση.'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <motion.div key={row.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="p-4" style={{ ...card, borderColor: row.pinned ? 'var(--accent)' : 'var(--border-default)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {new Date(row.created_at).toLocaleString('el-GR', {
                        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {row.pinned && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wide"
                        style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
                        ΣΗΜΑΝΤΙΚΟ
                      </span>
                    )}
                    {!row.is_active && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wide"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                        ΑΡΧΕΙΟ
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{row.title}</h3>
                </div>

                <div className="flex items-center gap-1.5">
                  <button onClick={() => togglePinned(row)} className="p-2 rounded-lg" style={btn}
                    title={row.pinned ? 'Αφαίρεση από την κορυφή' : 'Καρφίτσωμα στην κορυφή'}>
                    {row.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </button>
                  <button onClick={() => startEdit(row)} className="p-2 rounded-lg" style={btn} title="Επεξεργασία">
                    <Save size={15} />
                  </button>
                  <button onClick={() => toggleActive(row)} className="p-2 rounded-lg" style={btn}
                    title={row.is_active ? 'Αρχειοθέτηση' : 'Επαναφορά'}>
                    {row.is_active ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                  </button>
                  <button onClick={() => remove(row)} className="p-2 rounded-lg"
                    style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }} title="Οριστική διαγραφή">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {row.body}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
