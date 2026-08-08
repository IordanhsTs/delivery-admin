// Είδος καταστήματος (client feedback 08/08): καθαρά οργανωτικό/στατιστικό πεδίο —
// ΔΕΝ επηρεάζει τιμολόγηση/ανάθεση, αυτά μένουν όπως ήταν. Κοινή λίστα ώστε η
// φόρμα δημιουργίας, η φόρμα επεξεργασίας και τα στατιστικά να δείχνουν πάντα
// τις ίδιες επιλογές.
export const STORE_CATEGORIES = [
  { value: 'coffee', label: 'Καφέ' },
  { value: 'food', label: 'Φαγητό' },
  { value: 'kiosk', label: 'Ψιλικά' },
];

export function storeCategoryLabel(value) {
  return STORE_CATEGORIES.find((c) => c.value === value)?.label || null;
}
