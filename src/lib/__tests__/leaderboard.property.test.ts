/**
 * Property-based tests for leaderboard sorting logic.
 * Feature: fif-adventure
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Pure model of the leaderboard endpoint ───────────────────────────────────
//
// The /api/leaderboard route handler queries teams ordered by total_points DESC
// and assigns a 1-based rank. This model mirrors that logic so we can test the
// sorting invariant without a live database.

interface TeamRow {
  id: string;
  name: string;
  total_points: number;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  total_points: number;
  rank: number;
}

/**
 * Pure model of the leaderboard query + rank assignment.
 * Mirrors the logic in src/app/api/leaderboard/route.ts:
 *   ORDER BY total_points DESC → assign rank = index + 1
 */
function modelBuildLeaderboard(teams: TeamRow[]): LeaderboardEntry[] {
  const sorted = [...teams].sort((a, b) => b.total_points - a.total_points);
  return sorted.map((team, index) => ({
    id: team.id,
    name: team.name,
    total_points: team.total_points,
    rank: index + 1,
  }));
}

// ─── Generators ───────────────────────────────────────────────────────────────

const uuidArb = fc.uuid();

/** Arbitrary for a single team row */
const teamRowArb = fc.record({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  total_points: fc.integer({ min: 0, max: 100_000 }),
});

/** Arbitrary for a non-empty list of teams with distinct IDs */
const teamsArb = fc
  .array(teamRowArb, { minLength: 1, maxLength: 40 })
  .map((teams) => {
    // Deduplicate by id to avoid ambiguous ordering tests
    const seen = new Set<string>();
    return teams.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  })
  .filter((teams) => teams.length >= 1);

// ─── Property 19: Leaderboard Is Always Sorted Descending by Total Points ─────

// Feature: fif-adventure, Property 19: Leaderboard Is Always Sorted Descending by Total Points
describe('Property 19: Leaderboard Is Always Sorted Descending by Total Points', () => {
  it('every adjacent pair in the leaderboard satisfies entry[i].total_points >= entry[i+1].total_points', () => {
    // Validates: Requirements 8.1
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const leaderboard = modelBuildLeaderboard(teams);

        for (let i = 0; i < leaderboard.length - 1; i++) {
          expect(leaderboard[i].total_points).toBeGreaterThanOrEqual(
            leaderboard[i + 1].total_points,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rank values are consecutive integers starting at 1', () => {
    // Validates: Requirements 8.1
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const leaderboard = modelBuildLeaderboard(teams);

        leaderboard.forEach((entry, index) => {
          expect(entry.rank).toBe(index + 1);
        });
      }),
      { numRuns: 100 },
    );
  });

  it('the leaderboard contains exactly the same number of entries as input teams', () => {
    // Validates: Requirements 8.1
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const leaderboard = modelBuildLeaderboard(teams);
        expect(leaderboard).toHaveLength(teams.length);
      }),
      { numRuns: 100 },
    );
  });

  it('no team is missing from the leaderboard — all input team IDs appear in the output', () => {
    // Validates: Requirements 8.1
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const leaderboard = modelBuildLeaderboard(teams);
        const outputIds = new Set(leaderboard.map((e) => e.id));

        for (const team of teams) {
          expect(outputIds.has(team.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('the team with the highest total_points always has rank 1', () => {
    // Validates: Requirements 8.1
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const maxPoints = Math.max(...teams.map((t) => t.total_points));
        const leaderboard = modelBuildLeaderboard(teams);

        // The first entry must have the maximum points
        expect(leaderboard[0].total_points).toBe(maxPoints);
        expect(leaderboard[0].rank).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it('the team with the lowest total_points always has the last rank', () => {
    // Validates: Requirements 8.1
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const minPoints = Math.min(...teams.map((t) => t.total_points));
        const leaderboard = modelBuildLeaderboard(teams);
        const last = leaderboard[leaderboard.length - 1];

        expect(last.total_points).toBe(minPoints);
        expect(last.rank).toBe(leaderboard.length);
      }),
      { numRuns: 100 },
    );
  });

  it('total_points values in the leaderboard are unchanged from the input', () => {
    // Validates: Requirements 8.1 — sorting must not mutate point values
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const leaderboard = modelBuildLeaderboard(teams);
        const inputPointsById = new Map(teams.map((t) => [t.id, t.total_points]));

        for (const entry of leaderboard) {
          expect(entry.total_points).toBe(inputPointsById.get(entry.id));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a single-team leaderboard always has rank 1', () => {
    // Validates: Requirements 8.1 — edge case
    fc.assert(
      fc.property(teamRowArb, (team) => {
        const leaderboard = modelBuildLeaderboard([team]);
        expect(leaderboard).toHaveLength(1);
        expect(leaderboard[0].rank).toBe(1);
        expect(leaderboard[0].id).toBe(team.id);
        expect(leaderboard[0].total_points).toBe(team.total_points);
      }),
      { numRuns: 100 },
    );
  });

  it('teams with equal total_points both appear in the leaderboard with consecutive ranks', () => {
    // Validates: Requirements 8.1 — tie handling
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        fc.integer({ min: 0, max: 10_000 }),
        (id1, id2, points) => {
          fc.pre(id1 !== id2);

          const teams: TeamRow[] = [
            { id: id1, name: 'Team A', total_points: points },
            { id: id2, name: 'Team B', total_points: points },
          ];

          const leaderboard = modelBuildLeaderboard(teams);

          expect(leaderboard).toHaveLength(2);
          // Both entries must have the same points
          expect(leaderboard[0].total_points).toBe(points);
          expect(leaderboard[1].total_points).toBe(points);
          // Ranks must be 1 and 2
          const ranks = leaderboard.map((e) => e.rank).sort((a, b) => a - b);
          expect(ranks).toEqual([1, 2]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('leaderboard output contains all required fields: id, name, total_points, rank', () => {
    // Validates: Requirements 8.1, 8.5
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const leaderboard = modelBuildLeaderboard(teams);

        for (const entry of leaderboard) {
          expect(typeof entry.id).toBe('string');
          expect(entry.id.length).toBeGreaterThan(0);
          expect(typeof entry.name).toBe('string');
          expect(entry.name.length).toBeGreaterThan(0);
          expect(typeof entry.total_points).toBe('number');
          expect(Number.isFinite(entry.total_points)).toBe(true);
          expect(typeof entry.rank).toBe('number');
          expect(entry.rank).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
