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

    const fetchSettings = async () => {
      const { data } = await supabase
        .from('settings')
        .select('key, value');
      
      if (data) {
        const s = data.find(item => item.key === 'event_status')?.value as EventStatus;
        const start = data.find(item => item.key === 'event_started_at')?.value;
        const elapsed = parseInt(data.find(item => item.key === 'event_elapsed_seconds')?.value || '0');
        const duration = parseInt(data.find(item => item.key === 'event_duration_minutes')?.value || '0');
        
        setStatus(s ?? 'idle');
        setStartedAt(start ?? null);
        setElapsedSeconds(elapsed);
        setDurationMinutes(duration);
        setIsExpired(s === 'finished');
      }
    };

    fetchSettings();

    // Subscribe to all settings changes since we only have a few global keys
    const channel = supabase
      .channel('global-settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          const newItem = payload.new as { key: string; value: string };
          if (!newItem) return;

          if (newItem.key === 'event_status') {
            const newStatus = newItem.value as EventStatus;
            setStatus(newStatus);
            setIsExpired(newStatus === 'finished');
          } else if (newItem.key === 'event_started_at') {
            setStartedAt(newItem.value);
          } else if (newItem.key === 'event_elapsed_seconds') {
            setElapsedSeconds(parseInt(newItem.value || '0'));
          } else if (newItem.key === 'event_duration_minutes') {
            setDurationMinutes(parseInt(newItem.value || '0'));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
