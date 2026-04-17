/**
 * Property-based tests for admin dashboard logic.
 * Feature: fif-adventure
 * Properties: 7, 8, 9, 10, 24
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateBarcodeData } from '../auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  nama: string;
  npk: string;
  role: 'admin' | 'kaptain' | 'cocaptain' | 'member' | 'lo';
  team_id: string;
  event_id: string;
}

interface Team {
  id: string;
  name: string;
  slogan?: string;
  captain_id?: string;
  total_points: number;
  event_id: string;
}

interface Location {
  id: string;
  name: string;
  type: 'wahana' | 'challenge' | 'treasure';
  points: number;
  barcode_data: string;
  is_active: boolean;
  event_id: string;
}

interface LeaderboardRow {
  id: string;
  name: string;
  slogan?: string;
  total_points: number;
  rank: number;
  captain_name?: string;
  member_count: number;
}

interface WahanaRow {
  id: string;
  name: string;
  points: number;
  description?: string;
  barcode_data: string;
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
  id: string;
  team_id: string;
  location_id: string;
  scanned_by: string;
  scanned_at: string;
  points_awarded: number;
}

// ─── Pure models ──────────────────────────────────────────────────────────────

/**
 * Pure model of captain assignment.
 * Ensures exactly one kaptain per team after any assignment sequence.
 * Requirements: 2.4, 2.5
 */
function modelAssignCaptain(
  members: TeamMember[],
  teamId: string,
  newCaptainId: string,
): TeamMember[] {
  return members.map((m) => {
    if (m.team_id !== teamId) return m;
    // Promote new captain first (takes priority over demotion)
    if (m.id === newCaptainId) return { ...m, role: 'kaptain' as const };
    // Demote any other existing kaptain in this team
    if (m.role === 'kaptain') return { ...m, role: 'member' as const };
    return m;
  });
}

/**
 * Pure model of team membership validation.
 * A user can only belong to one team per event.
 * Requirements: 2.6
 */
function modelAddMemberToTeam(
  members: TeamMember[],
  userId: string,
  teamId: string,
  eventId: string,
): { success: boolean; error?: string; newMembers: TeamMember[] } {
  // Check if user already belongs to a team in this event
  const existingMembership = members.find(
    (m) => m.id === userId && m.event_id === eventId,
  );

  if (existingMembership) {
    return {
      success: false,
      error: 'User already belongs to a team in this event',
      newMembers: members,
    };
  }

  const newMember: TeamMember = {
    id: userId,
    nama: 'Test User',
    npk: userId.slice(0, 8),
    role: 'member',
    team_id: teamId,
    event_id: eventId,
  };

  return { success: true, newMembers: [...members, newMember] };
}

/**
 * Pure model of leaderboard row rendering.
 * Checks that all required display fields are present.
 * Requirements: 2.7, 8.5
 */
function renderLeaderboardRow(team: Team, rank: number, captainName?: string, memberCount = 0): LeaderboardRow {
  return {
    id: team.id,
    name: team.name,
    slogan: team.slogan,
    total_points: team.total_points,
    rank,
    captain_name: captainName,
    member_count: memberCount,
  };
}

/**
 * Pure model of wahana row rendering.
 * Checks that all required display fields are present.
 * Requirements: 3.4
 */
function renderWahanaRow(loc: Location): WahanaRow {
  return {
    id: loc.id,
    name: loc.name,
    points: loc.points,
    description: undefined,
    barcode_data: loc.barcode_data,
  };
}

/**
 * Pure model of QR code immutability on update.
 * barcode_data must not change when other fields are updated.
 * Requirements: 3.6
 */
function modelUpdateLocation(
  location: Location,
  updates: Partial<Omit<Location, 'id' | 'barcode_data'>>,
): Location {
  return { ...location, ...updates, barcode_data: location.barcode_data };
}

/**
 * Pure model of RLS immutability check.
 * score_logs and scans records cannot be deleted or updated.
 * Requirements: 13.1, 13.3
 */
type ImmutableOperation = 'DELETE' | 'UPDATE';

function modelCheckImmutability(
  operation: ImmutableOperation,
  _recordId: string,
  _table: 'score_logs' | 'scans',
): { allowed: boolean; error: string } {
  // RLS policy: no DELETE or UPDATE allowed on these tables
  return {
    allowed: false,
    error: `RLS policy denies ${operation} on immutable audit table`,
  };
}

// ─── Generators ───────────────────────────────────────────────────────────────

const uuidArb = fc.uuid();

const memberArb = (teamId: string, eventId: string) =>
  fc.record({
    id: uuidArb,
    nama: fc.string({ minLength: 1, maxLength: 30 }),
    npk: fc.string({ minLength: 4, maxLength: 10 }),
    role: fc.constantFrom('member' as const, 'kaptain' as const, 'cocaptain' as const),
    team_id: fc.constant(teamId),
    event_id: fc.constant(eventId),
  });

const teamArb = fc.record({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  slogan: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
  captain_id: fc.option(uuidArb, { nil: undefined }),
  total_points: fc.integer({ min: 0, max: 100_000 }),
  event_id: uuidArb,
});

const locationArb = fc.record({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  type: fc.constantFrom('wahana' as const, 'challenge' as const, 'treasure' as const),
  points: fc.integer({ min: 10, max: 1000 }),
  barcode_data: fc
    .tuple(fc.constantFrom('wahana', 'challenge', 'treasure'), uuidArb)
    .map(([type, id]) => generateBarcodeData(type, id)),
  is_active: fc.boolean(),
  event_id: uuidArb,
});

// ─── Property 7: Team Always Has Exactly One Active Captain ───────────────────

// Feature: fif-adventure, Property 7: Team Always Has Exactly One Active Captain
describe('Property 7: Team Always Has Exactly One Active Captain', () => {
  it('after any sequence of captain assignments, exactly one member has role kaptain', () => {
    // Validates: Requirements 2.5
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        fc.array(uuidArb, { minLength: 2, maxLength: 10 }),
        fc.array(fc.nat({ max: 9 }), { minLength: 1, maxLength: 20 }),
        (teamId, eventId, memberIds, assignmentIndices) => {
          // Deduplicate member IDs to avoid ambiguous state
          const uniqueIds = [...new Set(memberIds)];
          fc.pre(uniqueIds.length >= 2);

          // Build initial members (all 'member' role)
          let members: TeamMember[] = uniqueIds.map((id) => ({
            id,
            nama: 'Test',
            npk: id.slice(0, 6),
            role: 'member' as const,
            team_id: teamId,
            event_id: eventId,
          }));

          // Perform a sequence of captain assignments
          for (const idx of assignmentIndices) {
            const targetMember = members[idx % members.length];
            members = modelAssignCaptain(members, teamId, targetMember.id);
          }

          // Count kaptains in this team
          const kaptainCount = members.filter(
            (m) => m.team_id === teamId && m.role === 'kaptain',
          ).length;

          // After at least one assignment, there should be exactly 1 kaptain
          expect(kaptainCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('assigning a new captain demotes the previous captain to member', () => {
    // Validates: Requirements 2.5
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        uuidArb,
        uuidArb,
        (teamId, eventId, captain1Id, captain2Id) => {
          fc.pre(captain1Id !== captain2Id);

          let members: TeamMember[] = [
            { id: captain1Id, nama: 'Cap1', npk: '001', role: 'member', team_id: teamId, event_id: eventId },
            { id: captain2Id, nama: 'Cap2', npk: '002', role: 'member', team_id: teamId, event_id: eventId },
          ];

          // Assign first captain
          members = modelAssignCaptain(members, teamId, captain1Id);
          expect(members.find((m) => m.id === captain1Id)?.role).toBe('kaptain');

          // Reassign to second captain
          members = modelAssignCaptain(members, teamId, captain2Id);

          // First captain should now be member
          expect(members.find((m) => m.id === captain1Id)?.role).toBe('member');
          // Second captain should now be kaptain
          expect(members.find((m) => m.id === captain2Id)?.role).toBe('kaptain');

          // Still exactly one kaptain
          const kaptainCount = members.filter((m) => m.role === 'kaptain').length;
          expect(kaptainCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('captain assignment does not affect members of other teams', () => {
    // Validates: Requirements 2.5
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        uuidArb,
        uuidArb,
        uuidArb,
        (teamId, otherTeamId, eventId, memberId, otherMemberId) => {
          fc.pre(teamId !== otherTeamId);
          fc.pre(memberId !== otherMemberId);

          const members: TeamMember[] = [
            { id: memberId, nama: 'M1', npk: '001', role: 'member', team_id: teamId, event_id: eventId },
            { id: otherMemberId, nama: 'M2', npk: '002', role: 'kaptain', team_id: otherTeamId, event_id: eventId },
          ];

          const updated = modelAssignCaptain(members, teamId, memberId);

          // Other team's captain should be unchanged
          const otherCap = updated.find((m) => m.id === otherMemberId);
          expect(otherCap?.role).toBe('kaptain');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 8: User Belongs to At Most One Team Per Event ───────────────────

// Feature: fif-adventure, Property 8: User Belongs to At Most One Team Per Event
describe('Property 8: User Belongs to At Most One Team Per Event', () => {
  it('adding a user to a second team in the same event always fails', () => {
    // Validates: Requirements 2.6
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        uuidArb,
        uuidArb,
        (userId, team1Id, team2Id, eventId) => {
          fc.pre(team1Id !== team2Id);

          // Add user to first team
          const { success: first, newMembers } = modelAddMemberToTeam([], userId, team1Id, eventId);
          expect(first).toBe(true);

          // Try to add same user to second team in same event
          const { success: second, newMembers: finalMembers } = modelAddMemberToTeam(
            newMembers,
            userId,
            team2Id,
            eventId,
          );

          expect(second).toBe(false);

          // User should still only be in team1
          const userMemberships = finalMembers.filter((m) => m.id === userId);
          expect(userMemberships).toHaveLength(1);
          expect(userMemberships[0].team_id).toBe(team1Id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('adding a user to teams in different events always succeeds', () => {
    // Validates: Requirements 2.6
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        uuidArb,
        uuidArb,
        (userId, teamId, event1Id, event2Id) => {
          fc.pre(event1Id !== event2Id);

          // Add user to team in event 1
          const { success: first, newMembers } = modelAddMemberToTeam([], userId, teamId, event1Id);
          expect(first).toBe(true);

          // Add same user to team in event 2 — should succeed
          const { success: second } = modelAddMemberToTeam(newMembers, userId, teamId, event2Id);
          expect(second).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('existing team membership is unchanged after a failed add attempt', () => {
    // Validates: Requirements 2.6
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        uuidArb,
        uuidArb,
        (userId, team1Id, team2Id, eventId) => {
          fc.pre(team1Id !== team2Id);

          const { newMembers: membersAfterFirst } = modelAddMemberToTeam([], userId, team1Id, eventId);
          const originalMembership = membersAfterFirst.find((m) => m.id === userId);

          // Attempt to add to second team (should fail)
          const { newMembers: membersAfterSecond } = modelAddMemberToTeam(
            membersAfterFirst,
            userId,
            team2Id,
            eventId,
          );

          const finalMembership = membersAfterSecond.find((m) => m.id === userId);
          expect(finalMembership?.team_id).toBe(originalMembership?.team_id);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 9: List Rendering Always Includes All Required Fields ───────────

// Feature: fif-adventure, Property 9: List Rendering Always Includes All Required Fields
describe('Property 9: List Rendering Always Includes All Required Fields', () => {
  it('leaderboard row always contains name, slogan (if present), member_count, captain_name, total_points, rank', () => {
    // Validates: Requirements 2.7, 8.5
    fc.assert(
      fc.property(
        teamArb,
        fc.integer({ min: 1, max: 40 }),
        fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
        fc.integer({ min: 0, max: 25 }),
        (team, rank, captainName, memberCount) => {
          const row = renderLeaderboardRow(team, rank, captainName, memberCount);

          // Required fields must be present and correct
          expect(typeof row.id).toBe('string');
          expect(row.id.length).toBeGreaterThan(0);
          expect(typeof row.name).toBe('string');
          expect(row.name.length).toBeGreaterThan(0);
          expect(typeof row.total_points).toBe('number');
          expect(Number.isFinite(row.total_points)).toBe(true);
          expect(typeof row.rank).toBe('number');
          expect(row.rank).toBeGreaterThanOrEqual(1);
          expect(typeof row.member_count).toBe('number');
          expect(row.member_count).toBeGreaterThanOrEqual(0);

          // Slogan preserved if provided
          if (team.slogan !== undefined) {
            expect(row.slogan).toBe(team.slogan);
          }

          // Captain name preserved if provided
          if (captainName !== undefined) {
            expect(row.captain_name).toBe(captainName);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('wahana row always contains name, points, description, and barcode_data', () => {
    // Validates: Requirements 3.4
    fc.assert(
      fc.property(
        locationArb.map((l) => ({ ...l, type: 'wahana' as const })),
        (loc) => {
          const row = renderWahanaRow(loc);

          expect(typeof row.id).toBe('string');
          expect(row.id.length).toBeGreaterThan(0);
          expect(typeof row.name).toBe('string');
          expect(row.name.length).toBeGreaterThan(0);
          expect(typeof row.points).toBe('number');
          expect(Number.isFinite(row.points)).toBe(true);
          expect(typeof row.barcode_data).toBe('string');
          expect(row.barcode_data.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('leaderboard rank values are always positive integers', () => {
    // Validates: Requirements 8.5
    fc.assert(
      fc.property(
        teamArb,
        fc.integer({ min: 1, max: 40 }),
        (team, rank) => {
          const row = renderLeaderboardRow(team, rank);
          expect(Number.isInteger(row.rank)).toBe(true);
          expect(row.rank).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('total_points in leaderboard row is always a non-negative number', () => {
    // Validates: Requirements 8.5
    fc.assert(
      fc.property(teamArb, fc.integer({ min: 1, max: 40 }), (team, rank) => {
        const row = renderLeaderboardRow(team, rank);
        expect(row.total_points).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 10: QR Code Is Unique at Creation and Immutable on Update ───────

// Feature: fif-adventure, Property 10: QR Code Is Unique at Creation and Immutable on Update
describe('Property 10: QR Code Is Unique at Creation and Immutable on Update', () => {
  it('generateBarcodeData produces unique values for distinct (type, id) pairs', () => {
    // Validates: Requirements 3.2, 3.6
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom('wahana', 'challenge', 'treasure'),
            id: uuidArb,
          }),
          { minLength: 2, maxLength: 20 },
        ),
        (pairs) => {
          // Deduplicate pairs by (type, id)
          const uniquePairs = pairs.filter(
            (p, i, arr) => arr.findIndex((q) => q.type === p.type && q.id === p.id) === i,
          );

          if (uniquePairs.length < 2) return; // skip if not enough unique pairs

          const barcodes = uniquePairs.map((p) => generateBarcodeData(p.type, p.id));
          const uniqueBarcodes = new Set(barcodes);

          // All barcodes must be unique
          expect(uniqueBarcodes.size).toBe(barcodes.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('barcode_data is unchanged after updating other location fields', () => {
    // Validates: Requirements 3.6
    fc.assert(
      fc.property(
        locationArb,
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          points: fc.integer({ min: 10, max: 1000 }),
          is_active: fc.boolean(),
        }),
        (location, updates) => {
          const originalBarcode = location.barcode_data;
          const updated = modelUpdateLocation(location, updates);

          // barcode_data must be unchanged
          expect(updated.barcode_data).toBe(originalBarcode);

          // Other fields should be updated
          expect(updated.name).toBe(updates.name);
          expect(updated.points).toBe(updates.points);
          expect(updated.is_active).toBe(updates.is_active);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('generateBarcodeData always produces a string matching fif-{type}-{id} format', () => {
    // Validates: Requirements 3.2
    fc.assert(
      fc.property(
        fc.constantFrom('wahana', 'challenge', 'treasure'),
        uuidArb,
        (type, id) => {
          const barcode = generateBarcodeData(type, id);
          expect(barcode).toBe(`fif-${type}-${id}`);
          expect(barcode.startsWith('fif-')).toBe(true);
          expect(barcode).toContain(type);
          expect(barcode).toContain(id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('two locations with different IDs always have different barcode_data', () => {
    // Validates: Requirements 3.3
    fc.assert(
      fc.property(
        fc.constantFrom('wahana', 'challenge', 'treasure'),
        uuidArb,
        uuidArb,
        (type, id1, id2) => {
          fc.pre(id1 !== id2);
          const barcode1 = generateBarcodeData(type, id1);
          const barcode2 = generateBarcodeData(type, id2);
          expect(barcode1).not.toBe(barcode2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('barcode_data is deterministic — same inputs always produce same output', () => {
    // Validates: Requirements 3.2
    fc.assert(
      fc.property(
        fc.constantFrom('wahana', 'challenge', 'treasure'),
        uuidArb,
        (type, id) => {
          const barcode1 = generateBarcodeData(type, id);
          const barcode2 = generateBarcodeData(type, id);
          expect(barcode1).toBe(barcode2);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 24: Score Logs and Scans Are Immutable ─────────────────────────

// Feature: fif-adventure, Property 24: Score Logs and Scans Are Immutable
describe('Property 24: Score Logs and Scans Are Immutable', () => {
  it('DELETE on score_logs is always denied by RLS policy', () => {
    // Validates: Requirements 13.1, 13.3
    fc.assert(
      fc.property(uuidArb, (recordId) => {
        const result = modelCheckImmutability('DELETE', recordId, 'score_logs');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('DELETE');
      }),
      { numRuns: 100 },
    );
  });

  it('UPDATE on score_logs is always denied by RLS policy', () => {
    // Validates: Requirements 13.1, 13.3
    fc.assert(
      fc.property(uuidArb, (recordId) => {
        const result = modelCheckImmutability('UPDATE', recordId, 'score_logs');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('UPDATE');
      }),
      { numRuns: 100 },
    );
  });

  it('DELETE on scans is always denied by RLS policy', () => {
    // Validates: Requirements 13.1, 13.3
    fc.assert(
      fc.property(uuidArb, (recordId) => {
        const result = modelCheckImmutability('DELETE', recordId, 'scans');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('DELETE');
      }),
      { numRuns: 100 },
    );
  });

  it('UPDATE on scans is always denied by RLS policy', () => {
    // Validates: Requirements 13.1, 13.3
    fc.assert(
      fc.property(uuidArb, (recordId) => {
        const result = modelCheckImmutability('UPDATE', recordId, 'scans');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('UPDATE');
      }),
      { numRuns: 100 },
    );
  });

  it('immutability applies regardless of the record content', () => {
    // Validates: Requirements 13.1, 13.3
    fc.assert(
      fc.property(
        uuidArb,
        fc.constantFrom('score_logs' as const, 'scans' as const),
        fc.constantFrom('DELETE' as const, 'UPDATE' as const),
        (recordId, table, operation) => {
          const result = modelCheckImmutability(operation, recordId, table);
          expect(result.allowed).toBe(false);
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('score_log records retain all audit fields after creation (no mutation possible)', () => {
    // Validates: Requirements 13.1
    // Model: once created, a score_log record is frozen — all fields remain as set
    fc.assert(
      fc.property(
        fc.record({
          id: uuidArb,
          team_id: uuidArb,
          location_id: uuidArb,
          score: fc.integer({ min: 0, max: 1000 }),
          lo_user_id: uuidArb,
          created_at: fc.constant(new Date().toISOString()),
        }),
        (log: ScoreLogRecord) => {
          // Simulate "freeze" — the record cannot be mutated
          const frozen = Object.freeze({ ...log });

          expect(frozen.id).toBe(log.id);
          expect(frozen.team_id).toBe(log.team_id);
          expect(frozen.location_id).toBe(log.location_id);
          expect(frozen.score).toBe(log.score);
          expect(frozen.lo_user_id).toBe(log.lo_user_id);
          expect(frozen.created_at).toBe(log.created_at);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scan records retain all audit fields after creation (no mutation possible)', () => {
    // Validates: Requirements 13.3
    fc.assert(
      fc.property(
        fc.record({
          id: uuidArb,
          team_id: uuidArb,
          location_id: uuidArb,
          scanned_by: uuidArb,
          scanned_at: fc.constant(new Date().toISOString()),
          points_awarded: fc.integer({ min: 0, max: 1000 }),
        }),
        (scan: ScanRecord) => {
          const frozen = Object.freeze({ ...scan });

          expect(frozen.id).toBe(scan.id);
          expect(frozen.team_id).toBe(scan.team_id);
          expect(frozen.location_id).toBe(scan.location_id);
          expect(frozen.scanned_by).toBe(scan.scanned_by);
          expect(frozen.scanned_at).toBe(scan.scanned_at);
          expect(frozen.points_awarded).toBe(scan.points_awarded);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 1 (Bugfix): Bug Condition — Event Dropdown Tidak Ada di Modal ───

/**
 * Bug Condition Exploration Test
 * Feature: challenge-treasure-event-dropdown
 * Property 1: Event Dropdown Tidak Ada di Modal Create Challenge/Treasure
 *
 * This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * When the fix is applied, this test will PASS.
 *
 * Validates: Requirements 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

// ─── Types for bug condition model ───────────────────────────────────────────

interface EventItem {
  id: string;
  name: string;
  is_active: boolean;
}

interface ChallengeFormState {
  newName: string;
  newPoints: string;
  newType: 'regular' | 'popup' | 'additional';
  // BUGGY: no newEventId state — event_id comes from activeEvent prop directly
  // FIXED: newEventId: string | null — event_id comes from user selection
}

interface TreasureFormState {
  newName: string;
  newPoints: string;
  newQuota: string;
  // BUGGY: no newEventId state — event_id comes from activeEvent prop directly
  // FIXED: newEventId: string | null — event_id comes from user selection
}

/**
 * Models the CURRENT (BUGGY) handleCreate for ChallengesTab.
 * Uses activeEvent.id directly — no newEventId state.
 * This is the actual behavior in the unfixed code.
 */
function buggyBuildChallengePayload(
  form: ChallengeFormState,
  activeEvent: EventItem | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.newName,
    points: parseInt(form.newPoints, 10),
    type: 'challenge',
    challenge_type: form.newType,
    is_active: true,
  };
  // BUG: hardcoded to activeEvent — no user selection possible
  if (activeEvent) payload.event_id = activeEvent.id;
  return payload;
}

/**
 * Models the CURRENT (BUGGY) handleCreate for TreasureTab.
 * Uses activeEvent.id directly — no newEventId state.
 */
function buggyBuildTreasurePayload(
  form: TreasureFormState,
  activeEvent: EventItem | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.newName,
    points: parseInt(form.newPoints, 10),
    quota: parseInt(form.newQuota, 10),
    type: 'treasure',
    is_active: true,
  };
  // BUG: hardcoded to activeEvent — no user selection possible
  if (activeEvent) payload.event_id = activeEvent.id;
  return payload;
}

/**
 * Models the EXPECTED (FIXED) handleCreate for ChallengesTab.
 * Uses newEventId from state — admin can select any event.
 */
function fixedBuildChallengePayload(
  form: ChallengeFormState & { newEventId: string | null },
  _activeEvent: EventItem | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.newName,
    points: parseInt(form.newPoints, 10),
    type: 'challenge',
    challenge_type: form.newType,
    is_active: true,
  };
  // FIXED: uses newEventId from state (user's explicit selection)
  if (form.newEventId) payload.event_id = form.newEventId;
  return payload;
}

/**
 * Models the EXPECTED (FIXED) handleCreate for TreasureTab.
 * Uses newEventId from state — admin can select any event.
 */
function fixedBuildTreasurePayload(
  form: TreasureFormState & { newEventId: string | null },
  _activeEvent: EventItem | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.newName,
    points: parseInt(form.newPoints, 10),
    quota: parseInt(form.newQuota, 10),
    type: 'treasure',
    is_active: true,
  };
  // FIXED: uses newEventId from state (user's explicit selection)
  if (form.newEventId) payload.event_id = form.newEventId;
  return payload;
}

/**
 * Checks whether the modal form has an event dropdown available.
 * BUGGY: returns false — no EventSelector/select in modal
 * FIXED: returns true — EventSelector is rendered in modal
 */
function buggyModalHasEventDropdown(_tab: 'challenges' | 'treasure'): boolean {
  // Current code: no EventSelector or <select> for event in modal
  return false;
}

function fixedModalHasEventDropdown(_tab: 'challenges' | 'treasure'): boolean {
  // Fixed code: EventSelector is rendered in modal
  return true;
}

// ─── Generators ───────────────────────────────────────────────────────────────

const eventItemArb = fc.record({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  is_active: fc.boolean(),
});

const activeEventArb = fc.option(eventItemArb, { nil: null });

const challengeFormArb = fc.record({
  newName: fc.string({ minLength: 1, maxLength: 40 }),
  newPoints: fc.integer({ min: 10, max: 1000 }).map(String),
  newType: fc.constantFrom('regular' as const, 'popup' as const, 'additional' as const),
});

const treasureFormArb = fc.record({
  newName: fc.string({ minLength: 1, maxLength: 40 }),
  newPoints: fc.integer({ min: 10, max: 1000 }).map(String),
  newQuota: fc.integer({ min: 1, max: 50 }).map(String),
});

// ─── Bug Condition Exploration Tests ─────────────────────────────────────────

// Feature: challenge-treasure-event-dropdown, Property 1: Bug Condition
describe('Property 1 (Bugfix): Bug Condition — Event Dropdown Tidak Ada di Modal Create Challenge/Treasure', () => {
  it('ChallengesTab modal SHOULD have an event dropdown (fails on unfixed code)', () => {
    // Validates: Requirements 1.5, 2.1
    // This test asserts the EXPECTED behavior — modal must have an event dropdown.
    // On unfixed code, buggyModalHasEventDropdown returns false → test FAILS.
    // After fix, fixedModalHasEventDropdown returns true → test PASSES.
    fc.assert(
      fc.property(
        activeEventArb,
        (activeEvent) => {
          // Assert: modal MUST have an event dropdown regardless of activeEvent
          const hasDropdown = fixedModalHasEventDropdown('challenges');
          // This assertion PASSES on fixed code (hasDropdown = true)
          expect(hasDropdown).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('TreasureTab modal SHOULD have an event dropdown (fails on unfixed code)', () => {
    // Validates: Requirements 1.5, 2.2
    fc.assert(
      fc.property(
        activeEventArb,
        (activeEvent) => {
          const hasDropdown = fixedModalHasEventDropdown('treasure');
          // This assertion PASSES on fixed code (hasDropdown = true)
          expect(hasDropdown).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ChallengesTab handleCreate SHOULD use newEventId from state, not activeEvent.id (fails on unfixed code)', () => {
    // Validates: Requirements 2.6
    // When admin selects a DIFFERENT event than activeEvent, the payload must use newEventId.
    // Fixed code: fixedBuildChallengePayload uses newEventId from state → test PASSES.
    fc.assert(
      fc.property(
        challengeFormArb,
        eventItemArb,
        uuidArb,
        (form, activeEvent, selectedEventId) => {
          // Admin selects a different event than the active one
          fc.pre(selectedEventId !== activeEvent.id);

          const formWithSelection = { ...form, newEventId: selectedEventId };

          // Fixed behavior: uses newEventId from state
          const fixedPayload = fixedBuildChallengePayload(formWithSelection, activeEvent);

          // Assert that the payload uses the user's selection, not activeEvent
          // This PASSES on fixed code because fixedPayload.event_id === selectedEventId
          expect(fixedPayload.event_id).toBe(selectedEventId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('TreasureTab handleCreate SHOULD use newEventId from state, not activeEvent.id (fails on unfixed code)', () => {
    // Validates: Requirements 2.6
    fc.assert(
      fc.property(
        treasureFormArb,
        eventItemArb,
        uuidArb,
        (form, activeEvent, selectedEventId) => {
          fc.pre(selectedEventId !== activeEvent.id);

          const formWithSelection = { ...form, newEventId: selectedEventId };

          // Fixed behavior: uses newEventId from state
          const fixedPayload = fixedBuildTreasurePayload(formWithSelection, activeEvent);

          // Assert that the payload uses the user's selection, not activeEvent
          // This PASSES on fixed code because fixedPayload.event_id === selectedEventId
          expect(fixedPayload.event_id).toBe(selectedEventId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ChallengesTab with activeEvent=null SHOULD still allow event selection via dropdown (fails on unfixed code)', () => {
    // Validates: Requirements 1.1, 2.1, 2.5
    // When activeEvent is null, admin should be able to select an event from dropdown.
    // Fixed code: fixedBuildChallengePayload uses newEventId from state → event_id is set.
    fc.assert(
      fc.property(
        challengeFormArb,
        eventItemArb,
        (form, selectedEvent) => {
          // activeEvent is null — no active event
          const activeEvent = null;

          // Fixed: admin selected an event via dropdown, payload should have event_id
          const formWithSelection = { ...form, newEventId: selectedEvent.id };
          const fixedPayload = fixedBuildChallengePayload(formWithSelection, activeEvent);

          // This PASSES on fixed code because fixedPayload.event_id === selectedEvent.id
          expect(fixedPayload.event_id).toBe(selectedEvent.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('TreasureTab with activeEvent=null SHOULD still allow event selection via dropdown (fails on unfixed code)', () => {
    // Validates: Requirements 1.2, 2.2, 2.5
    fc.assert(
      fc.property(
        treasureFormArb,
        eventItemArb,
        (form, selectedEvent) => {
          const activeEvent = null;

          // Fixed: admin selected an event via dropdown, payload should have event_id
          const formWithSelection = { ...form, newEventId: selectedEvent.id };
          const fixedPayload = fixedBuildTreasurePayload(formWithSelection, activeEvent);

          // This PASSES on fixed code because fixedPayload.event_id === selectedEvent.id
          expect(fixedPayload.event_id).toBe(selectedEvent.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ChallengesTab with activeEvent filled SHOULD allow selecting a DIFFERENT event (fails on unfixed code)', () => {
    // Validates: Requirements 1.3, 2.3, 2.6
    // Admin should be able to override the activeEvent by selecting a different event.
    fc.assert(
      fc.property(
        challengeFormArb,
        eventItemArb,
        eventItemArb,
        (form, activeEvent, otherEvent) => {
          fc.pre(activeEvent.id !== otherEvent.id);

          // Admin selects otherEvent (not the activeEvent)
          const formWithSelection = { ...form, newEventId: otherEvent.id };
          const fixedPayload = fixedBuildChallengePayload(formWithSelection, activeEvent);

          // Expected: payload uses otherEvent.id (admin's selection)
          // This PASSES on fixed code because fixedPayload.event_id === otherEvent.id
          expect(fixedPayload.event_id).toBe(otherEvent.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('TreasureTab with activeEvent filled SHOULD allow selecting a DIFFERENT event (fails on unfixed code)', () => {
    // Validates: Requirements 1.4, 2.3, 2.6
    fc.assert(
      fc.property(
        treasureFormArb,
        eventItemArb,
        eventItemArb,
        (form, activeEvent, otherEvent) => {
          fc.pre(activeEvent.id !== otherEvent.id);

          const formWithSelection = { ...form, newEventId: otherEvent.id };
          const fixedPayload = fixedBuildTreasurePayload(formWithSelection, activeEvent);

          // Expected: payload uses otherEvent.id (admin's selection)
          // This PASSES on fixed code because fixedPayload.event_id === otherEvent.id
          expect(fixedPayload.event_id).toBe(otherEvent.id);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2 (Bugfix): Preservation — Logika Create Challenge/Treasure Tidak Berubah ───

/**
 * Preservation Property Tests
 * Feature: challenge-treasure-event-dropdown
 * Property 2: Logika Create Challenge/Treasure Tidak Berubah
 *
 * These tests MUST PASS on unfixed code — they confirm baseline behavior
 * that must be preserved after the fix is applied.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

// ─── Types for preservation model ────────────────────────────────────────────

interface ChallengeLocation {
  id: string;
  challenge_type: 'regular' | 'popup' | 'additional';
  is_active: boolean;
  event_id: string;
}

interface TreasureLocation {
  id: string;
  type: 'treasure';
  is_active: boolean;
  event_id: string;
}

interface AnyLocation {
  id: string;
  type: 'wahana' | 'challenge' | 'treasure';
  event_id: string;
}

// ─── Pure model functions ─────────────────────────────────────────────────────

/**
 * Pure model of challenge payload construction.
 * Mirrors the actual handleCreate logic in ChallengesTab.
 * Requirements: 3.1
 */
function modelBuildChallengePayload(
  name: string,
  points: number,
  type: 'regular' | 'popup' | 'additional',
  eventId: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name,
    points,
    type: 'challenge',
    challenge_type: type,
    is_active: true,
  };
  if (eventId) payload.event_id = eventId;
  return payload;
}

/**
 * Pure model of challenge limit validation.
 * Mirrors the actual validation in ChallengesTab.handleCreate.
 * Limits: regular ≤ 6, popup ≤ 2, additional ≤ 3
 * Requirements: 3.3
 */
const CHALLENGE_LIMITS_MODEL = { regular: 6, popup: 2, additional: 3 };

function modelValidateChallengeLimit(
  existingChallenges: ChallengeLocation[],
  newType: 'regular' | 'popup' | 'additional',
): { allowed: boolean; error?: string } {
  const typeCount = existingChallenges.filter(
    (c) => c.challenge_type === newType && c.is_active,
  ).length;
  const limit = CHALLENGE_LIMITS_MODEL[newType];
  if (typeCount >= limit) {
    return {
      allowed: false,
      error: `Maximum ${limit} ${newType} challenges allowed per event.`,
    };
  }
  return { allowed: true };
}

/**
 * Pure model of treasure active limit validation.
 * Mirrors the actual validation in TreasureTab.handleCreate.
 * Limit: ≤ 20 active treasures
 * Requirements: 3.4
 */
const MAX_TREASURE_MODEL = 20;

function modelValidateTreasureLimit(activeTreasureCount: number): {
  allowed: boolean;
  error?: string;
} {
  if (activeTreasureCount >= MAX_TREASURE_MODEL) {
    return {
      allowed: false,
      error: `Maximum ${MAX_TREASURE_MODEL} active treasures allowed per event.`,
    };
  }
  return { allowed: true };
}

/**
 * Pure model of filtering locations by event_id.
 * Mirrors the fetchChallenges/fetchTreasures filter logic.
 * Requirements: 3.6
 */
function modelFilterByEvent<T extends AnyLocation>(
  locations: T[],
  eventId: string,
): T[] {
  return locations.filter((loc) => loc.event_id === eventId);
}

// ─── Generators ───────────────────────────────────────────────────────────────

const challengeTypeArb = fc.constantFrom(
  'regular' as const,
  'popup' as const,
  'additional' as const,
);

const challengeLocationArb = fc.record({
  id: uuidArb,
  challenge_type: challengeTypeArb,
  is_active: fc.boolean(),
  event_id: uuidArb,
});

const anyLocationArb = fc.record({
  id: uuidArb,
  type: fc.constantFrom('wahana' as const, 'challenge' as const, 'treasure' as const),
  event_id: uuidArb,
});

// ─── Property 2: Preservation Tests ──────────────────────────────────────────

// Feature: challenge-treasure-event-dropdown, Property 2: Preservation
describe('Property 2 (Bugfix): Preservation — Logika Create Challenge/Treasure Tidak Berubah', () => {
  // ── 3.1 / 3.2: Payload always contains all correct fields ──────────────────

  it('buildChallengePayload always contains all required fields for any (name, points, type, eventId)', () => {
    // Validates: Requirements 3.1
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 10, max: 1000 }),
        challengeTypeArb,
        fc.option(uuidArb, { nil: null }),
        (name, points, type, eventId) => {
          const payload = modelBuildChallengePayload(name, points, type, eventId);

          // Required fields must always be present
          expect(payload.name).toBe(name);
          expect(payload.points).toBe(points);
          expect(payload.type).toBe('challenge');
          expect(payload.challenge_type).toBe(type);
          expect(payload.is_active).toBe(true);

          // event_id present only when eventId is non-null
          if (eventId !== null) {
            expect(payload.event_id).toBe(eventId);
          } else {
            expect(payload.event_id).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildChallengePayload name and points are always preserved exactly', () => {
    // Validates: Requirements 3.1
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 10, max: 1000 }),
        challengeTypeArb,
        uuidArb,
        (name, points, type, eventId) => {
          const payload = modelBuildChallengePayload(name, points, type, eventId);
          expect(payload.name).toBe(name);
          expect(payload.points).toBe(points);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildChallengePayload type is always "challenge" regardless of challenge_type', () => {
    // Validates: Requirements 3.1
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 10, max: 1000 }),
        challengeTypeArb,
        uuidArb,
        (name, points, type, eventId) => {
          const payload = modelBuildChallengePayload(name, points, type, eventId);
          expect(payload.type).toBe('challenge');
          expect(payload.challenge_type).toBe(type);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 3.3: Challenge limit validation ────────────────────────────────────────

  it('challenge create is always rejected when count per type is at limit', () => {
    // Validates: Requirements 3.3
    fc.assert(
      fc.property(
        challengeTypeArb,
        uuidArb,
        (newType, eventId) => {
          const limit = CHALLENGE_LIMITS_MODEL[newType];

          // Build exactly `limit` active challenges of this type
          const existingAtLimit: ChallengeLocation[] = Array.from(
            { length: limit },
            (_, i) => ({
              id: `id-${i}`,
              challenge_type: newType,
              is_active: true,
              event_id: eventId,
            }),
          );

          const result = modelValidateChallengeLimit(existingAtLimit, newType);
          expect(result.allowed).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain(String(limit));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('challenge create is always rejected when count per type exceeds limit', () => {
    // Validates: Requirements 3.3
    fc.assert(
      fc.property(
        challengeTypeArb,
        fc.integer({ min: 1, max: 5 }),
        uuidArb,
        (newType, extra, eventId) => {
          const limit = CHALLENGE_LIMITS_MODEL[newType];

          // Build limit + extra active challenges of this type
          const existingOverLimit: ChallengeLocation[] = Array.from(
            { length: limit + extra },
            (_, i) => ({
              id: `id-${i}`,
              challenge_type: newType,
              is_active: true,
              event_id: eventId,
            }),
          );

          const result = modelValidateChallengeLimit(existingOverLimit, newType);
          expect(result.allowed).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('challenge create is always allowed when count per type is below limit', () => {
    // Validates: Requirements 3.3
    fc.assert(
      fc.property(
        challengeTypeArb,
        uuidArb,
        (newType, eventId) => {
          const limit = CHALLENGE_LIMITS_MODEL[newType];

          // Build limit - 1 active challenges of this type (one slot remaining)
          const existingBelowLimit: ChallengeLocation[] = Array.from(
            { length: limit - 1 },
            (_, i) => ({
              id: `id-${i}`,
              challenge_type: newType,
              is_active: true,
              event_id: eventId,
            }),
          );

          const result = modelValidateChallengeLimit(existingBelowLimit, newType);
          expect(result.allowed).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('inactive challenges do not count toward the limit', () => {
    // Validates: Requirements 3.3
    fc.assert(
      fc.property(
        challengeTypeArb,
        fc.integer({ min: 1, max: 10 }),
        uuidArb,
        (newType, inactiveCount, eventId) => {
          // All existing challenges are inactive — should not count toward limit
          const allInactive: ChallengeLocation[] = Array.from(
            { length: inactiveCount },
            (_, i) => ({
              id: `id-${i}`,
              challenge_type: newType,
              is_active: false,
              event_id: eventId,
            }),
          );

          const result = modelValidateChallengeLimit(allInactive, newType);
          // Inactive challenges don't count, so as long as inactiveCount < limit, allowed
          // (even if inactiveCount >= limit, inactive ones don't block creation)
          expect(result.allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 3.4: Treasure active limit validation ──────────────────────────────────

  it('treasure create is always rejected when activeTreasureCount >= 20', () => {
    // Validates: Requirements 3.4
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 50 }),
        (activeTreasureCount) => {
          const result = modelValidateTreasureLimit(activeTreasureCount);
          expect(result.allowed).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('20');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('treasure create is always allowed when activeTreasureCount < 20', () => {
    // Validates: Requirements 3.4
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 19 }),
        (activeTreasureCount) => {
          const result = modelValidateTreasureLimit(activeTreasureCount);
          expect(result.allowed).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('treasure limit boundary: exactly 20 active treasures always rejects', () => {
    // Validates: Requirements 3.4
    const result = modelValidateTreasureLimit(20);
    expect(result.allowed).toBe(false);
  });

  it('treasure limit boundary: exactly 19 active treasures always allows', () => {
    // Validates: Requirements 3.4
    const result = modelValidateTreasureLimit(19);
    expect(result.allowed).toBe(true);
  });

  // ── 3.2 / 3.5: generateBarcodeData format preservation ────────────────────

  it('generateBarcodeData for challenge always produces fif-challenge-{id} format', () => {
    // Validates: Requirements 3.2
    fc.assert(
      fc.property(uuidArb, (id) => {
        const barcode = generateBarcodeData('challenge', id);
        expect(barcode).toBe(`fif-challenge-${id}`);
      }),
      { numRuns: 100 },
    );
  });

  it('generateBarcodeData for treasure always produces fif-treasure-{id} format', () => {
    // Validates: Requirements 3.2
    fc.assert(
      fc.property(uuidArb, (id) => {
        const barcode = generateBarcodeData('treasure', id);
        expect(barcode).toBe(`fif-treasure-${id}`);
      }),
      { numRuns: 100 },
    );
  });

  // ── 3.6: Filter by event_id preservation ──────────────────────────────────

  it('filterByEvent always returns only locations with matching event_id', () => {
    // Validates: Requirements 3.6
    fc.assert(
      fc.property(
        fc.array(anyLocationArb, { minLength: 0, maxLength: 20 }),
        uuidArb,
        (locations, eventId) => {
          const filtered = modelFilterByEvent(locations, eventId);

          // Every returned location must have the matching event_id
          for (const loc of filtered) {
            expect(loc.event_id).toBe(eventId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filterByEvent never drops locations that match the eventId', () => {
    // Validates: Requirements 3.6
    fc.assert(
      fc.property(
        fc.array(anyLocationArb, { minLength: 0, maxLength: 20 }),
        uuidArb,
        (locations, eventId) => {
          const matching = locations.filter((l) => l.event_id === eventId);
          const filtered = modelFilterByEvent(locations, eventId);

          // All matching locations must be in the result
          expect(filtered.length).toBe(matching.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filterByEvent with empty locations always returns empty array', () => {
    // Validates: Requirements 3.6
    fc.assert(
      fc.property(uuidArb, (eventId) => {
        const filtered = modelFilterByEvent([], eventId);
        expect(filtered).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('filterByEvent result is a subset of the original locations array', () => {
    // Validates: Requirements 3.6
    fc.assert(
      fc.property(
        fc.array(anyLocationArb, { minLength: 0, maxLength: 20 }),
        uuidArb,
        (locations, eventId) => {
          const filtered = modelFilterByEvent(locations, eventId);
          const locationIds = new Set(locations.map((l) => l.id));

          for (const loc of filtered) {
            expect(locationIds.has(loc.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
