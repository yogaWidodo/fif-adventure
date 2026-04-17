'use client';

/**
 * ConfirmationModal — modal konfirmasi sebelum pemberian poin ke tim.
 * Requirements: 7.1, 7.10
 */

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, X, Flame, MapPin, Users } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  teamName: string;
  locationName: string;
  score: number;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export default function ConfirmationModal({
  isOpen,
  teamName,
  locationName,
  score,
  onConfirm,
  onCancel,
  isSubmitting,
}: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="confirmation-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          style={{
            background: 'rgba(5, 12, 8, 0.85)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => {
            // Close on backdrop click only if not submitting
            if (e.target === e.currentTarget && !isSubmitting) onCancel();
          }}
        >
          <motion.div
            key="confirmation-modal-content"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="adventure-card w-full max-w-sm mx-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-primary torch-glow" />
                <h2 className="font-adventure text-sm uppercase tracking-[0.3em] text-primary">
                  Konfirmasi Poin
                </h2>
              </div>
              {!isSubmitting && (
                <button
                  onClick={onCancel}
                  className="text-foreground/40 hover:text-foreground transition-colors"
                  aria-label="Batal"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Team info */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-sm space-y-3">
                <div className="flex items-start gap-3">
                  <Users className="w-4 h-4 text-primary/60 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] uppercase font-adventure tracking-[0.3em] text-primary/50 mb-0.5">
                      Tim
                    </p>
                    <p className="font-adventure text-lg gold-engraving leading-tight">
                      {teamName}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-primary/60 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] uppercase font-adventure tracking-[0.3em] text-primary/50 mb-0.5">
                      Wahana
                    </p>
                    <p className="font-adventure text-sm text-foreground/80">
                      {locationName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Score highlight */}
              <div className="flex items-center justify-center py-4 border border-primary/30 bg-primary/10 rounded-sm">
                <div className="text-center">
                  <p className="text-[9px] uppercase font-adventure tracking-[0.3em] text-primary/50 mb-1">
                    Poin yang akan diberikan
                  </p>
                  <p className="font-adventure text-5xl gold-engraving">
                    {score}
                  </p>
                  <p className="text-[9px] font-adventure text-primary/40 mt-1 uppercase tracking-widest">
                    poin
                  </p>
                </div>
              </div>

              <p className="text-[11px] font-content text-muted-foreground italic text-center opacity-70">
                Pastikan tim telah menyelesaikan wahana sebelum mengkonfirmasi.
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={onCancel}
                disabled={isSubmitting}
                className="flex-1 py-3 font-adventure text-xs uppercase tracking-[0.2em] border border-primary/30 text-foreground/60 hover:text-foreground hover:border-primary/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Batal
              </button>
              <button
                onClick={onConfirm}
                disabled={isSubmitting}
                className="flex-1 py-3 font-adventure text-xs uppercase tracking-[0.2em] bg-secondary hover:bg-secondary/80 text-secondary-foreground shadow-[0_4px_16px_rgba(139,69,19,0.4)] hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-secondary-foreground/30 border-t-secondary-foreground rounded-full animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Konfirmasi
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
