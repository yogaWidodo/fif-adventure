'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, Flame, AlertTriangle, PauseCircle, HourglassIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTimerContext } from '@/context/TimerContext';
import { computeRemaining, isLooming } from '@/lib/timerUtils';

interface ExpeditionTimerProps {
  onExpired?: () => void;
}

export default function ExpeditionTimer({ onExpired }: ExpeditionTimerProps) {
  const { status, startedAt, elapsedSeconds, durationMinutes } = useTimerContext();

  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);
  const [loomingState, setLoomingState] = useState(false);
  const [isExpiredLocally, setIsExpiredLocally] = useState(false);

  // Local remaining seconds for hybrid sync - kept separate from display state
  const localRemainingRef = useRef<number>(0);

  // Track whether we've already fired onExpired + written 'finished' to avoid duplicate calls
  const expiredFiredRef = useRef(false);

  // Helper: convert total seconds to h/m/s
  function secondsToHMS(totalSeconds: number): { h: number; m: number; s: number } {
    const clamped = Math.max(0, totalSeconds);
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = clamped % 60;
    return { h, m, s };
  }

  // ── Fetch remaining_seconds from server (for hybrid re-sync) ──────────────
  async function fetchServerRemaining(): Promise<number | null> {
    try {
      const res = await fetch('/api/timer');
      if (!res.ok) return null;
      const data = await res.json() as { remaining_seconds?: number };
      return typeof data.remaining_seconds === 'number' ? data.remaining_seconds : null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    // Reset expired tracking when timer state changes away from finished
    if (status !== 'finished' && status !== 'running') {
      expiredFiredRef.current = false;
    }

    // ── IDLE ──────────────────────────────────────────────────────────────────
    if (status === 'idle') {
      setTimeLeft(null); // sentinel: display idle badge
      setLoomingState(false);
      setIsExpiredLocally(false);
      return;
    }

    // ── FINISHED ─────────────────────────────────────────────────────────────
    if (status === 'finished') {
      setTimeLeft({ h: 0, m: 0, s: 0 });
      setLoomingState(false);
      setIsExpiredLocally(true);
      return;
    }

    // ── PAUSED ────────────────────────────────────────────────────────────────
    if (status === 'paused') {
      const remaining = computeRemaining(durationMinutes, elapsedSeconds, null, new Date(), 'paused');
      localRemainingRef.current = remaining;
      setTimeLeft(secondsToHMS(remaining));
      setLoomingState(false);
      setIsExpiredLocally(false);
      expiredFiredRef.current = false;
      return;
    }

    // ── RUNNING ───────────────────────────────────────────────────────────────
    if (status === 'running') {
      setIsExpiredLocally(false);

      // Initial fetch from local calculation
      const initRemaining = computeRemaining(durationMinutes, elapsedSeconds, startedAt, new Date(), status);
      localRemainingRef.current = initRemaining;
      setTimeLeft(secondsToHMS(initRemaining));

      // Tick every second (smooth countdown)
      const tickInterval = setInterval(() => {
        localRemainingRef.current = Math.max(0, localRemainingRef.current - 1);
        const remaining = localRemainingRef.current;
        const looming = isLooming(remaining, status);

        setTimeLeft(secondsToHMS(remaining));
        setLoomingState(looming);

        if (remaining <= 0 && !expiredFiredRef.current) {
          expiredFiredRef.current = true;
          setIsExpiredLocally(true);
          onExpired?.();

          // Mark expedition as finished in settings
          supabase
            .from('settings')
            .update({ value: 'finished' })
            .eq('key', 'event_status')
            .then(({ error }) => {
              if (error) {
                console.error('ExpeditionTimer: failed to update event_status to finished', error);
              }
            });
        }
      }, 1000);

      // Re-sync with server every 30 seconds (anti-drift per Req. 4.0)
      const resyncInterval = setInterval(async () => {
        const serverRemaining = await fetchServerRemaining();
        if (serverRemaining !== null) {
          const drift = Math.abs(localRemainingRef.current - serverRemaining);
          if (drift > 2) {
            // Drift > 2 seconds — correct local value
            console.debug(`[ExpeditionTimer] Correcting drift: local=${localRemainingRef.current}, server=${serverRemaining}, diff=${drift}`);
            localRemainingRef.current = serverRemaining;
            setTimeLeft(secondsToHMS(serverRemaining));
          }
        }
      }, 30_000);

      return () => {
        clearInterval(tickInterval);
        clearInterval(resyncInterval);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, startedAt, elapsedSeconds, durationMinutes]);

  // ── IDLE BADGE ─────────────────────────────────────────────────────────────
  if (status === 'idle' || timeLeft === null) {
    return (
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-6 right-6 z-[100] select-none transform-gpu will-change-transform"
      >
        <div className="adventure-card px-5 py-3 border-primary/20 backdrop-blur-md bg-black/40 flex items-center gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <HourglassIcon className="w-4 h-4 text-primary/50" />
          <span className="font-adventure text-[10px] uppercase tracking-widest text-[#f4e4bc]/50">
            Event Belum Dimulai
          </span>
        </div>
      </motion.div>
    );
  }

  // ── PAUSED BADGE ───────────────────────────────────────────────────────────
  if (status === 'paused') {
    return (
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0}
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        whileDrag={{ scale: 1.03, cursor: 'grabbing' }}
        style={{ cursor: 'grab' }}
        className="fixed top-6 right-6 z-[100] flex items-center gap-4 select-none transform-gpu will-change-transform"
      >
        <div className="adventure-card px-6 py-3 border-amber-500/40 backdrop-blur-md flex items-center gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)] bg-amber-950/40">
          <motion.div
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <PauseCircle className="w-5 h-5 text-amber-400" />
          </motion.div>
          <div className="flex items-center gap-3">
            <span className="font-adventure text-[10px] uppercase tracking-widest text-amber-300/70">
              Event Dijeda
            </span>
            <div className="flex items-center gap-1 min-w-[100px] justify-center opacity-60">
              <TimeUnit value={timeLeft.h} label="h" />
              <span className="opacity-30 font-adventure">:</span>
              <TimeUnit value={timeLeft.m} label="m" />
              <span className="opacity-30 font-adventure">:</span>
              <TimeUnit value={timeLeft.s} label="s" />
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── RUNNING / FINISHED ─────────────────────────────────────────────────────
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      whileDrag={{ scale: 1.03, cursor: 'grabbing' }}
      style={{ cursor: 'grab' }}
      className="fixed top-6 right-6 z-[100] flex items-center gap-4 select-none transform-gpu will-change-transform"
    >
      <div
        className={`adventure-card px-6 py-3 border-primary/40 backdrop-blur-md flex items-center gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-colors duration-1000 ${
          isExpiredLocally ? 'border-gray-500/60 bg-gray-900/60' :
          loomingState ? 'border-red-500/60 bg-red-900/40' : 'bg-black/40'
        }`}
      >
        <div className="relative">
          <Clock
            className={`w-5 h-5 ${isExpiredLocally ? 'text-gray-500' : loomingState ? 'text-red-500' : 'text-primary'} ${loomingState && !isExpiredLocally ? 'animate-pulse' : ''}`}
          />
          {!loomingState && !isExpiredLocally && <Flame className="absolute -top-1 -right-1 w-2 h-2 text-accent torch-glow" />}
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase font-adventure tracking-widest ${isExpiredLocally ? 'text-gray-500' : 'text-[#f4e4bc]/60'}`}>
            {isExpiredLocally ? 'Event Selesai' : 'Expedition Ends In'}
          </span>
          {!isExpiredLocally && (
            <div className="flex items-center gap-1 min-w-[100px] justify-center">
              <TimeUnit value={timeLeft.h} label="h" />
              <span className="opacity-30 font-adventure">:</span>
              <TimeUnit value={timeLeft.m} label="m" />
              <span className="opacity-30 font-adventure">:</span>
              <TimeUnit value={timeLeft.s} label="s" />
            </div>
          )}
        </div>

        {loomingState && !isExpiredLocally && (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            <AlertTriangle className="w-5 h-5 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="font-adventure text-xl gold-engraving tracking-tight">
        {value.toString().padStart(2, '0')}
      </span>
      <span className="text-[8px] font-adventure text-[#f4e4bc]/30 uppercase">{label}</span>
    </div>
  );
}
