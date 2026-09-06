import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { norm } from './searchText';
import { useBackClose } from './backNav';

// ── Λίστα επιλογής με αναζήτηση (μονή επιλογή) ──────────────────────────────
// Αίτημα πελάτη 06/09/2026: «αν έχω 29 διανομείς ή 50 καταστήματα δεν θα
// κάθομαι να ψάχνω αυτόν που θέλω». Το ίδιο ισχύει σε τρεις οθόνες — Μηνύματα
// (πολλαπλή επιλογή, δικός της κώδικας), Νέα Παραγγελία και Στατιστικά — οπότε
// η μονή επιλογή ζει εδώ αντί να αντιγραφεί.
//
// ΓΙΑΤΙ ΟΧΙ <select> ΜΕ ΑΝΑΖΗΤΗΣΗ: το native select δεν παίρνει πεδίο
// αναζήτησης. Το πληκτρολόγιο του κινητού ανοίγει μόνο για πραγματικό <input>,
// και αυτό ακριβώς ζήτησε ο πελάτης — «να πληκτρολογείτε το όνομα».
//
// ΠΡΟΣΒΑΣΙΜΟΤΗΤΑ: βέλη πάνω/κάτω για μετακίνηση, Enter για επιλογή, Escape για
// κλείσιμο. Χωρίς αυτά το πεδίο θα ήταν παγίδα για όποιον δουλεύει με
// πληκτρολόγιο — και ο διαχειριστής καταχωρεί παραγγελίες με ταχύτητα.

/**
 * @param {string}   value        Το επιλεγμένο id ('' = η επιλογή «όλα»).
 * @param {function} onChange     Παίρνει το νέο id.
 * @param {Array}    options      [{ value, label }]
 * @param {string}   [emptyLabel] Κείμενο της επιλογής «όλα/κανένα». Αν λείπει,
 *                                δεν προσφέρεται καθόλου κενή επιλογή.
 * @param {string}   [placeholder] Τι γράφει το πεδίο όσο δεν ψάχνει κανείς.
 * @param {string}   [className]  Κλάσεις του πεδίου, ώστε να ταιριάζει με το
 *                                στυλ της κάθε οθόνης.
 * @param {object}   [style]      Το ίδιο, για inline μεταβλητές θέματος.
 */
export default function SearchableSelect({
  value, onChange, options, emptyLabel, placeholder, className = '', style,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));
  const selectedLabel = selected ? selected.label : (emptyLabel || '');

  const q = norm(query);
  const filtered = q ? options.filter((o) => norm(o.label).includes(q)) : options;
  // Η κενή επιλογή μπαίνει πρώτη και μόνο όσο δεν ψάχνει κανείς: όποιος γράφει
  // όνομα δεν ψάχνει το «όλα».
  const rows = (!q && emptyLabel) ? [{ value: '', label: emptyLabel }, ...filtered] : filtered;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Το «πίσω» του κινητού κλείνει τη λίστα πριν αλλάξει ενότητα.
  useBackClose(open, () => setOpen(false));

  // Ο δείκτης μηδενίζεται στους ίδιους τους χειριστές (πληκτρολόγηση, άνοιγμα)
  // και όχι σε effect — ένα setState μέσα σε effect προκαλεί δεύτερο render για
  // κάτι που ξέρουμε ήδη τη στιγμή του γεγονότος. Εδώ απλώς τον περιορίζουμε
  // μέσα στα όρια της λίστας, για την περίπτωση που το φιλτράρισμα τη μίκρυνε.
  const safeCursor = rows.length ? Math.min(cursor, rows.length - 1) : 0;

  function commit(v) {
    onChange(v);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); setCursor(0); return; }
      setCursor((c) => {
        const cur = rows.length ? Math.min(c, rows.length - 1) : 0;
        const next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
        if (next < 0) return rows.length - 1;
        if (next >= rows.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault();
      const row = rows[safeCursor];
      if (row) commit(row.value);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--text-muted)' }}
      />
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        // Όσο η λίστα είναι κλειστή, το πεδίο δείχνει την επιλογή — συμπεριφέρεται
        // δηλαδή σαν κανονικό select. Μόλις ανοίξει, γίνεται πεδίο αναζήτησης.
        value={open ? query : selectedLabel}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setCursor(0); }}
        onFocus={() => { setOpen(true); setQuery(''); setCursor(0); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder || emptyLabel || ''}
        className={`w-full pl-9 pr-9 ${className}`}
        style={style}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setCursor(0);
          if (!open) { setQuery(''); inputRef.current?.focus(); }
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg"
        style={{ color: 'var(--text-muted)' }}
        aria-label={open ? 'Κλείσιμο λίστας' : 'Άνοιγμα λίστας'}
      >
        <ChevronDown size={16} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-2 z-30 max-h-60 overflow-y-auto p-1.5 rounded-xl text-sm shadow-xl"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
          }}
        >
          {rows.length === 0 ? (
            <p className="m-0 p-2" style={{ color: 'var(--text-muted)' }}>
              Κανένα αποτέλεσμα για «{query}».
            </p>
          ) : (
            rows.map((o, i) => {
              const picked = String(o.value) === String(value);
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  // onMouseDown και όχι onClick: το mousedown προηγείται του blur
                  // του πεδίου, αλλιώς η λίστα προλαβαίνει να κλείσει και το κλικ
                  // πέφτει στο κενό.
                  onMouseDown={(e) => { e.preventDefault(); commit(o.value); }}
                  onMouseEnter={() => setCursor(i)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors"
                  style={{
                    backgroundColor: i === safeCursor ? 'var(--accent-muted)' : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {picked && <Check size={14} style={{ color: 'var(--accent)' }} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
