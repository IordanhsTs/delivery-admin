import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import Statistics from '../src/Statistics.jsx';
import OrderSearch from '../src/OrderSearch.jsx';
import BillingDashboard from '../src/BillingDashboard.jsx';
import CashFloat from '../src/CashFloat.jsx';
import CreateOrder from '../src/CreateOrder.jsx';
import { WorkloadChart } from '../src/LiveMap.jsx';
import '../src/index.css';
import '../src/App.css';

// ?tab=search → OrderSearch · ?tab=billing → Εκκαθάριση · ?tab=cash → Ταμείο
// ?tab=new → Νέα Παραγγελία (προτεινόμενες οδοί) · αλλιώς Statistics
// Ο φόρτος ζει μέσα στον χάρτη, που θέλει login και Google Maps· εδώ
// προβάλλεται σκέτος, με ιστορικό που κορυφώνεται στις ~65 παραγγελίες ώστε ο
// άξονας y να βγάλει 20·40·60·80 — ακριβώς το παράδειγμα του πελάτη.
const WORKLOAD = (() => {
  const shape = { 7: 2, 8: 4, 9: 9, 10: 17, 11: 26, 12: 31, 13: 39, 14: 24,
                  15: 11, 16: 7, 17: 9, 18: 21, 19: 38, 20: 52, 21: 65, 22: 34, 23: 12 };
  const m = {};
  for (let d = 0; d < 7; d++) {
    m[d] = {};
    for (let h = 0; h < 24; h++) m[d][h] = (shape[h] || 0) * (d === 5 ? 1 : 0.62 + d * 0.06);
  }
  return m;
})();
const WorkloadPreview = () => (
  <div style={{ maxWidth: 340, border: '1px solid var(--border-default)', borderRadius: 12 }}>
    <WorkloadChart matrix={WORKLOAD} loading={false} isDark={false} />
  </div>
);

const TABS = { search: OrderSearch, billing: BillingDashboard, cash: CashFloat, new: CreateOrder, workload: WorkloadPreview };
const Tab = TABS[new URLSearchParams(location.search).get('tab')] || Statistics;

createRoot(document.getElementById('root')).render(
  <div className="p-6">
    <Toaster position="top-center" richColors />
    <Tab />
  </div>
);
