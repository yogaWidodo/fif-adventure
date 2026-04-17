/**
 * Property-based tests for event time validation and expired-event enforcement.
 * Feature: fif-adventure
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isScoreValid, timeRemaining } from '../auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  is_active: boolean;
  end_time: string | null; // ISO 8601 string, or null if no end time set
}

interface ScanRecord {
  id: string;
  team_id: string;
  location_id: string;
  scanned_by: string;
  scanned_at: string;
  points_awarded: number;
}

interface ScoreLogRecord {
  id: string;
  team_id: string;
  location_id: string;
  score: number;
  lo_user_id: string;
  created_at: string;
}

interface OperationResult {
  success: boolean;
  error?: string;
  status: number;
}

// ─── Pure models ──────────────────────────────────────────────────────────────

/**
 * Pure model of the event-active guard used in /api/scan and /api/score.
 *
 * Mirrors the logic in both route handlers:
 *   const eventEnded = event.end_time ? new Date(event.end_time) <= now : false;
 *   if (!event.is_active || eventEnded) → 403
 */
function isEventAcceptingOperations(event: Event, now: Date): boolean {
  if (!event.is_active) return false;
  if (event.end_time !== null) {
    const endTime = new Date(event.end_time);
    if (endTime <= now) return false;
  }
  return true;
}

/**
 * Pure model of the scan endpoint's event guard + scan insertion.
 *
 * Returns the operation result and the (possibly unchanged) scans array.
 */
function modelScanOperation(
  event: Event,
  now: Date,
  teamId: string,
  locationId: string,
  scannedBy: string,
  points: number,
  existingScans: ScanRecord[],
): { result: OperationResult; newScans: ScanRecord[] } {
  if (!isEventAcceptingOperations(event, now)) {
    return {
      result: {
        success: false,
        error: 'Event tidak aktif atau sudah berakhir',
        status: 403,
      },
      newScans: existingScans,
    };
  }

  // Check for duplicate scan
  const isDuplicate = existingScans.some(
    (s) => s.team_id === teamId && s.location_id === locationId,
  );
  if (isDuplicate) {
    return {
      result: {
        success: false,
        error: 'Tim sudah pernah mengunjungi lokasi ini',
        status: 409,
      },
      newScans: existingScans,
    };
  }

  const newScan: ScanRecord = {
    id: `scan-${Date.now()}-${Math.random()}`,
    team_id: teamId,
    location_id: locationId,
    scanned_by: scannedBy,
    scanned_at: now.toISOString(),
    points_awarded: points,
  };

  return {
    result: { success: true, status: 200 },
    newScans: [...existingScans, newScan],
  };
}

/**
 * Pure model of the score endpoint's event guard + score_log insertion.
 *
 * Returns the operation result and the (possibly unchanged) score_logs array.
 */
function modelScoreOperation(
  event: Event,
  now: Date,
  teamId: string,
  locationId: string,
  score: number,
  maxPoints: number,
  loUserId: string,
  existingScans: ScanRecord[],
  existingScoreLogs: ScoreLogRecord[],
): { result: OperationResult; newScoreLogs: ScoreLogRecord[] } {
  if (!isEventAcceptingOperations(event, now)) {
    return {
      result: {
        success: false,
        error: 'Event tidak aktif atau sudah berakhir',
        status: 403,
      },
      newScoreLogs: existingScoreLogs,
    };
  }

  // Validate score range
  if (!isScoreValid(score, maxPoints)) {
    return {
      result: {
        success: false,
        error: `Score must be between 0 and ${maxPoints}`,
        status: 422,
      },
      newScoreLogs: existingScoreLogs,
    };
  }

  // Check team has checked in
  const hasCheckedIn = existingScans.some(
    (s) => s.team_id === teamId && s.location_id === locationId,
  );
  if (!hasCheckedIn) {
    return {
      result: {
        success: false,
        error: 'Team has not checked in at this location',
        status: 422,
      },
      newScoreLogs: existingScoreLogs,
    };
  }

  const newLog: ScoreLogRecord = {
    id: `log-${Date.now()}-${Math.random()}`,
    team_id: teamId,
    location_id: locationId,
    score,
    lo_user_id: loUserId,
    created_at: now.toISOString(),
  };

  return {
    result: { success: true, status: 200 },
    newScoreLogs: [...existingScoreLogs, newLog],
  };
}

// ─── Generators ───────────────────────────────────────────────────────────────

const uuidArb = fc.uuid();

const baseMs = Date.now();

/** Arbitrary for a past timestamp (event has ended) */
const pastEndTimeArb = fc
  .integer({ min: 1, max: 100_000_000 })
  .map((offset) => new Date(baseMs - offset).toISOString());

/** Arbitrary for a future timestamp (event is still running) */
const futureEndTimeArb = fc
  .integer({ min: 1_000, max: 100_000_000 })
  .map((offset) => new Date(baseMs + offset).toISOString());

/** Arbitrary for an expired event (end_time in the past, is_active may be true or false) */
const expiredEventArb = fc.record({
  id: uuidArb,
  is_active: fc.boolean(),
  end_time: pastEndTimeArb,
});

/** Arbitrary for an explicitly inactive event (is_active = false, end_time may be future) */
const inactiveEventArb = fc.record({
  id: uuidArb,
  is_active: fc.constant(false),
  end_time: fc.oneof(futureEndTimeArb, fc.constant(null)),
});

/** Arbitrary for an active, non-expired event */
const activeEventArb = fc.record({
  id: uuidArb,
  is_active: fc.constant(true),
  end_time: futureEndTimeArb,
});

/** Arbitrary for a location with max points */
const locationArb = fc.record({
  id: uuidArb,
  maxPoints: fc.integer({ min: 1, max: 1000 }),
});

// ─── Property 21: Expired Events Reject All Scan and Score Operations ─────────

// Feature: fif-adventure, Property 21: Expired Events Reject All Scan and Score Operations
describe('Property 21: Expired Events Reject All Scan and Score Operations', () => {
  // ── Scan operations ──────────────────────────────────────────────────────

  it('scan is rejected when event.end_time < now, regardless of is_active flag', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        expiredEventArb,
        uuidArb,
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 500 }),
        (event, teamId, locationId, scannedBy, points) => {
          const now = new Date(baseMs);

          const { result, newScans } = modelScanOperation(
            event,
            now,
            teamId,
            locationId,
            scannedBy,
            points,
            [],
          );

          expect(result.success).toBe(false);
          expect(result.status).toBe(403);
          // No scan record must be created
          expect(newScans).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scan is rejected when event.is_active = false, regardless of end_time', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        inactiveEventArb,
        uuidArb,
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 500 }),
        (event, teamId, locationId, scannedBy, points) => {
          const now = new Date(baseMs);

          const { result, newScans } = modelScanOperation(
            event,
            now,
            teamId,
            locationId,
            scannedBy,
            points,
            [],
          );

          expect(result.success).toBe(false);
          expect(result.status).toBe(403);
          expect(newScans).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scan succeeds when event is active and end_time is in the future', () => {
    // Validates: Requirements 9.3 (positive case — active event allows scans)
    fc.assert(
      fc.property(
        activeEventArb,
        uuidArb,
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 500 }),
        (event, teamId, locationId, scannedBy, points) => {
          const now = new Date(baseMs);

          const { result, newScans } = modelScanOperation(
            event,
            now,
            teamId,
            locationId,
            scannedBy,
            points,
            [],
          );

          expect(result.success).toBe(true);
          expect(result.status).toBe(200);
          expect(newScans).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no scan record is created when event has expired, even with pre-existing scans', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        expiredEventArb,
        uuidArb,
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 500 }),
        fc.array(
          fc.record({
            id: uuidArb,
            team_id: uuidArb,
            location_id: uuidArb,
            scanned_by: uuidArb,
            scanned_at: fc.constant(new Date(baseMs - 1000).toISOString()),
            points_awarded: fc.integer({ min: 0, max: 500 }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (event, teamId, locationId, scannedBy, points, existingScans) => {
          const now = new Date(baseMs);
          const countBefore = existingScans.length;

          const { newScans } = modelScanOperation(
            event,
            now,
            teamId,
            locationId,
            scannedBy,
            points,
            existingScans,
          );

          // Scan count must not have grown
          expect(newScans).toHaveLength(countBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Score operations ─────────────────────────────────────────────────────

  it('score input is rejected when event.end_time < now, regardless of is_active flag', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        expiredEventArb,
        locationArb,
        uuidArb,
        uuidArb,
        (event, location, teamId, loUserId) => {
          const now = new Date(baseMs);
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          // Team has checked in
          const scans: ScanRecord[] = [
            {
              id: 'scan-1',
              team_id: teamId,
              location_id: location.id,
              scanned_by: teamId,
              scanned_at: new Date(baseMs - 5000).toISOString(),
              points_awarded: location.maxPoints,
            },
          ];

          const { result, newScoreLogs } = modelScoreOperation(
            event,
            now,
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
          );

          expect(result.success).toBe(false);
          expect(result.status).toBe(403);
          expect(newScoreLogs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('score input is rejected when event.is_active = false, regardless of end_time', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        inactiveEventArb,
        locationArb,
        uuidArb,
        uuidArb,
        (event, location, teamId, loUserId) => {
          const now = new Date(baseMs);
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          const scans: ScanRecord[] = [
            {
              id: 'scan-1',
              team_id: teamId,
              location_id: location.id,
              scanned_by: teamId,
              scanned_at: new Date(baseMs - 5000).toISOString(),
              points_awarded: location.maxPoints,
            },
          ];

          const { result, newScoreLogs } = modelScoreOperation(
            event,
            now,
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
          );

          expect(result.success).toBe(false);
          expect(result.status).toBe(403);
          expect(newScoreLogs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('score input succeeds when event is active and end_time is in the future', () => {
    // Validates: Requirements 9.3 (positive case)
    fc.assert(
      fc.property(
        activeEventArb,
        locationArb,
        uuidArb,
        uuidArb,
        (event, location, teamId, loUserId) => {
          const now = new Date(baseMs);
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          const scans: ScanRecord[] = [
            {
              id: 'scan-1',
              team_id: teamId,
              location_id: location.id,
              scanned_by: teamId,
              scanned_at: new Date(baseMs - 5000).toISOString(),
              points_awarded: location.maxPoints,
            },
          ];

          const { result, newScoreLogs } = modelScoreOperation(
            event,
            now,
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
          );

          expect(result.success).toBe(true);
          expect(result.status).toBe(200);
          expect(newScoreLogs).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no score_log record is created when event has expired, even with pre-existing logs', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        expiredEventArb,
        locationArb,
        uuidArb,
        uuidArb,
        fc.array(
          fc.record({
            id: uuidArb,
            team_id: uuidArb,
            location_id: uuidArb,
            score: fc.integer({ min: 0, max: 500 }),
            lo_user_id: uuidArb,
            created_at: fc.constant(new Date(baseMs - 1000).toISOString()),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (event, location, teamId, loUserId, existingLogs) => {
          const now = new Date(baseMs);
          const score = Math.floor(Math.random() * (location.maxPoints + 1));
          const countBefore = existingLogs.length;

          const scans: ScanRecord[] = [
            {
              id: 'scan-1',
              team_id: teamId,
              location_id: location.id,
              scanned_by: teamId,
              scanned_at: new Date(baseMs - 5000).toISOString(),
              points_awarded: location.maxPoints,
            },
          ];

          const { newScoreLogs } = modelScoreOperation(
            event,
            now,
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            existingLogs,
          );

          // Score log count must not have grown
          expect(newScoreLogs).toHaveLength(countBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── isEventAcceptingOperations invariants ────────────────────────────────

  it('isEventAcceptingOperations returns false for any event where end_time <= now', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        fc.boolean(), // is_active can be anything
        fc.integer({ min: 0, max: 100_000_000 }),
        (isActive, pastOffset) => {
          const now = new Date(baseMs);
          const endTime = new Date(baseMs - pastOffset); // at or before now

          const event: Event = {
            id: 'evt-1',
            is_active: isActive,
            end_time: endTime.toISOString(),
          };

          expect(isEventAcceptingOperations(event, now)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isEventAcceptingOperations returns false for any event where is_active = false', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        fc.oneof(futureEndTimeArb, fc.constant(null)),
        (endTime) => {
          const now = new Date(baseMs);
          const event: Event = {
            id: 'evt-1',
            is_active: false,
            end_time: endTime,
          };

          expect(isEventAcceptingOperations(event, now)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isEventAcceptingOperations returns true only when is_active = true AND end_time > now', () => {
    // Validates: Requirements 9.3
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 100_000_000 }),
        (futureOffset) => {
          const now = new Date(baseMs);
          const endTime = new Date(baseMs + futureOffset);

          const event: Event = {
            id: 'evt-1',
            is_active: true,
            end_time: endTime.toISOString(),
          };

          expect(isEventAcceptingOperations(event, now)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── timeRemaining integration ────────────────────────────────────────────

  it('timeRemaining returns 0 for any expired event end_time', () => {
    // Validates: Requirements 9.2, 9.3 — timer shows 0 when event has ended
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        (pastOffset) => {
          const now = new Date(baseMs);
          const endTime = new Date(baseMs - pastOffset);
          expect(timeRemaining(endTime, now)).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('timeRemaining returns 0 when there is no active event (undefined end_time)', () => {
    // Validates: Requirements 9.2, 12.2 — timer shows 0 when no active event
    // When end_time is null/undefined, the timer component defaults to { h:0, m:0, s:0 }
    // This test verifies the timeRemaining function returns 0 for a past/zero time
    const now = new Date(baseMs);
    // Simulate "no event" by using a past time (epoch)
    const noEventTime = new Date(0);
    expect(timeRemaining(noEventTime, now)).toBe(0);
  });
});
