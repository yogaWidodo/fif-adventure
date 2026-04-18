/**
 * Pure timer utility functions for Event Timer Control.
 * No DOM, no Supabase — all functions are side-effect-free and directly testable.
 */

export type TimerState = 'idle' | 'running' | 'paused' | 'finished';
export type TimerAction = 'start' | 'pause' | 'resume' | 'reset';

export interface TimerUpdatePayload {
  event_status: TimerState;
  event_started_at: string | null;
  event_elapsed_seconds: number;
  event_duration_minutes: number;
}

/**
 * Validate a duration expressed as whole-number hours and minutes.
 * Returns { valid: true, duration_seconds } on success.
 * Returns { valid: false, error } when input is invalid.
 *
 * Invalid when:
 *  - hours < 0 or minutes < 0
 *  - both hours and minutes are 0
 *  - either value is not a finite integer
 */
export function validateDuration(
  hours: number,
  minutes: number,
): { valid: boolean; error?: string; duration_seconds?: number } {
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return { valid: false, error: 'Hours and minutes must be finite numbers.' };
  }
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return { valid: false, error: 'Hours and minutes must be whole numbers.' };
  }
  if (hours < 0 || minutes < 0) {
    return { valid: false, error: 'Hours and minutes must not be negative.' };
  }
  if (hours === 0 && minutes === 0) {
    return { valid: false, error: 'Duration must be greater than zero.' };
  }
  return { valid: true, duration_seconds: hours * 3600 + minutes * 60 };
}

/**
 * Compute the remaining seconds for a running timer.
 * Clamps to 0 — never returns a negative value.
 */
export function computeRemaining(
  durationMinutes: number,
  elapsedSeconds: number,
  startedAt: string | null,
  now: Date,
  status: TimerState,
): number {
  let totalElapsed = elapsedSeconds;
  if (status === 'running' && startedAt) {
    const startedAtMs = new Date(startedAt).getTime();
    totalElapsed += Math.floor((now.getTime() - startedAtMs) / 1000);
  }
  const totalDurationSeconds = durationMinutes * 60;
  return Math.max(0, totalDurationSeconds - totalElapsed);
}

/**
 * Returns true when the timer is in the "looming" state:
 * less than 30 minutes remaining AND the timer is running.
 */
export function isLooming(computedRemaining: number, timerState: TimerState): boolean {
  return computedRemaining < 1800 && timerState === 'running';
}

export function buildStartPayload(durationMinutes: number, now: Date): TimerUpdatePayload {
  return {
    event_status: 'running',
    event_started_at: now.toISOString(),
    event_elapsed_seconds: 0,
    event_duration_minutes: durationMinutes,
  };
}

export function buildPausePayload(
  durationMinutes: number,
  elapsedSeconds: number,
  startedAt: string,
  now: Date,
): TimerUpdatePayload {
  const startedAtMs = new Date(startedAt).getTime();
  const newElapsed = elapsedSeconds + Math.floor((now.getTime() - startedAtMs) / 1000);
  return {
    event_status: 'paused',
    event_started_at: null,
    event_elapsed_seconds: newElapsed,
    event_duration_minutes: durationMinutes,
  };
}

export function buildResumePayload(
  durationMinutes: number,
  elapsedSeconds: number,
  now: Date,
): TimerUpdatePayload {
  return {
    event_status: 'running',
    event_started_at: now.toISOString(),
    event_elapsed_seconds: elapsedSeconds,
    event_duration_minutes: durationMinutes,
  };
}

export function buildResetPayload(): TimerUpdatePayload {
  return {
    event_status: 'idle',
    event_started_at: null,
    event_elapsed_seconds: 0,
    event_duration_minutes: 0,
  };
}

/**
 * State machine: returns true only for the six valid transitions.
 *
 * Valid transitions:
 *   idle    + start  → running  ✓
 *   running + pause  → paused   ✓
 *   running + reset  → idle     ✓
 *   paused  + resume → running  ✓
 *   paused  + reset  → idle     ✓
 *   ended   + reset  → idle     ✓
 */
export function isTransitionAllowed(from: TimerState, action: TimerAction): boolean {
  switch (from) {
    case 'idle':
      return action === 'start';
    case 'running':
      return action === 'pause' || action === 'reset';
    case 'paused':
      return action === 'resume' || action === 'reset';
    case 'finished':
      return action === 'reset';
    default:
      return false;
  }
}
