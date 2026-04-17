-- Migration: 002_event_timer_control
-- Adds duration-based timer control columns to the events table.
-- Existing start_time and end_time columns are preserved unchanged.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS duration_seconds        INTEGER      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS timer_state             TEXT         NOT NULL DEFAULT 'idle'
    CONSTRAINT events_timer_state_check CHECK (timer_state IN ('idle', 'running', 'paused', 'ended')),
  ADD COLUMN IF NOT EXISTS timer_started_at        TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS timer_remaining_seconds INTEGER      DEFAULT NULL;
