'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle2, ShieldAlert, Flame, X } from 'lucide-react';
import { isScoreValid } from '@/lib/auth';

interface ScoreInputFormProps {
  teamId: string;
  teamName: string;
  locationId: string;
  maxPoints: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

export default function ScoreInputForm({
  teamId,
  teamName,
  locationId,
  maxPoints,
  onSuccess,
  onCancel,
}: ScoreInputFormProps) {
  const [scoreInput, setScoreInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Clear validation error when input changes
  useEffect(() => {
    setValidationError(null);
  }, [scoreInput]);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const score = Number(scoreInput);

    // Client-side validation: 0 <= score <= maxPoints
    if (scoreInput === '' || isNaN(score)) {
      setValidationError('Please enter a valid score.');
      return;
    }

    if (!isScoreValid(score, maxPoints)) {
      setValidationError(`Score must be between 0 and ${maxPoints}.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, location_id: locationId, score }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Score submission failed.');
      }

      setToast({
        type: 'success',
        message: `Score of ${score} recorded for ${teamName}!`,
      });
      setScoreInput('');
      onSuccess?.();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unknown error occurred.';
      setToast({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const scoreNum = Number(scoreInput);
  const isInputValid =
    scoreInput !== '' && !isNaN(scoreNum) && isScoreValid(scoreNum, maxPoints);

  return (
    <div className="adventure-card border-primary/20 bg-card/60 backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <Flame className="w-4 h-4 text-primary torch-glow" />
          <h3 className="font-adventure text-sm uppercase tracking-[0.3em] text-primary">
            Score Entry
          </h3>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-foreground/40 hover:text-foreground transition-colors"
            aria-label="Cancel score entry"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-6">
        {/* Selected team info */}
        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-sm">
          <p className="text-[9px] uppercase font-adventure tracking-[0.3em] text-primary/50 mb-1">
            Recording score for
          </p>
          <p className="font-adventure text-lg gold-engraving">{teamName}</p>
          <p className="text-[10px] font-adventure text-primary/40 mt-1">
            Max points: {maxPoints}
          </p>
        </div>

        {/* Score form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="score-input"
              className="block text-[10px] uppercase tracking-widest font-adventure text-foreground/50 mb-2"
            >
              Score (0 – {maxPoints})
            </label>
            <input
              id="score-input"
              type="number"
              min={0}
              max={maxPoints}
              step={1}
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              placeholder={`Enter score...`}
              disabled={isSubmitting}
              className={`w-full bg-black/40 border-b-2 p-3 font-adventure text-2xl text-foreground placeholder:text-foreground/20
                focus:outline-none transition-colors
                ${validationError
                  ? 'border-red-500/60 focus:border-red-500'
                  : isInputValid
                  ? 'border-green-500/60 focus:border-green-500'
                  : 'border-primary/30 focus:border-primary'
                }
                disabled:opacity-50
              `}
            />
            <AnimatePresence>
              {validationError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mt-2 text-[11px] text-red-400 font-content italic"
                >
                  {validationError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Score range indicator */}
          {scoreInput !== '' && !isNaN(scoreNum) && (
            <div className="mb-4">
              <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-primary/10">
                <motion.div
                  className={`h-full rounded-full transition-colors ${
                    isInputValid ? 'bg-primary' : 'bg-red-500/60'
                  }`}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.min(100, Math.max(0, (scoreNum / maxPoints) * 100))}%`,
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-[9px] font-adventure text-primary/40 mt-1 text-right">
                {isInputValid
                  ? `${Math.round((scoreNum / maxPoints) * 100)}% of max`
                  : 'Out of range'}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!isInputValid || isSubmitting}
            className={`w-full flex items-center justify-center gap-3 py-4 font-adventure uppercase tracking-[0.2em] transition-all
              ${isInputValid && !isSubmitting
                ? 'bg-secondary hover:bg-secondary/80 text-secondary-foreground shadow-[0_5px_20px_rgba(139,69,19,0.4)] hover:scale-[1.02]'
                : 'bg-primary/10 text-primary/30 cursor-not-allowed'
              }
            `}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Score
              </>
            )}
          </button>
        </form>
      </div>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`mx-6 mb-6 p-4 flex items-start gap-3 border rounded-sm backdrop-blur-sm
              ${toast.type === 'success'
                ? 'bg-green-900/30 border-green-500/30'
                : 'bg-red-900/30 border-red-500/30'
              }
            `}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p
                className={`text-[10px] uppercase font-adventure tracking-widest mb-1 ${
                  toast.type === 'success' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {toast.type === 'success' ? 'Score Recorded' : 'Submission Failed'}
              </p>
              <p className="text-xs font-content text-foreground/70 italic">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="ml-auto text-foreground/30 hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
