// Custom Google Maps JSON style — ίδια παλέτα με το index.css (html.dark):
// --bg-primary #0A0F1E, --text-primary #EAF0FA, --border-default #26314A,
// accent χρυσό #D4A853 — ώστε ο χάρτης να νιώθεται σαν κομμάτι του ίδιου UI
// αντί για ξένο στοιχείο πάνω του. Εφαρμόζεται ΜΟΝΟ σε dark mode (LiveMap.jsx) —
// το light mode μένει στο προεπιλεγμένο Google roadmap style.
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0A0F1E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0F1E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7E8DA8' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#26314A' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#EAF0FA' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#111B2E' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1E2840' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#151E33' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#A3B2CC' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#26314A' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#D4A853' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050810' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3A4A6B' }] },
];
