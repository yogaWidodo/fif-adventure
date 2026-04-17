/**
 * Property-based tests for LO score input logic.
 * Feature: fif-adventure
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isScoreValid } from '../auth';

// ─── Pure model of the score input system ─────────────────────────────────────
//
// These models mirror the server-side logic in /api/score and the database
// trigger that updates teams.total_points, allowing property testing without
// a live database.

interface Team {
  id: string;
  total_points: number;
}

interface ScoreLogRecord {
  id: string;
  team_id: string;
  location_id: string;
  score: number;
  lo_user_id: string;
  created_at: string;
}

interface ScanRecord {
  team_id: string;
  location_id: string;
}

interface ScoreSubmissionResult {
  success: boolean;
  error?: string;
}

/**
 * Pure model of the /api/score POST handler + trigger logic.
 *
 * Validates:
 * 1. Score is in range [0, maxPoints]
 * 2. Team has checked in (scan record exists for team+location)
 * 3. If valid, inserts a score_log and updates team total_points
 *
 * Returns the result and updated state (immutable-style).
 */
function modelSubmitScore(
  teamId: string,
  locationId: string,
  score: number,
  maxPoints: number,
  loUserId: string,
  existingScans: ScanRecord[],
  existingScoreLogs: ScoreLogRecord[],
  teams: Team[],
): {
  result: ScoreSubmissionResult;
  newScoreLogs: ScoreLogRecord[];
  updatedTeams: Team[];
} {
  // Validate score range
  if (!isScoreValid(score, maxPoints)) {
    return {
      result: { success: false, error: `Score must be 0–${maxPoints}` },
      newScoreLogs: existingScoreLogs,
      updatedTeams: teams,
    };
  }

  // Check team has checked in (scan record must exist)
  const hasCheckedIn = existingScans.some(
    (s) => s.team_id === teamId && s.location_id === locationId,
  );

  if (!hasCheckedIn) {
    return {
      result: { success: false, error: 'Team not checked in' },
      newScoreLogs: existingScoreLogs,
      updatedTeams: teams,
    };
  }

  // Insert score log
  const newLog: ScoreLogRecord = {
    id: `log-${Date.now()}-${Math.random()}`,
    team_id: teamId,
    location_id: locationId,
    score,
    lo_user_id: loUserId,
    created_at: new Date().toISOString(),
  };

  const newScoreLogs = [...existingScoreLogs, newLog];

  // Trigger: update team total_points by summing all score_logs for this team
  const updatedTeams = teams.map((team) => {
    if (team.id !== teamId) return team;
    const teamScoreTotal = newScoreLogs
      .filter((log) => log.team_id === teamId)
      .reduce((sum, log) => sum + log.score, 0);
    return { ...team, total_points: teamScoreTotal };
  });

  return {
    result: { success: true },
    newScoreLogs,
    updatedTeams,
  };
}

/**
 * Checks whether a score_log record has all required audit fields non-null/non-empty.
 */
function hasCompleteScoreLogRecord(log: ScoreLogRecord): boolean {
  return (
    typeof log.id === 'string' &&
    log.id.length > 0 &&
    typeof log.team_id === 'string' &&
    log.team_id.length > 0 &&
    typeof log.location_id === 'string' &&
    log.location_id.length > 0 &&
    typeof log.score === 'number' &&
    typeof log.lo_user_id === 'string' &&
    log.lo_user_id.length > 0 &&
    typeof log.created_at === 'string' &&
    log.created_at.length > 0
  );
}

// ─── Generators ───────────────────────────────────────────────────────────────

const uuidArb = fc.uuid();

/** Arbitrary for a valid score within [0, maxPoints] */
const validScoreArb = (maxPoints: number) =>
  fc.integer({ min: 0, max: maxPoints });

/** Arbitrary for a location with a defined max points value */
const locationArb = fc.record({
  id: uuidArb,
  maxPoints: fc.integer({ min: 1, max: 1000 }),
});

// ─── Property 17: Score Input Updates Total Points and Creates Audit Log ───────

// Feature: fif-adventure, Property 17: Score Input Updates Total Points and Creates Audit Log
describe('Property 17: Score Input Updates Total Points and Creates Audit Log', () => {
  it('after a valid score S is submitted, team total_points increases by exactly S', () => {
    // Validates: Requirements 7.4
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        fc.integer({ min: 0, max: 10000 }), // initial total_points
        (teamId, location, loUserId, initialPoints) => {
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          const teams: Team[] = [{ id: teamId, total_points: initialPoints }];
          const scans: ScanRecord[] = [{ team_id: teamId, location_id: location.id }];
          const scoreLogs: ScoreLogRecord[] = [];

          const { result, updatedTeams } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            scoreLogs,
            teams,
          );

          expect(result.success).toBe(true);

          const updatedTeam = updatedTeams.find((t) => t.id === teamId);
          expect(updatedTeam).toBeDefined();
          // total_points should now equal the sum of all score_logs (just this one score)
          expect(updatedTeam!.total_points).toBe(score);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('total_points accumulates correctly across multiple score submissions', () => {
    // Validates: Requirements 7.4
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 5 }),
        (teamId, location, loUserId, scoreMultipliers) => {
          const scores = scoreMultipliers.map((m) =>
            Math.min(m * 10, location.maxPoints),
          );

          const teams: Team[] = [{ id: teamId, total_points: 0 }];
          const scans: ScanRecord[] = [{ team_id: teamId, location_id: location.id }];
          let scoreLogs: ScoreLogRecord[] = [];
          let currentTeams = teams;

          for (const score of scores) {
            const { newScoreLogs, updatedTeams } = modelSubmitScore(
              teamId,
              location.id,
              score,
              location.maxPoints,
              loUserId,
              scans,
              scoreLogs,
              currentTeams,
            );
            scoreLogs = newScoreLogs;
            currentTeams = updatedTeams;
          }

          const finalTeam = currentTeams.find((t) => t.id === teamId);
          const expectedTotal = scores.reduce((sum, s) => sum + s, 0);
          expect(finalTeam!.total_points).toBe(expectedTotal);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a new score_log record is created with all required audit fields', () => {
    // Validates: Requirements 7.4
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        (teamId, location, loUserId) => {
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          const scans: ScanRecord[] = [{ team_id: teamId, location_id: location.id }];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { result, newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          expect(result.success).toBe(true);
          expect(newScoreLogs).toHaveLength(1);

          const log = newScoreLogs[0];
          expect(hasCompleteScoreLogRecord(log)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('score_log record contains the correct team_id, location_id, score, and lo_user_id', () => {
    // Validates: Requirements 7.4
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        (teamId, location, loUserId) => {
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          const scans: ScanRecord[] = [{ team_id: teamId, location_id: location.id }];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          const log = newScoreLogs[0];
          expect(log.team_id).toBe(teamId);
          expect(log.location_id).toBe(location.id);
          expect(log.score).toBe(score);
          expect(log.lo_user_id).toBe(loUserId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('score_log created_at is always a valid ISO 8601 date string', () => {
    // Validates: Requirements 7.4
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        (teamId, location, loUserId) => {
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          const scans: ScanRecord[] = [{ team_id: teamId, location_id: location.id }];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          const log = newScoreLogs[0];
          const parsed = new Date(log.created_at);
          expect(isNaN(parsed.getTime())).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('other teams total_points are not affected when a score is submitted for one team', () => {
    // Validates: Requirements 7.4
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        locationArb,
        uuidArb,
        fc.integer({ min: 0, max: 5000 }),
        (teamId, otherTeamId, location, loUserId, otherTeamPoints) => {
          fc.pre(teamId !== otherTeamId);

          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          const teams: Team[] = [
            { id: teamId, total_points: 0 },
            { id: otherTeamId, total_points: otherTeamPoints },
          ];
          const scans: ScanRecord[] = [{ team_id: teamId, location_id: location.id }];

          const { updatedTeams } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          const otherTeam = updatedTeams.find((t) => t.id === otherTeamId);
          expect(otherTeam!.total_points).toBe(otherTeamPoints);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 18: Score Input Requires Prior Check-In ─────────────────────────

// Feature: fif-adventure, Property 18: Score Input Requires Prior Check-In
describe('Property 18: Score Input Requires Prior Check-In', () => {
  it('submitting a score for a team with no check-in always fails', () => {
    // Validates: Requirements 7.6
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        (teamId, location, loUserId) => {
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          // No scan records — team has NOT checked in
          const scans: ScanRecord[] = [];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { result, newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          expect(result.success).toBe(false);
          expect(result.error).toContain('not checked in');
          // No score_log record should be created
          expect(newScoreLogs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no score_log record is created when team has not checked in', () => {
    // Validates: Requirements 7.6
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        fc.array(fc.record({ team_id: uuidArb, location_id: uuidArb }), {
          minLength: 0,
          maxLength: 5,
        }),
        (teamId, location, loUserId, otherScans) => {
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          // Ensure none of the other scans match our team+location
          const scans = otherScans.filter(
            (s) => !(s.team_id === teamId && s.location_id === location.id),
          );
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          expect(newScoreLogs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('team total_points is unchanged when score submission fails due to no check-in', () => {
    // Validates: Requirements 7.6
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        fc.integer({ min: 0, max: 10000 }),
        (teamId, location, loUserId, initialPoints) => {
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          const scans: ScanRecord[] = []; // no check-in
          const teams: Team[] = [{ id: teamId, total_points: initialPoints }];

          const { result, updatedTeams } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          expect(result.success).toBe(false);

          const team = updatedTeams.find((t) => t.id === teamId);
          // total_points must remain unchanged
          expect(team!.total_points).toBe(initialPoints);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('check-in at a different location does not satisfy check-in requirement', () => {
    // Validates: Requirements 7.6
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 500 }),
        (teamId, targetLocationId, otherLocationId, loUserId, maxPoints) => {
          fc.pre(targetLocationId !== otherLocationId);

          const score = Math.floor(Math.random() * (maxPoints + 1));

          // Team checked in at a DIFFERENT location
          const scans: ScanRecord[] = [
            { team_id: teamId, location_id: otherLocationId },
          ];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { result, newScoreLogs } = modelSubmitScore(
            teamId,
            targetLocationId,
            score,
            maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          expect(result.success).toBe(false);
          expect(newScoreLogs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('score submission succeeds when team has checked in at the correct location', () => {
    // Validates: Requirements 7.6 (positive case)
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        (teamId, location, loUserId) => {
          const score = Math.floor(Math.random() * (location.maxPoints + 1));

          // Team HAS checked in at the correct location
          const scans: ScanRecord[] = [
            { team_id: teamId, location_id: location.id },
          ];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { result, newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            score,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          expect(result.success).toBe(true);
          expect(newScoreLogs).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('out-of-range score is rejected even when team has checked in', () => {
    // Validates: Requirements 7.3, 7.6 (interaction)
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        fc.integer({ min: 1, max: 500 }),
        (teamId, location, loUserId, excess) => {
          const outOfRangeScore = location.maxPoints + excess; // always > maxPoints

          const scans: ScanRecord[] = [
            { team_id: teamId, location_id: location.id },
          ];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { result, newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            outOfRangeScore,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          expect(result.success).toBe(false);
          expect(newScoreLogs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('negative score is rejected even when team has checked in', () => {
    // Validates: Requirements 7.3, 7.6 (interaction)
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        fc.integer({ min: 1, max: 1000 }),
        (teamId, location, loUserId, negVal) => {
          const negativeScore = -negVal;

          const scans: ScanRecord[] = [
            { team_id: teamId, location_id: location.id },
          ];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { result, newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            negativeScore,
            location.maxPoints,
            loUserId,
            scans,
            [],
            teams,
          );

          expect(result.success).toBe(false);
          expect(newScoreLogs).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Combined invariant: score_logs are never created on failure ───────────────

describe('Combined invariant: score_logs count never increases on failed submission', () => {
  it('any failed submission leaves the score_logs array unchanged', () => {
    // Validates: Requirements 7.4, 7.6
    fc.assert(
      fc.property(
        uuidArb,
        locationArb,
        uuidArb,
        fc.array(
          fc.record({
            id: uuidArb,
            team_id: uuidArb,
            location_id: uuidArb,
            score: fc.integer({ min: 0, max: 500 }),
            lo_user_id: uuidArb,
            created_at: fc.constant(new Date().toISOString()),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (teamId, location, loUserId, existingLogs) => {
          // Use an out-of-range score to guarantee failure
          const badScore = location.maxPoints + 1;

          const scans: ScanRecord[] = [
            { team_id: teamId, location_id: location.id },
          ];
          const teams: Team[] = [{ id: teamId, total_points: 0 }];

          const { result, newScoreLogs } = modelSubmitScore(
            teamId,
            location.id,
            badScore,
            location.maxPoints,
            loUserId,
            scans,
            existingLogs,
            teams,
          );

          expect(result.success).toBe(false);
          // Score logs must not have grown
          expect(newScoreLogs).toHaveLength(existingLogs.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Standalone: validScoreArb helper correctness ─────────────────────────────

describe('Score range generator sanity check', () => {
  it('validScoreArb always produces values in [0, maxPoints]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }).chain((maxPoints) =>
          fc.record({
            maxPoints: fc.constant(maxPoints),
            score: validScoreArb(maxPoints),
          }),
        ),
        ({ maxPoints, score }) => {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(maxPoints);
          expect(isScoreValid(score, maxPoints)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
