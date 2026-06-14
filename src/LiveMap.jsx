import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from './supabaseClient';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function LiveMap() {
  const [drivers, setDrivers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [assigningOrderId, setAssigningOrderId] = useState(null);
  const [lastCompletedTimes, setLastCompletedTimes] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchDrivers = async () => {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, latitude, longitude')
      .eq('is_active', true)
      .not('latitude', 'is', null);
    if (data) setDrivers(data);
    if (error) console.error("Σφάλμα οδηγών:", error);
  };

  const fetchActiveOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(`id, address, comments, status, driver_id, created_at, stores ( name ), drivers ( full_name )`)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    if (error) console.error("Σφάλμα παραγγελιών:", error);
  };

  const fetchLastCompletedTimes = async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('orders')
      .select('driver_id, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', startOfDay.toISOString());

    if (data) {
      const times = {};
      data.forEach(order => {
        if (order.driver_id && order.completed_at) {
          const t = new Date(order.completed_at).getTime();
          if (!times[order.driver_id] || t > times[order.driver_id]) {
            times[order.driver_id] = t;
          }
        }
      });
      setLastCompletedTimes(times);
    }
  };

  useEffect(() => {
    fetchDrivers();
    fetchActiveOrders();
    fetchLastCompletedTimes();

    const driversChannel = supabase
      .channel('public:drivers_map_tracking')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' }, (payload) => {
        const updatedDriver = payload.new;
        setDrivers(prevDrivers => 
          prevDrivers.map(d => d.id === updatedDriver.id ? { ...d, latitude: updatedDriver.latitude, longitude: updatedDriver.longitude } : d)
        );
      }).subscribe();

    const ordersChannel = supabase
      .channel('public:orders_map_flow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        fetchActiveOrders();
        fetchLastCompletedTimes();
        
        // ΗΧΗΤΙΚΗ ΕΙΔΟΠΟΙΗΣΗ ΓΙΑ ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ
        if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
          const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
          audio.play().catch(e => console.log('Το αυτόματο play μπλοκαρίστηκε από τον browser:', e));
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(driversChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  const assignOrderToDriver = async (orderId, driverId) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'accepted', driver_id: driverId, accepted_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      alert("Υπήρξε σφάλμα κατά την ανάθεση.");
    } else {
      setAssigningOrderId(null);
    }
  };

  const cancelOrder = async (orderId) => {
    const isConfirmed = window.confirm("Είστε σίγουροι ότι θέλετε να ακυρώσετε τη συγκεκριμένη παραγγελία;");
    if (!isConfirmed) return;

    // Optimistic Update
    setOrders(prevOrders => prevOrders.filter(o => o.id !== orderId));

    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);

    if (error) {
      alert("Υπήρξε σφάλμα κατά την ακύρωση της παραγγελίας.");
      console.error(error);
      fetchActiveOrders(); // Revert
    }
  };

  const completeOrder = async (orderId) => {
    const isConfirmed = window.confirm("Είστε σίγουροι ότι θέλετε να ολοκληρώσετε τη συγκεκριμένη παραγγελία;");
    if (!isConfirmed) return;

    // Optimistic Update
    setOrders(prevOrders => prevOrders.filter(o => o.id !== orderId));

    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      alert("Υπήρξε σφάλμα κατά την ολοκλήρωση της παραγγελίας.");
      console.error(error);
      fetchActiveOrders(); // Revert
    } else {
      fetchLastCompletedTimes();
    }
  };

  const getElapsedTime = (createdAtString) => {
    if (!createdAtString) return '0 λ.';
    const createdTime = new Date(createdAtString).getTime();
    const diffMs = currentTime.getTime() - createdTime;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Μόλις τώρα';
    return `${diffMins} λεπτά`;
  };

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const acceptedOrders = orders.filter(o => o.status === 'accepted');
  const centerPosition = [40.7819, 21.4098];

  return (
    <div className="font-sans">
      
      {/* 1. ΠΑΝΩ ΜΕΡΟΣ: ΧΑΡΤΗΣ */}
      <div className="h-[280px] md:h-[380px] w-full rounded-2xl overflow-hidden border border-slate-300 shadow-lg mb-4 md:mb-6 z-0 relative">
        <MapContainer center={centerPosition} zoom={14} className="h-full w-full">
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          {drivers.map(driver => {
            const driverActiveOrders = orders.filter(o => o.status === 'accepted' && o.driver_id === driver.id);
            let idleStatusHtml;
            
            if (driverActiveOrders.length > 0) {
              idleStatusHtml = (
                <div className="mt-1 border-t border-gray-200 pt-1">
                  <span className="font-bold text-blue-800 block mb-0.5">Κρατάει ({driverActiveOrders.length}):</span>
                  {driverActiveOrders.map(order => (
                    <div key={order.id} className="text-[11px] text-gray-800 whitespace-nowrap">
                      🏢 {order.stores?.name} ➔ 📍 {order.address}
                    </div>
                  ))}
                </div>
              );
            } else {
              const lastTime = lastCompletedTimes[driver.id];
              if (lastTime) {
                const diffMins = Math.floor((currentTime.getTime() - lastTime) / 60000);
                idleStatusHtml = (
                  <div className={`font-bold text-[11px] mt-1 ${diffMins > 10 ? 'text-red-700' : 'text-orange-600'}`}>
                    ⚠️ Ανενεργός: {diffMins} λεπτά
                  </div>
                );
              } else {
                idleStatusHtml = <div className="text-gray-500 italic text-[11px] mt-1">Διαθέσιμος (Αναμονή)</div>;
              }
            }

            return driver.latitude && driver.longitude ? (
              <Marker key={driver.id} position={[driver.latitude, driver.longitude]}>
                <Tooltip permanent direction="top" offset={[0, -15]} opacity={0.95}>
                  <div className="text-xs leading-relaxed p-0.5">
                    <b className="text-blue-500 text-[13px] block">🛵 {driver.full_name}</b>
                    {idleStatusHtml}
                  </div>
                </Tooltip>
              </Marker>
            ) : null;
          })}
        </MapContainer>
      </div>

      {/* 2. ΚΑΤΩ ΜΕΡΟΣ: ΠΛΑΙΣΙΑ ΠΑΡΑΓΓΕΛΙΩΝ */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        
        {/* ΚΑΡΤΑ 1: Νέες Παραγγελίες */}
        <div className="flex-1 bg-white border border-slate-300 border-l-4 border-l-orange-500 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-shadow duration-300 min-h-auto md:min-h-[200px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="m-0 text-slate-700 text-[15px] font-bold flex items-center gap-1.5">
              <span className="text-orange-500">🔍</span> Νέες (Σε Εκκρεμότητα)
            </h3>
            <span className="bg-orange-50 text-orange-600 px-2.5 py-1 rounded-full font-bold text-[13px]">
              {pendingOrders.length}
            </span>
          </div>
          
          <div className="max-h-[200px] md:max-h-[250px] overflow-y-auto text-[13px] pr-1">
            {pendingOrders.length === 0 ? (
              <p className="text-slate-400 italic mt-2 text-sm">Δεν υπάρχουν εκκρεμείς παραγγελίες.</p>
            ) : (
              pendingOrders.map(order => {
                const isLate = (currentTime.getTime() - new Date(order.created_at).getTime()) > 300000;
                return (
                <div key={order.id} className="py-2.5 border-b border-slate-100 last:border-0">
                  <div className="flex justify-between items-start flex-wrap gap-2.5">
                    <div className="text-slate-800 leading-relaxed flex-1">
                      🏢 <span className="font-bold">{order.stores?.name}</span> <br/> 
                      📍 <span className="text-slate-600">{order.address}</span> <br/>
                      
                      {order.comments && (
                        <div className="mt-1 text-[11px] text-slate-600 bg-amber-50 border border-amber-200 p-1.5 rounded">
                          📝 <b>Σχόλια:</b> {order.comments}
                        </div>
                      )}
                      
                      <span className={`text-[11px] font-bold inline-block mt-1 ${isLate ? 'text-red-600' : 'text-orange-500'}`}>
                        ⏱️ Σε αναμονή: {getElapsedTime(order.created_at)}
                      </span>
                    </div>
                    
                    <div className="flex gap-2 mt-1 md:mt-0">
                      {/* Κουμπί Ακύρωσης Εκκρεμούς */}
                      <button 
                        onClick={() => cancelOrder(order.id)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2 px-3 rounded-lg cursor-pointer font-bold text-xs transition-colors"
                        title="Ακύρωση Παραγγελίας"
                      >
                        ✖
                      </button>

                      {/* Κουμπί Ανάθεσης */}
                      <button 
                        onClick={() => setAssigningOrderId(assigningOrderId === order.id ? null : order.id)}
                        className="bg-orange-500 hover:bg-orange-600 text-white border-none py-2 px-3 rounded-lg cursor-pointer font-bold text-xs shadow-sm transition-colors"
                      >
                        {assigningOrderId === order.id ? 'Κλείσιμο' : 'Ανάθεση'}
                      </button>
                    </div>
                  </div>
                  
                  {assigningOrderId === order.id && (
                    <div className="mt-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="m-0 mb-2 text-xs font-bold text-slate-700">Επιλογή Διανομέα:</p>
                      {drivers.length === 0 ? (
                        <p className="text-red-600 text-[11px] m-0">Κανένας διανομέας δεν είναι online.</p>
                      ) : (
                        drivers.map(driver => {
                          const activeCount = acceptedOrders.filter(o => o.driver_id === driver.id).length;
                          let statusBadge;
                          if (activeCount > 0) {
                            statusBadge = <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold text-[10px]">Κρατάει ({activeCount})</span>;
                          } else {
                            const lastTime = lastCompletedTimes[driver.id];
                            if (lastTime) {
                              const diffMins = Math.floor((currentTime.getTime() - lastTime) / 60000);
                              statusBadge = <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold text-[10px]">Ελεύθερος ({diffMins} λ.)</span>;
                            } else {
                              statusBadge = <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold text-[10px]">Ελεύθερος</span>;
                            }
                          }

                          return (
                            <button
                              key={driver.id}
                              onClick={() => assignOrderToDriver(order.id, driver.id)}
                              className="flex justify-between items-center w-full text-left p-2 mb-1 bg-white hover:bg-blue-50 border border-slate-200 rounded-md cursor-pointer text-blue-500 text-xs transition-colors"
                            >
                              <span className="font-bold">🛵 {driver.full_name}</span>
                              {statusBadge}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )})
            )}
          </div>
        </div>

        {/* ΚΑΡΤΑ 2: Ενεργές Παραγγελίες */}
        <div className="flex-1 bg-white border border-slate-300 border-l-4 border-l-blue-500 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-shadow duration-300 min-h-auto md:min-h-[200px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="m-0 text-slate-700 text-[15px] font-bold flex items-center gap-1.5">
              <span className="text-blue-500">🛵</span> Σε Εξέλιξη
            </h3>
            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-bold text-[13px]">
              {acceptedOrders.length}
            </span>
          </div>
          
          <div className="max-h-[200px] md:max-h-[250px] overflow-y-auto text-[13px] pr-1">
            {acceptedOrders.length === 0 ? (
              <p className="text-slate-400 italic mt-2 text-sm">Δεν υπάρχουν ενεργές διανομές αυτή τη στιγμή.</p>
            ) : (
              acceptedOrders.map(order => (
                <div key={order.id} className="py-2.5 border-b border-slate-100 last:border-0 flex justify-between items-start flex-wrap gap-2">
                  <div className="text-slate-800 leading-relaxed flex-1">
                    🏢 <span className="font-bold">{order.stores?.name}</span> ➔ 📍 <span className="text-slate-600">{order.address}</span>
                    
                    {order.comments && (
                      <div className="mt-1 text-[11px] text-slate-600 bg-amber-50 border border-amber-200 p-1.5 rounded block">
                        📝 <b>Σχόλια:</b> {order.comments}
                      </div>
                    )}

                    <div className="mt-1 text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded-md inline-block border border-slate-100">
                      👤 Οδηγός: <b className="text-blue-500">{order.drivers?.full_name}</b>
                    </div>
                  </div>
                  
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                      ⏱️ {getElapsedTime(order.created_at)}
                    </span>
                    <div className="flex gap-2 mt-1">
                      {/* Κουμπί Ολοκλήρωσης Ενεργής */}
                      <button 
                        onClick={() => completeOrder(order.id)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-sm transition-colors"
                        title="Ολοκλήρωση Παραγγελίας"
                      >
                        ✔
                      </button>
                      {/* Κουμπί Ακύρωσης Ενεργής */}
                      <button 
                        onClick={() => cancelOrder(order.id)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-1.5 px-2.5 rounded-lg cursor-pointer font-bold text-sm transition-colors"
                        title="Ακύρωση Παραγγελίας"
                      >
                        ✖
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}