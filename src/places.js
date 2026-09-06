import { invokeWithAuthRetry } from './pushErrors';
import { haversineKm, MAX_DISTANCE_KM } from './distance';

// ════════════════════════════════════════════════════════════════════════════
// Προτεινόμενες οδοί & οδική απόσταση για το admin
// ════════════════════════════════════════════════════════════════════════════
// Αίτημα πελάτη 06/09/2026: «όταν κάνω παραγγελία να βγάζει προτεινόμενες
// οδούς» — δηλαδή ό,τι έχουν ήδη τα καταστήματα, και στη «Νέα Παραγγελία».
//
// ΓΙΑΤΙ ΜΕΣΩ EDGE FUNCTIONS: το κλειδί της Google δεν επιτρέπεται να φτάσει
// στον browser, και το admin είναι σκέτο Vite SPA χωρίς δικό του server. Οι
// τρεις functions (places-autocomplete, place-details, route-distance) ζουν στο
// `supabase/functions/` και τις μοιράζονται και τα δύο apps.
//
// ΟΙΚΟΝΟΜΙΑ: ένα session token κρατά για ΟΛΗ την αναζήτηση μιας διεύθυνσης —
// τα ενδιάμεσα autocomplete είναι δωρεάν και χρεώνεται μόνο το τελικό
// place-details που κλείνει το session. Το token ανανεώνεται ΜΟΝΟ μετά από
// ολοκληρωμένο place-details ή μετά την υποβολή παραγγελίας.

/** Πόσοι χαρακτήρες πριν αρχίσουμε να ρωτάμε τη Google. */
export const MIN_CHARS = 3;

/** Πόσο περιμένουμε μετά το τελευταίο πλήκτρο. */
export const DEBOUNCE_MS = 350;

/** Νέο session token — ένα ανά «αναζήτηση διεύθυνσης». */
export function newSessionToken() {
  return (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

/**
 * Χωρίζει «Μεγάλου Αλεξάνδρου 45» σε οδό και αριθμό.
 *
 * Οδός και αριθμός ζουν στο ΙΔΙΟ πεδίο (όπως και στα καταστήματα), αλλά το
 * autocomplete της Google δουλεύει πολύ καλύτερα με σκέτη οδό: ο αριθμός
 * στενεύει τα αποτελέσματα σε ένα ακριβές κτίριο που συχνά δεν υπάρχει στον
 * χάρτη μιας επαρχιακής πόλης.
 */
export function splitAddress(text) {
  const m = /\s(\d+[Α-Ωα-ωA-Za-z]?)\s*$/.exec(String(text || ''));
  if (!m || m.index === undefined) return { street: String(text || '').trim(), number: '' };
  return { street: text.slice(0, m.index).trim(), number: m[1].replace(/\s+/g, '') };
}

/** Προτάσεις οδών. Γυρνά [] σε οποιοδήποτε πρόβλημα — ποτέ δεν πετάει. */
export async function fetchSuggestions(text, session) {
  try {
    const { data, error } = await invokeWithAuthRetry('places-autocomplete', {
      body: { text, session },
    });
    if (error) {
      console.error('[places] autocomplete', error);
      return [];
    }
    return data?.suggestions || [];
  } catch (e) {
    console.error('[places] autocomplete', e);
    return [];
  }
}

/** Συντεταγμένες μιας πρότασης. null σε αποτυχία — ο καλών κρατά το κείμενο. */
export async function fetchPlaceDetails(placeId, session) {
  try {
    const { data, error } = await invokeWithAuthRetry('place-details', {
      body: { placeId, session },
    });
    if (error) {
      console.error('[places] details', error);
      return null;
    }
    if (typeof data?.lat !== 'number' || typeof data?.lon !== 'number') return null;
    return data;
  } catch (e) {
    console.error('[places] details', e);
    return null;
  }
}

/**
 * Οδική απόσταση κατάστημα → προορισμός, με fallback στην ευθεία.
 *
 * ΠΟΤΕ δεν πετάει και ποτέ δεν γυρνά κενό όταν υπάρχουν δύο σημεία: κάθε
 * αποτυχία (πεσμένο Geoapify, timeout, σημείο εκτός οδικού δικτύου) καταλήγει
 * στην ευθεία. Καμία παραγγελία δεν μένει χωρίς απόσταση επειδή έπεσε μια
 * εξωτερική υπηρεσία — ίδια πολιτική με τα καταστήματα.
 */
export async function measureRoadDistance(origin, dest) {
  if (!origin || !dest) return { km: null, source: null, minutes: null };

  const straight = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
  const fallback = { km: straight, source: 'straight', minutes: null };

  // Πάνω από το όριο ήδη σε ευθεία → η οδική δεν το σώζει (είναι πάντα ≥ αυτής).
  // Καμία κλήση, κανένα credit.
  if (straight > MAX_DISTANCE_KM) return fallback;

  try {
    const { data, error } = await invokeWithAuthRetry('route-distance', {
      body: { from: `${origin.lat},${origin.lon}`, to: `${dest.lat},${dest.lon}` },
    });
    if (error || typeof data?.km !== 'number') return fallback;
    return {
      km: data.km,
      source: 'road',
      minutes: typeof data.minutes === 'number' ? data.minutes : null,
    };
  } catch (e) {
    console.error('[places] route-distance', e);
    return fallback;
  }
}
