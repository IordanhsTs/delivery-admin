import { useState } from 'react';
import { BarChart2, Search } from 'lucide-react';
import Statistics from './Statistics';
import OrderSearch from './OrderSearch';

// ── Στατιστικά + Αναζήτηση, μαζί (αίτημα χρήστη 18/09/2026) ────────────────
// Οι δύο οθόνες ΠΑΡΑΜΕΝΟΥΝ ξεχωριστές από μέσα — επίτηδες, ίδιος λόγος με πριν:
// τα Στατιστικά μετράνε ΜΟΝΟ ολοκληρωμένες παραγγελίες (απόδοση), η Αναζήτηση
// βρίσκει ΟΠΟΙΑΔΗΠΟΤΕ παραγγελία (και εκκρεμή, και ακυρωμένη) με λέξη-κλειδί.
// Εδώ μπαίνουν κάτω από τον ίδιο κόμβο μενού, με ένα tab-toggle από πάνω τους,
// αντί για δύο ξεχωριστά κουμπιά στο μενού.
export default function StatisticsHub() {
  const [tab, setTab] = useState('analytics');

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('analytics')}
          className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
          style={tab === 'analytics'
            ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff', boxShadow: '0 2px 8px var(--accent-muted)' }
            : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
        >
          <BarChart2 size={16} /> Αναλυτικά
        </button>
        <button
          onClick={() => setTab('search')}
          className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
          style={tab === 'search'
            ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff', boxShadow: '0 2px 8px var(--accent-muted)' }
            : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
        >
          <Search size={16} /> Αναζήτηση
        </button>
      </div>

      {/* Και τα δύο μένουν mounted (CSS hide) — ίδιο μοτίβο με τον χάρτη στο
          App.jsx: η Αναζήτηση δεν χάνει τα αποτελέσματά της αν γυρίσεις στα
          Αναλυτικά και μετά πίσω. */}
      <div className={tab === 'analytics' ? '' : 'hidden'}>
        <Statistics />
      </div>
      <div className={tab === 'search' ? '' : 'hidden'}>
        <OrderSearch />
      </div>
    </div>
  );
}
