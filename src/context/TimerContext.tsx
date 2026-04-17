'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { TimerState } from '@/lib/timerUtils';

interface TimerContextValue {
  timerState: TimerState;
  timerRemainingSeconds: number | null;
  timerStartedAt: string | null;
  eventId: string | null;
}

const defaultValue: TimerContextValue = {
  timerState: 'idle',
  timerRemainingSeconds: null,
  timerStartedAt: null,
  eventId: null,
};

const TimerContext = createContext<TimerContextValue>(defaultValue);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    // Admin users always stay idle — no subscription
    if (!user || user.role === 'admin') {
      setTimerState('idle');
      setTimerRemainingSeconds(null);
      setTimerStartedAt(null);
      setEventId(null);
      return;
    }

    // If user has no event_id in cached auth, fetch it fresh from the database.
    // This handles the case where event_id was assigned after the user last logged in.
    const resolveEventId = async (): Promise<string | null> => {
      if (user.event_id) return user.event_id;
      const { data } = await supabase
        .from('users')
        .select('event_id')
        .eq('id', user.id)
        .maybeSingle();
      return data?.event_id ?? null;
    };

    let channelRef: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    resolveEventId().then((event_id) => {
      if (cancelled) return;

      if (!event_id) {
        setTimerState('idle');
        setTimerRemainingSeconds(null);
        setTimerStartedAt(null);
        setEventId(null);
        return;
      }

      setEventId(event_id);

      // Fetch initial timer state from the database
      supabase
        .from('events')
        .select('timer_state, timer_remaining_seconds, timer_started_at')
        .eq('id', event_id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error('TimerContext: failed to fetch initial event state', error);
            return;
          }
          if (data) {
            setTimerState((data.timer_state as TimerState) ?? 'idle');
            setTimerRemainingSeconds(data.timer_remaining_seconds ?? null);
            setTimerStartedAt(data.timer_started_at ?? null);
          }
        });

      // Subscribe to Realtime changes for this event row
      channelRef = supabase
        .channel(`timer-${event_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'events',
            filter: `id=eq.${event_id}`,
          },
          (payload) => {
            const row = payload.new as {
              timer_state?: string;
              timer_remaining_seconds?: number | null;
              timer_started_at?: string | null;
              id?: string;
            };

            if (row) {
              setTimerState((row.timer_state as TimerState) ?? 'idle');
              setTimerRemainingSeconds(row.timer_remaining_seconds ?? null);
              setTimerStartedAt(row.timer_started_at ?? null);
            }
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channelRef) {
        supabase.removeChannel(channelRef);
      }
    };
  }, [user]);

  return (
    <TimerContext.Provider
      value={{ timerState, timerRemainingSeconds, timerStartedAt, eventId }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimerContext(): TimerContextValue {
  return useContext(TimerContext);
}
