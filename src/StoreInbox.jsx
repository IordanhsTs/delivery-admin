import { Inbox, Building, Check, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStoreMessages } from './useStoreMessages';

// Εισερχόμενα μηνύματα από τα καταστήματα (βλ. useStoreMessages για το γιατί πίνακας).
export default function StoreInbox() {
  const { messages, loading, unreadCount, markRead, markAllRead } = useStoreMessages();

  const stamp = (iso) =>
    new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Inbox className="text-[#C5A066]" size={20} />
          <h3 className="m-0 text-lg font-bold tracking-wide" style={{ color: 'var(--accent)' }}>
            Μηνύματα από Καταστήματα
          </h3>
          {unreadCount > 0 && (
            <span
              className="text-[11px] font-black px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--danger)', color: '#fff' }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
            style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-muted)', border: '1px solid var(--border-subtle)' }}
          >
            <CheckCheck size={14} /> Όλα ως διαβασμένα
          </button>
        )}
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)' }}
      >
        {loading ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Φόρτωση…</div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox size={36} style={{ color: 'var(--text-muted)' }} className="mx-auto mb-3" />
            <p className="m-0 text-sm" style={{ color: 'var(--text-muted)' }}>
              Κανένα μήνυμα από καταστήματα.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((m) => {
              const unread = !m.read_at;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 border-b last:border-b-0 flex items-start gap-3"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: unread ? 'var(--accent-muted)' : 'transparent',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                  >
                    <Building size={15} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <b className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {m.stores?.name || 'Άγνωστο κατάστημα'}
                      </b>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{stamp(m.created_at)}</span>
                      {unread && (
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--danger)', color: '#fff' }}
                        >
                          ΝΕΟ
                        </span>
                      )}
                    </div>
                    <p className="m-0 mt-1 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                      {m.message}
                    </p>
                  </div>

                  {unread && (
                    <button
                      onClick={() => markRead(m.id)}
                      className="p-1.5 rounded-lg shrink-0 transition-all"
                      style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                      title="Σήμανση ως διαβασμένο"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
