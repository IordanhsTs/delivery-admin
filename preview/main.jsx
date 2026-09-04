import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import Statistics from '../src/Statistics.jsx';
import OrderSearch from '../src/OrderSearch.jsx';
import '../src/index.css';
import '../src/App.css';

createRoot(document.getElementById('root')).render(
  <div className="p-6">
    <Toaster position="top-center" richColors />
    {new URLSearchParams(location.search).get('tab') === 'search' ? <OrderSearch /> : <Statistics />}
  </div>
);
