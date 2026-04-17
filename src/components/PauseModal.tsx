'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PauseCircle } from 'lucide-react';
import { useTimerContext } from '@/context/TimerContext';
import { useAuth } from '@/context/AuthContext';

export default function PauseModal(): React.JSX.Element | null {
  const { timerState } = useTimerContext();
  const { user } = useAuth();

  // Don't render for admins or when not paused
  if (timerState !== 'paused' || user?.role === 'admin') {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        key="pause-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{
          background: 'rgba(5, 12, 8, 0.85)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="adventure-card px-12 py-10 flex flex-col items-center gap-6 max-w-sm w-full mx-4"
        >
          {/* Pulsing pause icon */}
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <PauseCircle className="w-16 h-16 text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.5)]" />
          </motion.div>

          {/* Heading */}
          <h2 className="font-adventure gold-engraving text-3xl text-center leading-tight">
            Expedition Paused
          </h2>

          {/* Subtext */}
          <p className="font-adventure text-amber-200/70 text-sm tracking-widest uppercase text-center">
            Stand by for resumption
          </p>

          {/* Decorative divider */}
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

          <p className="text-[#e6dfc1]/50 text-xs text-center leading-relaxed">
            The expedition master has temporarily halted the clock.
            <br />
            Await further instructions.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
