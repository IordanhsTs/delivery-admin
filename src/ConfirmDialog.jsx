import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

// Promise-based replacement for window.confirm(), styled to match the rest of the
// app's chrome (card-glass + CSS variables). Only one request is ever pending at a
// time, so a single module-level listener is enough — mount <ConfirmDialogHost />
// once near <Toaster /> and call confirmDialog(message) from anywhere.
let listener = null;

export function confirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    listener?.({
      message,
      title: options.title ?? 'Επιβεβαίωση',
      confirmLabel: options.confirmLabel ?? 'Επιβεβαίωση',
      cancelLabel: options.cancelLabel ?? 'Ακύρωση',
      danger: options.danger ?? false,
      resolve,
    });
  });
}

export default function ConfirmDialogHost() {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    listener = setRequest;
    return () => { listener = null; };
  }, []);

  const close = useCallback((result) => {
    setRequest((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          key="confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => close(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            role="alertdialog"
            aria-modal="true"
            className="card-glass backdrop-blur-md w-full max-w-sm rounded-2xl border p-5 shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
            style={{ borderColor: 'var(--border-default)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <AlertTriangle
                size={20}
                className="shrink-0 mt-0.5"
                style={{ color: request.danger ? 'var(--danger)' : 'var(--accent)' }}
              />
              <div>
                <h3 className="font-bold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
                  {request.title}
                </h3>
                <p className="text-sm m-0" style={{ color: 'var(--text-secondary)' }}>
                  {request.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                {request.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: request.danger ? 'var(--danger)' : 'var(--accent)' }}
              >
                {request.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
