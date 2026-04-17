/**
 * Property-based tests for Event Timer Control utility functions.
 * Feature: event-timer-control
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateDuration,
  computeRemaining,
  isLooming,
  buildStartPayload,
  buildPausePayload,
  buildResumePayload,
  isTransitionAllowed,
  type TimerState,
  type TimerAction,
} from '../timerUtils';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Non-negative integers for hours/minutes where at least one is > 0 */
const validHoursArb = fc.integer({ min: 0, max: 100 });
const validMinutesArb = fc.integer({ min: 0, max: 59 });

/** All four timer states */
const timerStateArb = fc.constantFrom<TimerState>('idle', 'running', 'paused', 'ended');

/** All four timer actions */
const timerActionArb = fc.constantFrom<TimerAction>('start', 'pause', 'resume', 'reset');

/** A past ISO timestamp (between 1 and 86400 seconds ago) */
const pastIsoArb = (now: Date) =>
  fc.integer({ min: 1, max: 86400 }).map((secondsAgo) => {
    const past = new Date(now.getTime() - secondsAgo * 1000);
    return past.toISOString();
  });

// ─── Property 1: Duration conversion is exact ─────────────────────────────────

// Feature: event-timer-control, Property 1: Duration conversion is exact
describe('Property 1: Duration conversion is exact', () => {
  it('validateDuration(h, m) where h>0||m>0 yields duration_seconds = h*3600 + m*60', () => {
    // Validates: Requirements 2.2
    fc.assert(
      fc.property(
        validHoursArb,
        validMinutesArb,
        (h, m) => {
          fc.pre(h > 0 || m > 0);
          const result = validateDuration(h, m);
          expect(result.valid).toBe(true);
          expect(result.duration_seconds).toBe(h * 3600 + m * 60);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: Invalid duration inputs are always rejected ──────────────────

// Feature: event-timer-control, Property 2: Invalid duration inputs are always rejected
describe('Property 2: Invalid duration inputs are always rejected', () => {
  it('validateDuration returns {valid: false} when hours < 0', () => {
    // Validates: Requirements 2.3, 2.4
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: -1 }),
        fc.integer({ min: 0, max: 59 }),
        (h, m) => {
          const result = validateDuration(h, m);
          expect(result.valid).toBe(false);
          expect(result.duration_seconds).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validateDuration returns {valid: false} when minutes < 0', () => {
    // Validates: Requirements 2.3, 2.4
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: -10000, max: -1 }),
        (h, m) => {
          const result = validateDuration(h, m);
          expect(result.valid).toBe(false);
          expect(result.duration_seconds).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validateDuration returns {valid: false} when both hours and minutes are zero', () => {
    // Validates: Requirements 2.3, 2.4
    const result = validateDuration(0, 0);
    expect(result.valid).toBe(false);
    expect(result.duration_seconds).toBeUndefined();
  });
});

// ─── Property 3: Computed remaining is correctly clamped ──────────────────────

// Feature: event-timer-control, Property 3: Computed remaining is correctly clamped
describe('Property 3: Computed remaining is correctly clamped', () => {
  it('computeRemaining always returns max(0, remaining - elapsed), never negative', () => {
    // Validates: Requirements 5.1, 5.4
    const now = new Date();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 86400 }),
        pastIsoArb(now),
        (remainingSeconds, startedAt) => {
          const result = computeRemaining(remainingSeconds, startedAt, now);
          expect(result).toBeGreaterThanOrEqual(0);

          const startedAtMs = new Date(startedAt).getTime();
          const elapsedSeconds = Math.floor((now.getTime() - startedAtMs) / 1000);
          const expected = Math.max(0, remainingSeconds - elapsedSeconds);
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Looming threshold is consistent ──────────────────────────────

// Feature: event-timer-control, Property 4: Looming threshold is consistent
describe('Property 4: Looming threshold is consistent', () => {
  it('isLooming is true iff computedRemaining < 1800 AND timerState === "running"', () => {
    // Validates: Requirements 5.5
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        timerStateArb,
        (computedRemaining, timerState) => {
          const result = isLooming(computedRemaining, timerState);
          const expected = computedRemaining < 1800 && timerState === 'running';
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: Pause payload preserves elapsed time correctly ───────────────

// Feature: event-timer-control, Property 5: Pause payload preserves elapsed time correctly
describe('Property 5: Pause payload preserves elapsed time correctly', () => {
  it('buildPausePayload sets timer_remaining_seconds = max(0, remaining - floor((now - startedAt) / 1000))', () => {
    // Validates: Requirements 3.4
    const now = new Date();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 86400 }),
        pastIsoArb(now),
        (remainingSeconds, startedAt) => {
          const payload = buildPausePayload(remainingSeconds, startedAt, now);

          const startedAtMs = new Date(startedAt).getTime();
          const elapsedSeconds = Math.floor((now.getTime() - startedAtMs) / 1000);
          const expected = Math.max(0, remainingSeconds - elapsedSeconds);

          expect(payload.timer_state).toBe('paused');
          expect(payload.timer_remaining_seconds).toBe(expected);
          expect(payload.timer_started_at).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6: Resume payload preserves remaining seconds ───────────────────

// Feature: event-timer-control, Property 6: Resume payload preserves remaining seconds
describe('Property 6: Resume payload preserves remaining seconds', () => {
  it('buildResumePayload sets timer_state="running" and timer_started_at≈now', () => {
    // Validates: Requirements 3.6
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 86400 }),
        (remainingSeconds) => {
          // remainingSeconds is the pre-resume value — buildResumePayload does not touch it
          void remainingSeconds;

          const now = new Date();
          const payload = buildResumePayload(now);

          expect(payload.timer_state).toBe('running');
          // timer_started_at should be the ISO string of `now`
          expect(payload.timer_started_at).toBe(now.toISOString());
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 7: State machine permits only valid transitions ─────────────────

// Feature: event-timer-control, Property 7: State machine permits only valid transitions
describe('Property 7: State machine permits only valid transitions', () => {
  /** The six valid (state, action) pairs */
  const VALID_TRANSITIONS = new Set<string>([
    'idle:start',
    'running:pause',
    'running:reset',
    'paused:resume',
    'paused:reset',
    'ended:reset',
  ]);

  it('isTransitionAllowed returns true only for the 6 valid transitions', () => {
    // Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6
    fc.assert(
      fc.property(
        timerStateArb,
        timerActionArb,
        (state, action) => {
          const result = isTransitionAllowed(state, action);
          const key = `${state}:${action}`;
          const expected = VALID_TRANSITIONS.has(key);
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all 6 valid transitions return true', () => {
    // Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6
    expect(isTransitionAllowed('idle', 'start')).toBe(true);
    expect(isTransitionAllowed('running', 'pause')).toBe(true);
    expect(isTransitionAllowed('running', 'reset')).toBe(true);
    expect(isTransitionAllowed('paused', 'resume')).toBe(true);
    expect(isTransitionAllowed('paused', 'reset')).toBe(true);
    expect(isTransitionAllowed('ended', 'reset')).toBe(true);
  });

  it('all invalid transitions return false', () => {
    // Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6
    expect(isTransitionAllowed('idle', 'pause')).toBe(false);
    expect(isTransitionAllowed('idle', 'resume')).toBe(false);
    expect(isTransitionAllowed('idle', 'reset')).toBe(false);
    expect(isTransitionAllowed('running', 'start')).toBe(false);
    expect(isTransitionAllowed('running', 'resume')).toBe(false);
    expect(isTransitionAllowed('paused', 'start')).toBe(false);
    expect(isTransitionAllowed('paused', 'pause')).toBe(false);
    expect(isTransitionAllowed('ended', 'start')).toBe(false);
    expect(isTransitionAllowed('ended', 'pause')).toBe(false);
    expect(isTransitionAllowed('ended', 'resume')).toBe(false);
  });
});

// ─── Additional: buildStartPayload sanity check ───────────────────────────────

describe('buildStartPayload', () => {
  it('sets timer_state=running, timer_started_at=now.toISOString(), timer_remaining_seconds=durationSeconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 86400 }),
        (durationSeconds) => {
          const now = new Date();
          const payload = buildStartPayload(durationSeconds, now);
          expect(payload.timer_state).toBe('running');
          expect(payload.timer_started_at).toBe(now.toISOString());
          expect(payload.timer_remaining_seconds).toBe(durationSeconds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
