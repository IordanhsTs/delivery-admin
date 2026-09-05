import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import Statistics from '../src/Statistics.jsx';
import OrderSearch from '../src/OrderSearch.jsx';
import BillingDashboard from '../src/BillingDashboard.jsx';
import '../src/index.css';
import '../src/App.css';

// ?tab=search → OrderSearch · ?tab=billing → Εκκαθάριση · αλλιώς Statistics
const TABS = { search: OrderSearch, billing: BillingDashboard };
const Tab = TABS[new URLSearchParams(location.search).get('tab')] || Statistics;

createRoot(document.getElementById('root')).render(
  <div className="p-6">
    <Toaster position="top-center" richColors />
    <Tab />
  </div>
);
