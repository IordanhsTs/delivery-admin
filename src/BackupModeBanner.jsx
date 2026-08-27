import { isBackupMode } from './supabaseClient';

// Ενημερωτική μπάρα όταν τρέχουμε στο εφεδρικό datacenter (standby).
//
// ΔΕΝ σημαίνει περιορισμό: το εφεδρικό δέχεται ΟΛΕΣ τις λειτουργίες, ακριβώς
// όπως το κύριο. Η μπάρα υπάρχει για να ξέρει ο υπεύθυνος ότι το κύριο σύστημα
// έχει πρόβλημα και ότι τα δεδομένα θα γυρίσουν πίσω σε αυτό στις 02:00.
export default function BackupModeBanner() {
  if (!isBackupMode()) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-[2] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-center"
      style={{
        backgroundColor: 'var(--warning-bg)',
        borderBottom: '1px solid var(--warning-border)',
        color: 'var(--warning)',
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>
        Τρέχουμε στο <strong>εφεδρικό σύστημα</strong>. Όλες οι λειτουργίες δουλεύουν
        κανονικά — τα δεδομένα επιστρέφουν στο κύριο στις 02:00.
      </span>
    </div>
  );
}
