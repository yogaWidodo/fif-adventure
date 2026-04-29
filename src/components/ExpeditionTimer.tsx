'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Flame, AlertTriangle, PauseCircle, HourglassIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTimerContext } from '@/context/TimerContext';
import { computeRemaining, isLooming } from '@/lib/timerUtils';

interface ExpeditionTimerProps {
  onExpired?: () => void;
  className?: string;
  variant?: 'fixed' | 'block' | 'inline';
}

export default function ExpeditionTimer({ onExpired, className = '', variant = 'fixed' }: ExpeditionTimerProps) {
  const { status, startedAt, elapsedSeconds, durationMinutes } = useTimerContext();

  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);
  const [loomingState, setLoomingState] = useState(false);
  const [isExpiredLocally, setIsExpiredLocally] = useState(false);

  const localRemainingRef = useRef<number>(0);
  const expiredFiredRef = useRef(false);

  function secondsToHMS(totalSeconds: number): { h: number; m: number; s: number } {
    const clamped = Math.max(0, totalSeconds);
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = clamped % 60;
    return { h, m, s };
  }

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
    if (status !== 'finished' && status !== 'running') {
      expiredFiredRef.current = false;
    }

    if (status === 'idle') {
      setTimeLeft(null);
      setLoomingState(false);
      setIsExpiredLocally(false);
      return;
    }

    if (status === 'finished') {
      setTimeLeft({ h: 0, m: 0, s: 0 });
      setLoomingState(false);
      setIsExpiredLocally(true);
      return;
    }

    if (status === 'paused') {
      const remaining = computeRemaining(durationMinutes, elapsedSeconds, null, new Date(), 'paused');
      localRemainingRef.current = remaining;
      setTimeLeft(secondsToHMS(remaining));
      setLoomingState(false);
      setIsExpiredLocally(false);
      expiredFiredRef.current = false;
      return;
    }

    if (status === 'running') {
      setIsExpiredLocally(false);
      const initRemaining = computeRemaining(durationMinutes, elapsedSeconds, startedAt, new Date(), status);
      localRemainingRef.current = initRemaining;
      setTimeLeft(secondsToHMS(initRemaining));

      const tickInterval = setInterval(() => {
        const remaining = computeRemaining(durationMinutes, elapsedSeconds, startedAt, new Date(), status);
        localRemainingRef.current = remaining;
        const looming = isLooming(remaining, status);
        setLoomingState(prev => prev !== looming ? looming : prev);
        
        const newHMS = secondsToHMS(remaining);
        setTimeLeft(prev => {
          if (prev && prev.h === newHMS.h && prev.m === newHMS.m && prev.s === newHMS.s) return prev;
          return newHMS;
        });

        if (remaining <= 0 && !expiredFiredRef.current) {
          expiredFiredRef.current = true;
          setIsExpiredLocally(true);
          onExpired?.();
        }
      }, 1000);

      const resyncInterval = setInterval(async () => {
        const serverRemaining = await fetchServerRemaining();
        if (serverRemaining !== null) {
          const drift = Math.abs(localRemainingRef.current - serverRemaining);
          if (drift > 2) {
            localRemainingRef.current = serverRemaining;
            setTimeLeft(secondsToHMS(serverRemaining));
          }
        }
      }, 60_000);

      return () => {
        clearInterval(tickInterval);
        clearInterval(resyncInterval);
      };
    }
  }, [status, startedAt, elapsedSeconds, durationMinutes]);

  const isFixed = variant === 'fixed';
  const isInline = variant === 'inline';
  
  const containerClasses = isFixed 
    ? "fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none select-none"
    : `flex items-center ${className}`;

  const cardClasses = isInline
    ? "flex items-center gap-2"
    : `adventure-card ${isFixed ? 'pointer-events-auto border-t-0 rounded-t-none rounded-b-2xl' : 'rounded-xl'} px-4 py-1.5 border-primary/30 flex items-center gap-4 shadow-2xl transition-colors duration-1000 w-full ${
        isExpiredLocally ? 'border-gray-500/60 bg-gray-900/90' :
        loomingState ? 'border-red-500/60 bg-red-900/90' : 'bg-black/90'
      }`;

  const labelSize = isInline ? "text-[7px]" : "text-[9px]";
  const numberSize = isInline ? "text-sm" : "text-xl";

  if (status === 'idle' || timeLeft === null) {
    if (isInline) return null;
    return (
      <div className={containerClasses}>
        <div className={cardClasses}>
          <HourglassIcon className="w-3.5 h-3.5 text-primary/50" />
          <span className="font-adventure text-[9px] uppercase tracking-widest text-[#f4e4bc]/40 pt-0.5">
            Event Belum Dimulai
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className={cardClasses}>
        {!isInline && (
          <div className="relative">
            {status === 'paused' ? (
              <PauseCircle className="w-4 h-4 text-amber-400" />
            ) : (
              <>
                <Clock className={`w-4 h-4 ${isExpiredLocally ? 'text-gray-500' : loomingState ? 'text-red-500' : 'text-primary'}`} />
                {!loomingState && !isExpiredLocally && <Flame className="absolute -top-1 -right-1 w-2 h-2 text-accent torch-glow" />}
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {!isInline && (
            <span className={`${labelSize} uppercase font-adventure tracking-widest pt-0.5 ${isExpiredLocally ? 'text-gray-500' : status === 'paused' ? 'text-amber-300/70' : 'text-[#f4e4bc]/60'}`}>
              {isExpiredLocally ? 'Event Selesai' : status === 'paused' ? 'Event Dijeda' : 'Ends In'}
            </span>
          )}
          {!isExpiredLocally && (
            <div className={`flex items-center gap-1 ${isInline ? '' : 'min-w-[80px]'} justify-center`}>
              <TimeUnit value={timeLeft.h} label="h" size={numberSize} labelSize={labelSize} />
              <span className="opacity-30 font-adventure">:</span>
              <TimeUnit value={timeLeft.m} label="m" size={numberSize} labelSize={labelSize} />
              <span className="opacity-30 font-adventure">:</span>
              <TimeUnit value={timeLeft.s} label="s" size={numberSize} labelSize={labelSize} />
            </div>
          )}
        </div>

        {loomingState && !isExpiredLocally && !isInline && (
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
            <AlertTriangle className="w-4 h-4 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          </motion.div>
        )}
      </div>
    </div>
  );
}

const TimeUnit = memo(function TimeUnit({ value, label, size, labelSize }: { value: number; label: string; size: string; labelSize: string }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className={`font-adventure ${size} gold-engraving tracking-tight`}>
        {value.toString().padStart(2, '0')}
      </span>
      <span className={`${labelSize} font-adventure text-[#f4e4bc]/30 uppercase`}>{label}</span>
    </div>
  );
});
