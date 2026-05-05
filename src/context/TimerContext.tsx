'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type EventStatus = 'idle' | 'running' | 'paused' | 'finished';

interface TimerContextValue {
  status: EventStatus;
  startedAt: string | null;
  elapsedSeconds: number;
  durationMinutes: number;
  isExpired: boolean;
}

const defaultValue: TimerContextValue = {
  status: 'idle',
  startedAt: null,
  elapsedSeconds: 0,
  durationMinutes: 0,
  isExpired: false,
};

const TimerContext = createContext<TimerContextValue>(defaultValue);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<EventStatus>('idle');
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    // We want the timer to be global, but only active for logged-in users
    if (!user) {
      setStatus('idle');
      setStartedAt(null);
      setElapsedSeconds(0);
      setDurationMinutes(0);
      setIsExpired(false);
      return;
    }

    const fetchTimerSettings = async () => {
      try {
        const res = await fetch('/api/timer');
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status ?? 'idle');
          setStartedAt(data.event_started_at ?? null);
          setElapsedSeconds(data.event_elapsed_seconds ?? 0);
          setDurationMinutes(data.event_duration_minutes ?? 0);
          setIsExpired(data.status === 'finished');
        }
      } catch {
        // Silent fail
      }
    };

    fetchTimerSettings();

    // Polling every 15 seconds
    const interval = setInterval(fetchTimerSettings, 15000);

    return () => clearInterval(interval);
  }, [user]);

  return (
    <TimerContext.Provider
      value={{ status, startedAt, elapsedSeconds, durationMinutes, isExpired }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimerContext(): TimerContextValue {
  return useContext(TimerContext);
}
