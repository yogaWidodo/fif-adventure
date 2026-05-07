'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PauseCircle, Hourglass } from 'lucide-react';
import { useTimerContext } from '@/context/TimerContext';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';

export default function PauseModal(): React.JSX.Element | null {
  const { status } = useTimerContext();
  const { user } = useAuth();
  const pathname = usePathname();

  const isIdle   = status === 'idle';
  const isPaused = status === 'paused';

  // Show for idle or paused — but never for admins or on the login page
  if ((!isIdle && !isPaused) || user?.role === 'admin' || pathname === '/login') {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        key={`event-${status}-modal`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ background: 'rgba(5, 12, 8, 0.95)' }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="adventure-card px-12 py-10 flex flex-col items-center gap-6 max-w-sm w-full mx-4"
        >
          {/* Icon — Hourglass for idle, PauseCircle for paused */}
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            {isIdle ? (
              <Hourglass className="w-16 h-16 text-primary drop-shadow-[0_0_18px_rgba(212,175,55,0.5)]" />
            ) : (
              <PauseCircle className="w-16 h-16 text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.5)]" />
            )}
          </motion.div>

          {/* Heading */}
          <h2 className="font-adventure gold-engraving text-3xl text-center leading-tight">
            {isIdle ? 'Expedition Has Not Started' : 'Expedition Paused'}
          </h2>

          {/* Subtext */}
          <p className={`font-adventure text-sm tracking-widest uppercase text-center ${isIdle ? 'text-primary/60' : 'text-amber-200/70'}`}>
            {isIdle ? 'Awaiting expedition master' : 'Stand by for resumption'}
          </p>

          {/* Decorative divider */}
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <p className="text-[#e6dfc1]/50 text-xs text-center leading-relaxed">
            {isIdle
              ? <>The adventure has yet to begin.<br />Please wait for the signal to depart.</>
              : <>The expedition master has temporarily halted the clock.<br />Await further instructions.</>
            }
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
