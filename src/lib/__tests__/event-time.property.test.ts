/**
 * Property-based tests for expedition timing validation and status enforcement.
 * Feature: fif-adventure, Property 21: Expedition Status Guards Operational Lifecycle
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isScoreValid } from '../auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpeditionStatus = 'idle' | 'running' | 'paused' | 'finished';

interface RegistrationRecord {
  id: string;
  team_id: string;
  activity_id: string;
  created_at: string;
}

interface ScoreLogRecord {
  id: string;
  team_id: string;
  activity_id: string;
  points_awarded: number;
  lo_id: string;
  created_at: string;
}

interface OperationResult {
  success: boolean;
  error?: string;
  status: number;
}

// ─── Pure models ──────────────────────────────────────────────────────────────

/**
 * Pure model of the status guard used in /api/lo/checkin and /api/lo/score.
 */
function isExpeditionAcceptingOperations(status: ExpeditionStatus): boolean {
  return status === 'running';
}

/**
 * Pure model of the check-in endpoint's status guard + registration insertion.
 */
function modelRegistrationOperation(
  status: ExpeditionStatus,
  now: Date,
  teamId: string,
  activityId: string,
  existingRegs: RegistrationRecord[],
): { result: OperationResult; newRegs: RegistrationRecord[] } {
  if (!isExpeditionAcceptingOperations(status)) {
    return {
      result: {
        success: false,
        error: 'Event sedang tidak berlangsung.',
        status: 403,
      },
      newRegs: existingRegs,
    };
  }

  // Check for duplicate registration
  const isDuplicate = existingRegs.some(
    (r) => r.team_id === teamId && r.activity_id === activityId,
  );
  if (isDuplicate) {
    return {
      result: {
        success: false,
        error: 'Tim sudah pernah mengunjungi aktivitas ini',
        status: 409,
      },
      newRegs: existingRegs,
    };
  }

  const newReg: RegistrationRecord = {
    id: `reg-${Date.now()}-${Math.random()}`,
    team_id: teamId,
    activity_id: activityId,
    created_at: now.toISOString(),
  };

  return {
    result: { success: true, status: 200 },
    newRegs: [...existingRegs, newReg],
  };
}

/**
 * Pure model of the score endpoint's status guard + score_log insertion.
 */
function modelScoreOperation(
  status: ExpeditionStatus,
  now: Date,
  teamId: string,
  activityId: string,
  points: number,
  maxPoints: number,
  loId: string,
  existingRegs: RegistrationRecord[],
  existingScoreLogs: ScoreLogRecord[],
): { result: OperationResult; newScoreLogs: ScoreLogRecord[] } {
  if (!isExpeditionAcceptingOperations(status)) {
    return {
      result: {
        success: false,
        error: 'Event sedang tidak berlangsung.',
        status: 403,
      },
      newScoreLogs: existingScoreLogs,
    };
  }

  // Validate score range
  if (!isScoreValid(points, maxPoints)) {
    return {
      result: {
        success: false,
        error: `Points must be between 0 and ${maxPoints}`,
        status: 422,
      },
      newScoreLogs: existingScoreLogs,
    };
  }

  // Check team has checked in
  const hasCheckedIn = existingRegs.some(
    (r) => r.team_id === teamId && r.activity_id === activityId,
  );
  if (!hasCheckedIn) {
    return {
      result: {
        success: false,
        error: 'Team has not checked in at this activity',
        status: 422,
      },
      newScoreLogs: existingScoreLogs,
    };
  }

  const newLog: ScoreLogRecord = {
    id: `log-${Date.now()}-${Math.random()}`,
    team_id: teamId,
    activity_id: activityId,
    points_awarded: points,
    lo_id: loId,
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

/** Arbitrary for a non-running status */
const nonRunningStatusArb = fc.constantFrom('idle', 'paused', 'finished' as ExpeditionStatus);

// ─── Property 21: Expedition Status Guards Operational Lifecycle ──────────────

describe('Property 21: Expedition Status Guards Operational Lifecycle', () => {
  it('registration is rejected when status is not "running"', () => {
    fc.assert(
      fc.property(
        nonRunningStatusArb,
        uuidArb,
        uuidArb,
        (status, teamId, activityId) => {
          const now = new Date(baseMs);
          const { result, newRegs } = modelRegistrationOperation(
            status,
            now,
            teamId,
            activityId,
            [],
          );
          expect(result.success).toBe(false);
          expect(result.status).toBe(403);
          expect(newRegs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('registration succeeds when status is "running"', () => {
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        (teamId, activityId) => {
          const now = new Date(baseMs);
          const { result, newRegs } = modelRegistrationOperation(
            'running',
            now,
            teamId,
            activityId,
            [],
          );
          expect(result.success).toBe(true);
          expect(result.status).toBe(200);
          expect(newRegs).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scoring is rejected when status is not "running"', () => {
    fc.assert(
      fc.property(
        nonRunningStatusArb,
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 1000 }),
        (status, teamId, activityId, maxPoints) => {
          const now = new Date(baseMs);
          const points = Math.floor(Math.random() * (maxPoints + 1));
          const regs: RegistrationRecord[] = [{
            id: 'reg-1', team_id: teamId, activity_id: activityId, created_at: now.toISOString(),
          }];

          const { result, newScoreLogs } = modelScoreOperation(
            status,
            now,
            teamId,
            activityId,
            points,
            maxPoints,
            'lo-1',
            regs,
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

  it('scoring succeeds when status is "running" and check-in exists', () => {
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 1000 }),
        (teamId, activityId, maxPoints) => {
          const now = new Date(baseMs);
          const points = Math.floor(Math.random() * (maxPoints + 1));
          const regs: RegistrationRecord[] = [{
            id: 'reg-1', team_id: teamId, activity_id: activityId, created_at: now.toISOString(),
          }];

          const { result, newScoreLogs } = modelScoreOperation(
            'running',
            now,
            teamId,
            activityId,
            points,
            maxPoints,
            'lo-1',
            regs,
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

  it('scoring is rejected if no check-in exists, even if status is "running"', () => {
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 1000 }),
        (teamId, activityId, maxPoints) => {
          const now = new Date(baseMs);
          const points = Math.floor(Math.random() * (maxPoints + 1));
          const { result, newScoreLogs } = modelScoreOperation(
            'running',
            now,
            teamId,
            activityId,
            points,
            maxPoints,
            'lo-1',
            [], // no regs
            [],
          );
          expect(result.success).toBe(false);
          expect(result.status).toBe(422);
          expect(newScoreLogs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
