/**
 * Pure timer utility functions for Event Timer Control.
 * No DOM, no Supabase — all functions are side-effect-free and directly testable.
 */

export type TimerState = 'idle' | 'running' | 'paused' | 'ended';
export type TimerAction = 'start' | 'pause' | 'resume' | 'reset';

export interface TimerUpdatePayload {
  timer_state: TimerState;
  timer_started_at: string | null;
  timer_remaining_seconds: number | null;
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
 *
 * @param remainingSeconds  The stored remaining seconds at the last start/resume.
 * @param startedAt         ISO 8601 string of when the timer was last started/resumed.
 * @param now               The current time.
 */
export function computeRemaining(
  remainingSeconds: number,
  startedAt: string,
  now: Date,
): number {
  const startedAtMs = new Date(startedAt).getTime();
  const elapsedSeconds = Math.floor((now.getTime() - startedAtMs) / 1000);
  return Math.max(0, remainingSeconds - elapsedSeconds);
}

/**
 * Returns true when the timer is in the "looming" state:
 * less than 30 minutes remaining AND the timer is running.
 */
export function isLooming(computedRemaining: number, timerState: TimerState): boolean {
  return computedRemaining < 1800 && timerState === 'running';
}

/**
 * Build the DB payload for the Start action.
 * Sets timer_state = 'running', timer_started_at = now, timer_remaining_seconds = durationSeconds.
 */
export function buildStartPayload(durationSeconds: number, now: Date): TimerUpdatePayload {
  return {
    timer_state: 'running',
    timer_started_at: now.toISOString(),
    timer_remaining_seconds: durationSeconds,
  };
}

/**
 * Build the DB payload for the Pause action.
 * Computes the new remaining seconds (clamped to 0) and sets timer_state = 'paused'.
 */
export function buildPausePayload(
  remainingSeconds: number,
  startedAt: string,
  now: Date,
): TimerUpdatePayload {
  return {
    timer_state: 'paused',
    timer_started_at: null,
    timer_remaining_seconds: computeRemaining(remainingSeconds, startedAt, now),
  };
}

/**
 * Build the DB payload for the Resume action.
 * Preserves timer_remaining_seconds (caller must supply it separately if needed).
 * Sets timer_state = 'running' and timer_started_at = now.
 */
export function buildResumePayload(now: Date): Pick<TimerUpdatePayload, 'timer_state' | 'timer_started_at'> {
  return {
    timer_state: 'running',
    timer_started_at: now.toISOString(),
  };
}

/**
 * Build the DB payload for the Reset action.
 * Clears all timer fields and returns to idle.
 */
export function buildResetPayload(): TimerUpdatePayload {
  return {
    timer_state: 'idle',
    timer_started_at: null,
    timer_remaining_seconds: null,
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
    case 'ended':
      return action === 'reset';
    default:
      return false;
  }
}
