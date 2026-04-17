'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, Flame, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTimerContext } from '@/context/TimerContext';
import { computeRemaining, isLooming } from '@/lib/timerUtils';

interface ExpeditionTimerProps {
  eventId?: string | null;
  onExpired?: () => void;
}

export default function ExpeditionTimer({ onExpired }: ExpeditionTimerProps) {
  const { timerState, timerRemainingSeconds, timerStartedAt, eventId } = useTimerContext();

  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);
  const [loomingState, setLoomingState] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  // Track whether we've already fired onExpired + written 'ended' to avoid duplicate calls
  const expiredFiredRef = useRef(false);

  // Helper: convert total seconds to h/m/s
  function secondsToHMS(totalSeconds: number): { h: number; m: number; s: number } {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { h, m, s };
  }

  useEffect(() => {
    // Reset expired tracking when timer state changes away from ended
    if (timerState !== 'ended' && timerState !== 'running') {
      expiredFiredRef.current = false;
    }

    if (timerState === 'idle' || timerState === 'ended') {
      setTimeLeft({ h: 0, m: 0, s: 0 });
      setLoomingState(false);
      if (timerState === 'ended' && !isExpired) {
        setIsExpired(true);
      }
      if (timerState === 'idle') {
        setIsExpired(false);
      }
      return;
    }

    if (timerState === 'paused') {
      const remaining = timerRemainingSeconds ?? 0;
      setTimeLeft(secondsToHMS(remaining));
      setLoomingState(false);
      setIsExpired(false);
      expiredFiredRef.current = false;
      return;
    }

    if (timerState === 'running') {
      if (timerRemainingSeconds === null || timerStartedAt === null) {
        // Not enough data yet — show null (loading)
        setTimeLeft(null);
        return;
      }

      setIsExpired(false);

      const tick = () => {
        const now = new Date();
        const remaining = computeRemaining(timerRemainingSeconds, timerStartedAt, now);
        const looming = isLooming(remaining, timerState);

        setTimeLeft(secondsToHMS(remaining));
        setLoomingState(looming);

        if (remaining <= 0 && !expiredFiredRef.current) {
          expiredFiredRef.current = true;
          setIsExpired(true);
          onExpired?.();

          // Write timer_state = 'ended' to Supabase
          if (eventId) {
            supabase
              .from('events')
              .update({ timer_state: 'ended' })
              .eq('id', eventId)
              .then(({ error }) => {
                if (error) {
                  console.error('ExpeditionTimer: failed to write ended state', error);
                }
              });
          }
        }
      };

      // Run immediately, then every second
      tick();
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState, timerRemainingSeconds, timerStartedAt, eventId]);

  if (!timeLeft) return null;

  return (
    <motion.div
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-6 right-6 z-[100] flex items-center gap-4"
    >
      <div
        className={`adventure-card px-6 py-3 border-primary/40 backdrop-blur-xl flex items-center gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-colors duration-1000 ${
          isExpired ? 'border-gray-500/60 bg-gray-900/40' :
          loomingState ? 'border-red-500/60 bg-red-900/20' : 'bg-card/40'
        }`}
      >
        <div className="relative">
          <Clock
            className={`w-5 h-5 ${isExpired ? 'text-gray-500' : loomingState ? 'text-red-500' : 'text-primary'} ${loomingState && !isExpired ? 'animate-pulse' : ''}`}
          />
          {!loomingState && !isExpired && <Flame className="absolute -top-1 -right-1 w-2 h-2 text-accent torch-glow" />}
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase font-adventure tracking-widest ${isExpired ? 'text-gray-500' : 'text-[#f4e4bc]/60'}`}>
            {isExpired ? 'Expedition Ended' : 'Expedition Ends In'}
          </span>
          {!isExpired && (
            <div className="flex items-center gap-1 min-w-[100px] justify-center">
              <TimeUnit value={timeLeft.h} label="h" />
              <span className="opacity-30 font-adventure">:</span>
              <TimeUnit value={timeLeft.m} label="m" />
              <span className="opacity-30 font-adventure">:</span>
              <TimeUnit value={timeLeft.s} label="s" />
            </div>
          )}
        </div>

        {loomingState && !isExpired && (
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
