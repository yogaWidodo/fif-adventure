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
  isLoading: boolean; // true until first fetch completes
}

const defaultValue: TimerContextValue = {
  status: 'idle',
  startedAt: null,
  elapsedSeconds: 0,
  durationMinutes: 0,
  isExpired: false,
  isLoading: true,
};

const TimerContext = createContext<TimerContextValue>(defaultValue);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<EventStatus>('idle');
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // We want the timer to be global, but only active for logged-in users
    if (!user) {
      setStatus('idle');
      setStartedAt(null);
      setElapsedSeconds(0);
      setDurationMinutes(0);
      setIsExpired(false);
      setIsLoading(false); // No user = no fetch needed, not loading
      return;
    }

    const fetchTimerSettings = async (isFirst = false) => {
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
      } finally {
        if (isFirst) setIsLoading(false);
      }
    };

    fetchTimerSettings(true); // Mark as first fetch to clear loading state

    // Polling every 15 seconds, skip when tab is hidden
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchTimerSettings();
    }, 15000);

    return () => clearInterval(interval);
  }, [user]);

  return (
    <TimerContext.Provider
      value={{ status, startedAt, elapsedSeconds, durationMinutes, isExpired, isLoading }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimerContext(): TimerContextValue {
  return useContext(TimerContext);
}
