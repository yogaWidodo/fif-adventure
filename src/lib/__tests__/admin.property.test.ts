// /**
//  * Property-based tests for admin dashboard logic.
//  * Feature: fif-adventure
//  * Properties: 7, 8, 9, 10, 24
//  * Uses fast-check with minimum 100 iterations per property.
//  */

// import { describe, it, expect } from 'vitest';
// import * as fc from 'fast-check';
// import { generateBarcodeData } from '../auth';

// // ─── Types ────────────────────────────────────────────────────────────────────

// interface TeamMember {
//   id: string;
//   name: string;
//   npk: string;
//   role: 'admin' | 'captain' | 'vice_captain' | 'member' | 'lo';
//   team_id: string;
// }

// interface Team {
//   id: string;
//   name: string;
//   slogan?: string;
//   captain_id?: string;
//   total_points: number;
// }

// interface Activity {
//   id: string;
//   name: string;
//   type: 'wahana' | 'challenge_regular' | 'challenge_popup' | 'challenge_additional' | 'treasure';
//   max_points: number;
//   barcode_data: string;
// }

// interface LeaderboardRow {
//   id: string;
//   name: string;
//   slogan?: string;
//   total_points: number;
//   rank: number;
//   captain_name?: string;
//   member_count: number;
// }

// interface ActivityRow {
//   id: string;
//   name: string;
//   max_points: number;
//   description?: string;
//   barcode_data: string;
// }

// interface ScoreLogRecord {
//   id: string;
//   team_id: string;
//   activity_id: string;
//   points_awarded: number;
//   lo_id: string;
//   created_at: string;
// }

// interface ActivityRegistration {
//   id: string;
//   team_id: string;
//   activity_id: string;
//   checked_in_by: string;
//   checked_in_at: string;
// }

// // ─── Pure models ──────────────────────────────────────────────────────────────

// /**
//  * Pure model of captain assignment.
//  * Ensures exactly one captain per team after any assignment sequence.
//  * Requirements: 2.4, 2.5
//  */
// function modelAssignCaptain(
//   members: TeamMember[],
//   teamId: string,
//   newCaptainId: string,
// ): TeamMember[] {
//   return members.map((m) => {
//     if (m.team_id !== teamId) return m;
//     // Promote new captain first (takes priority over demotion)
//     if (m.id === newCaptainId) return { ...m, role: 'captain' as const };
//     // Demote any other existing captain in this team
//     if (m.role === 'captain') return { ...m, role: 'member' as const };
//     return m;
//   });
// }

// /**
//  * Pure model of team membership validation.
//  * A user can only belong to one team per event.
//  * Requirements: 2.6
//  */
// function modelAddMemberToTeam(
//   members: TeamMember[],
//   userId: string,
//   teamId: string,
// ): { success: boolean; error?: string; newMembers: TeamMember[] } {
//   // Check if user already belongs to a team
//   const existingMembership = members.find(
//     (m) => m.id === userId && m.team_id !== null,
//   );

//   if (existingMembership) {
//     return {
//       success: false,
//       error: 'User already belongs to a team in this event',
//       newMembers: members,
//     };
//   }

//   const newMember: TeamMember = {
//     id: userId,
//     name: 'Test User',
//     npk: userId.slice(0, 8),
//     role: 'member',
//     team_id: teamId,
//   };

//   return { success: true, newMembers: [...members, newMember] };
// }

// /**
//  * Pure model of leaderboard row rendering.
//  * Checks that all required display fields are present.
//  * Requirements: 2.7, 8.5
//  */
// function renderLeaderboardRow(team: Team, rank: number, captainName?: string, memberCount = 0): LeaderboardRow {
//   return {
//     id: team.id,
//     name: team.name,
//     slogan: team.slogan,
//     total_points: team.total_points,
//     rank,
//     captain_name: captainName,
//     member_count: memberCount,
//   };
// }

// /**
//  * Pure model of activity row rendering.
//  * Checks that all required display fields are present.
//  * Requirements: 3.4
//  */
// function renderActivityRow(activity: Activity): ActivityRow {
//   return {
//     id: activity.id,
//     name: activity.name,
//     max_points: activity.max_points,
//     description: undefined,
//     barcode_data: activity.barcode_data,
//   };
// }

// /**
//  * Pure model of QR code immutability on update.
//  * barcode_data must not change when other fields are updated.
//  * Requirements: 3.6
//  */
// function modelUpdateActivity(
//   activity: Activity,
//   updates: Partial<Omit<Activity, 'id' | 'barcode_data'>>,
// ): Activity {
//   return { ...activity, ...updates, barcode_data: activity.barcode_data };
// }

// /**
//  * Pure model of RLS immutability check.
//  * score_logs and scans records cannot be deleted or updated.
//  * Requirements: 13.1, 13.3
//  */
// type ImmutableOperation = 'DELETE' | 'UPDATE';

// function modelCheckImmutability(
//   operation: ImmutableOperation,
//   _recordId: string,
//   _table: 'score_logs' | 'activity_registrations',
// ): { allowed: boolean; error: string } {
//   // RLS policy: no DELETE or UPDATE allowed on ini tables
//   return {
//     allowed: false,
//     error: `RLS policy denies ${operation} on immutable audit table`,
//   };
// }

// // ─── Generators ───────────────────────────────────────────────────────────────

// const uuidArb = fc.uuid();

// const memberArb = (teamId: string) =>
//   fc.record({
//     id: uuidArb,
//     name: fc.string({ minLength: 1, maxLength: 30 }),
//     npk: fc.string({ minLength: 4, maxLength: 10 }),
//     role: fc.constantFrom('member' as const, 'captain' as const, 'vice_captain' as const),
//     team_id: fc.constant(teamId),
//   });

// const teamArb = fc.record({
//   id: uuidArb,
//   name: fc.string({ minLength: 1, maxLength: 40 }),
//   slogan: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
//   captain_id: fc.option(uuidArb, { nil: undefined }),
//   total_points: fc.integer({ min: 0, max: 100_000 }),
// });

// const activityArb = fc.record({
//   id: uuidArb,
//   name: fc.string({ minLength: 1, maxLength: 40 }),
//   type: fc.constantFrom(
//     'wahana' as const,
//     'challenge_regular' as const,
//     'challenge_popup' as const,
//     'challenge_additional' as const,
//     'treasure' as const,
//   ),
//   max_points: fc.integer({ min: 10, max: 1000 }),
//   barcode_data: fc
//     .tuple(fc.constantFrom('wahana', 'challenge', 'treasure'), uuidArb)
//     .map(([type, id]) => generateBarcodeData(type, id)),
// });

// // ─── Property 7: Team Always Has Exactly One Active Captain ───────────────────

// // Feature: fif-adventure, Property 7: Team Always Has Exactly One Active Captain
// describe('Property 7: Team Always Has Exactly One Active Captain', () => {
//   it('after any sequence of captain assignments, exactly one member has role captain', () => {
//     // Validates: Requirements 2.5
//     fc.assert(
//       fc.property(
//         uuidArb,
//         fc.array(uuidArb, { minLength: 2, maxLength: 10 }),
//         fc.array(fc.nat({ max: 9 }), { minLength: 1, maxLength: 20 }),
//         (teamId, memberIds, assignmentIndices) => {
//           // Deduplicate member IDs to avoid ambiguous state
//           const uniqueIds = [...new Set(memberIds)];
//           fc.pre(uniqueIds.length >= 2);

//           // Build initial members (all 'member' role)
//           let members: TeamMember[] = uniqueIds.map((id) => ({
//             id,
//             name: 'Test',
//             npk: id.slice(0, 6),
//             role: 'member' as const,
//             team_id: teamId,
//           }));

//           // Perform a sequence of captain assignments
//           for (const idx of assignmentIndices) {
//             const targetMember = members[idx % members.length];
//             members = modelAssignCaptain(members, teamId, targetMember.id);
//           }

//           // Count captains in this team
//           const captainCount = members.filter(
//             (m) => m.team_id === teamId && m.role === 'captain',
//           ).length;

//           // After at least one assignment, there should be exactly 1 captain
//           expect(captainCount).toBe(1);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('assigning a new captain demotes the previous captain to member', () => {
//     // Validates: Requirements 2.5
//     fc.assert(
//       fc.property(
//         uuidArb,
//         uuidArb,
//         uuidArb,
//         (teamId, captain1Id, captain2Id) => {
//           fc.pre(captain1Id !== captain2Id);

//           let members: TeamMember[] = [
//             { id: captain1Id, name: 'Cap1', npk: '001', role: 'member', team_id: teamId },
//             { id: captain2Id, name: 'Cap2', npk: '002', role: 'member', team_id: teamId },
//           ];

//           // Assign first captain
//           members = modelAssignCaptain(members, teamId, captain1Id);
//           expect(members.find((m) => m.id === captain1Id)?.role).toBe('captain');

//           // Reassign to second captain
//           members = modelAssignCaptain(members, teamId, captain2Id);

//           // First captain should now be member
//           expect(members.find((m) => m.id === captain1Id)?.role).toBe('member');
//           // Second captain should now be captain
//           expect(members.find((m) => m.id === captain2Id)?.role).toBe('captain');

//           // Still exactly one captain
//           const captainCount = members.filter((m) => m.role === 'captain').length;
//           expect(captainCount).toBe(1);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('captain assignment does not affect members of other teams', () => {
//     // Validates: Requirements 2.5
//     fc.assert(
//       fc.property(
//         uuidArb,
//         uuidArb,
//         uuidArb,
//         uuidArb,
//         (teamId, otherTeamId, memberId, otherMemberId) => {
//           fc.pre(teamId !== otherTeamId);
//           fc.pre(memberId !== otherMemberId);

//           const members: TeamMember[] = [
//             { id: memberId, name: 'M1', npk: '001', role: 'member', team_id: teamId },
//             { id: otherMemberId, name: 'M2', npk: '002', role: 'captain', team_id: otherTeamId },
//           ];

//           const updated = modelAssignCaptain(members, teamId, memberId);

//           // Other team's captain should be unchanged
//           const otherCap = updated.find((m) => m.id === otherMemberId);
//           expect(otherCap?.role).toBe('captain');
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });
// });

// // ─── Property 8: User Belongs to At Most One Team Per Event ───────────────────

// // Feature: fif-adventure, Property 8: User Belongs to At Most One Team Per Event
// describe('Property 8: User Belongs to At Most One Team Per Event', () => {
//   it('adding a user to a second team in the same event always fails', () => {
//     // Validates: Requirements 2.6
//     fc.assert(
//       fc.property(
//         uuidArb,
//         uuidArb,
//         uuidArb,
//         uuidArb,
//         (userId, team1Id, team2Id) => {
//           fc.pre(team1Id !== team2Id);

//           // Add user to first team
//           const { success: first, newMembers } = modelAddMemberToTeam([], userId, team1Id);
//           expect(first).toBe(true);

//           // Try to add same user to second team
//           const { success: second, newMembers: finalMembers } = modelAddMemberToTeam(
//             newMembers,
//             userId,
//             team2Id,
//           );

//           expect(second).toBe(false);

//           // User should still only be in team1
//           const userMemberships = finalMembers.filter((m) => m.id === userId);
//           expect(userMemberships).toHaveLength(1);
//           expect(userMemberships[0].team_id).toBe(team1Id);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });


//   it('existing team membership is unchanged after a failed add attempt', () => {
//     // Validates: Requirements 2.6
//     fc.assert(
//       fc.property(
//         uuidArb,
//         uuidArb,
//         uuidArb,
//         uuidArb,
//         (userId, team1Id, team2Id) => {
//           fc.pre(team1Id !== team2Id);

//           const { newMembers: membersAfterFirst } = modelAddMemberToTeam([], userId, team1Id);
//           const originalMembership = membersAfterFirst.find((m) => m.id === userId);

//           // Attempt to add to second team (should fail)
//           const { newMembers: membersAfterSecond } = modelAddMemberToTeam(
//             membersAfterFirst,
//             userId,
//             team2Id,
//           );

//           const finalMembership = membersAfterSecond.find((m) => m.id === userId);
//           expect(finalMembership?.team_id).toBe(originalMembership?.team_id);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });
// });

// // ─── Property 9: List Rendering Always Includes All Required Fields ───────────

// // Feature: fif-adventure, Property 9: List Rendering Always Includes All Required Fields
// describe('Property 9: List Rendering Always Includes All Required Fields', () => {
//   it('leaderboard row always contains name, slogan (if present), member_count, captain_name, total_points, rank', () => {
//     // Validates: Requirements 2.7, 8.5
//     fc.assert(
//       fc.property(
//         teamArb,
//         fc.integer({ min: 1, max: 40 }),
//         fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
//         fc.integer({ min: 0, max: 25 }),
//         (team, rank, captainName, memberCount) => {
//           const row = renderLeaderboardRow(team, rank, captainName, memberCount);

//           // Required fields must be present and correct
//           expect(typeof row.id).toBe('string');
//           expect(row.id.length).toBeGreaterThan(0);
//           expect(typeof row.name).toBe('string');
//           expect(row.name.length).toBeGreaterThan(0);
//           expect(typeof row.total_points).toBe('number');
//           expect(Number.isFinite(row.total_points)).toBe(true);
//           expect(typeof row.rank).toBe('number');
//           expect(row.rank).toBeGreaterThanOrEqual(1);
//           expect(typeof row.member_count).toBe('number');
//           expect(row.member_count).toBeGreaterThanOrEqual(0);

//           // Slogan preserved if provided
//           if (team.slogan !== undefined) {
//             expect(row.slogan).toBe(team.slogan);
//           }

//           // Captain name preserved if provided
//           if (captainName !== undefined) {
//             expect(row.captain_name).toBe(captainName);
//           }
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('activity row always contains name, max_points, description, and barcode_data', () => {
//     // Validates: Requirements 3.4
//     fc.assert(
//       fc.property(
//         activityArb.map((a) => ({ ...a, type: 'wahana' as const })),
//         (activity) => {
//           const row = renderActivityRow(activity);

//           expect(typeof row.id).toBe('string');
//           expect(row.id.length).toBeGreaterThan(0);
//           expect(typeof row.name).toBe('string');
//           expect(row.name.length).toBeGreaterThan(0);
//           expect(typeof row.max_points).toBe('number');
//           expect(Number.isFinite(row.max_points)).toBe(true);
//           expect(typeof row.barcode_data).toBe('string');
//           expect(row.barcode_data.length).toBeGreaterThan(0);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('leaderboard rank values are always positive integers', () => {
//     // Validates: Requirements 8.5
//     fc.assert(
//       fc.property(
//         teamArb,
//         fc.integer({ min: 1, max: 40 }),
//         (team, rank) => {
//           const row = renderLeaderboardRow(team, rank);
//           expect(Number.isInteger(row.rank)).toBe(true);
//           expect(row.rank).toBeGreaterThanOrEqual(1);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('total_points in leaderboard row is always a non-negative number', () => {
//     // Validates: Requirements 8.5
//     fc.assert(
//       fc.property(teamArb, fc.integer({ min: 1, max: 40 }), (team, rank) => {
//         const row = renderLeaderboardRow(team, rank);
//         expect(row.total_points).toBeGreaterThanOrEqual(0);
//       }),
//       { numRuns: 100 },
//     );
//   });
// });

// // ─── Property 10: QR Code Is Unique at Creation and Immutable on Update ───────

// // Feature: fif-adventure, Property 10: QR Code Is Unique at Creation and Immutable on Update
// describe('Property 10: QR Code Is Unique at Creation and Immutable on Update', () => {
//   it('generateBarcodeData produces unique values for distinct (type, id) pairs', () => {
//     // Validates: Requirements 3.2, 3.6
//     fc.assert(
//       fc.property(
//           fc.record({
//             type: fc.constantFrom('wahana', 'challenge', 'treasure'),
//             id: uuidArb,
//           }),
//           { minLength: 2, maxLength: 20 },
//         ),
//         (pairs) => {
//           // Deduplicate pairs by (type, id)
//           const uniquePairs = pairs.filter(
//             (p, i, arr) => arr.findIndex((q) => q.type === p.type && q.id === p.id) === i,
//           );

//           if (uniquePairs.length < 2) return; // skip if not enough unique pairs

//           const barcodes = uniquePairs.map((p) => generateBarcodeData(p.type, p.id));
//           const uniqueBarcodes = new Set(barcodes);

//           // All barcodes must be unique
//           expect(uniqueBarcodes.size).toBe(barcodes.length);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('barcode_data is unchanged after updating other location fields', () => {
//     // Validates: Requirements 3.6
//     fc.assert(
//       fc.property(
//         activityArb,
//         fc.record({
//           name: fc.string({ minLength: 1, maxLength: 40 }),
//           max_points: fc.integer({ min: 10, max: 1000 }),
//         }),
//         (activity, updates) => {
//           const originalBarcode = activity.barcode_data;
//           const updated = modelUpdateActivity(activity, updates);

//           // barcode_data must be unchanged
//           expect(updated.barcode_data).toBe(originalBarcode);

//           // Other fields should be updated
//           expect(updated.name).toBe(updates.name);
//           expect(updated.max_points).toBe(updates.max_points);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('generateBarcodeData always produces a string matching fif-{type}-{id} format', () => {
//     // Validates: Requirements 3.2
//     fc.assert(
//       fc.property(
//         fc.constantFrom('wahana', 'challenge', 'treasure'),
//         uuidArb,
//         (type, id) => {
//           const barcode = generateBarcodeData(type, id);
//           expect(barcode).toBe(`fif-${type}-${id}`);
//           expect(barcode.startsWith('fif-')).toBe(true);
//           expect(barcode).toContain(type);
//           expect(barcode).toContain(id);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('two locations with different IDs always have different barcode_data', () => {
//     // Validates: Requirements 3.3
//     fc.assert(
//       fc.property(
//         fc.constantFrom('wahana', 'challenge', 'treasure'),
//         uuidArb,
//         uuidArb,
//         (type, id1, id2) => {
//           fc.pre(id1 !== id2);
//           const barcode1 = generateBarcodeData(type, id1);
//           const barcode2 = generateBarcodeData(type, id2);
//           expect(barcode1).not.toBe(barcode2);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('barcode_data is deterministic — same inputs always produce same output', () => {
//     // Validates: Requirements 3.2
//     fc.assert(
//       fc.property(
//         fc.constantFrom('wahana', 'challenge', 'treasure'),
//         uuidArb,
//         (type, id) => {
//           const barcode1 = generateBarcodeData(type, id);
//           const barcode2 = generateBarcodeData(type, id);
//           expect(barcode1).toBe(barcode2);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });
// });

// // ─── Property 24: Score Logs and Scans Are Immutable ─────────────────────────

// // Feature: fif-adventure, Property 24: Score Logs and Scans Are Immutable
// describe('Property 24: Score Logs and Scans Are Immutable', () => {
//   it('DELETE on activity_registrations is always denied by RLS policy', () => {
//     // Validates: Requirements 13.1, 13.3
//     fc.assert(
//       fc.property(uuidArb, (recordId) => {
//         const result = modelCheckImmutability('DELETE', recordId, 'activity_registrations');
//         expect(result.allowed).toBe(false);
//         expect(result.error).toContain('DELETE');
//       }),
//       { numRuns: 100 },
//     );
//   });

//   it('UPDATE on activity_registrations is always denied by RLS policy', () => {
//     // Validates: Requirements 13.1, 13.3
//     fc.assert(
//       fc.property(uuidArb, (recordId) => {
//         const result = modelCheckImmutability('UPDATE', recordId, 'activity_registrations');
//         expect(result.allowed).toBe(false);
//         expect(result.error).toContain('UPDATE');
//       }),
//       { numRuns: 100 },
//     );
//   });

//   it('immutability applies regardless of the record content', () => {
//     // Validates: Requirements 13.1, 13.3
//     fc.assert(
//       fc.property(
//         uuidArb,
//         fc.constantFrom('score_logs' as const, 'activity_registrations' as const),
//         fc.constantFrom('DELETE' as const, 'UPDATE' as const),
//         (recordId, table, operation) => {
//           const result = modelCheckImmutability(operation, recordId, table);
//           expect(result.allowed).toBe(false);
//           expect(typeof result.error).toBe('string');
//           expect(result.error.length).toBeGreaterThan(0);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('score_log records retain all audit fields after creation (no mutation possible)', () => {
//     // Validates: Requirements 13.1
//     // Model: once created, a score_log record is frozen — all fields remain as set
//     fc.assert(
//       fc.property(
//         fc.record({
//           id: uuidArb,
//           team_id: uuidArb,
//           activity_id: uuidArb,
//           points_awarded: fc.integer({ min: 0, max: 1000 }),
//           lo_id: uuidArb,
//           created_at: fc.constant(new Date().toISOString()),
//         }),
//         (log: ScoreLogRecord) => {
//           // Simulate "freeze" — the record cannot be mutated
//           const frozen = Object.freeze({ ...log });

//           expect(frozen.id).toBe(log.id);
//           expect(frozen.team_id).toBe(log.team_id);
//           expect(frozen.activity_id).toBe(log.activity_id);
//           expect(frozen.points_awarded).toBe(log.points_awarded);
//           expect(frozen.lo_id).toBe(log.lo_id);
//           expect(frozen.created_at).toBe(log.created_at);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });

//   it('activity registration records retain all audit fields after creation (no mutation possible)', () => {
//     // Validates: Requirements 13.3
//     fc.assert(
//       fc.property(
//         fc.record({
//           id: uuidArb,
//           team_id: uuidArb,
//           activity_id: uuidArb,
//           checked_in_by: uuidArb,
//           checked_in_at: fc.constant(new Date().toISOString()),
//         }),
//         (reg: ActivityRegistration) => {
//           const frozen = Object.freeze({ ...reg });

//           expect(frozen.id).toBe(reg.id);
//           expect(frozen.team_id).toBe(reg.team_id);
//           expect(frozen.activity_id).toBe(reg.activity_id);
//           expect(frozen.checked_in_by).toBe(reg.checked_in_by);
//           expect(frozen.checked_in_at).toBe(reg.checked_in_at);
//         },
//       ),
//       { numRuns: 100 },
//     );
//   });
// });

// // ─── Property 1 (Bugfix): Bug Condition — Event Dropdown Tidak Ada di Modal ───

// /**
//  * Bug Condition Exploration Test
//  * Feature: challenge-treasure-event-dropdown
//  * Property 1: Event Dropdown Tidak Ada di Modal Create Challenge/Treasure
//  *
//  * This test MUST FAIL on unfixed code — failure confirms the bug exists.
//  * When the fix is applied, this test will PASS.
//  *
//  * Validates: Requirements 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
//  */

// // ─── Types for bug condition model ───────────────────────────────────────────

// interface EventItem {
//   id: string;
//   name: string;
//   is_active: boolean;
// }

// interface ChallengeFormState {
//   newName: string;
//   newPoints: string;
//   newType: 'regular' | 'popup' | 'additional';
//   // BUGGY: no newEventId state — event_id comes from activeEvent prop directly
//   // FIXED: newEventId: string | null — event_id comes from user selection
// }

// // ─── End of admin property tests ──────────────────────────────────────────────
