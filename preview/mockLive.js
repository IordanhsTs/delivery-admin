// ΜΟΝΟ ΓΙΑ PREVIEW — το harness δεν έχει websocket. Χωρίς αυτό το liveChannel
// προσπαθεί να ανοίξει realtime κανάλι πάνω στη ψεύτικη supabase και σκάει.
export function liveChannel() { return () => {}; }
export function skipFirst(fn) { return fn; }
export function onWake() { return () => {}; }
export function forceWake() {}
