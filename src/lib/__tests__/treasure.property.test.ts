/**
 * Property-based tests for treasure hunt claim logic.
 * Feature: fif-adventure
 * Uses fast-check with minimum 100 iterations per property.
 *
 * These tests model the pure logic of the claim_treasure PostgreSQL function
 * and the surrounding API validation, exercising the invariants that must hold
 * regardless of input values.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Pure model of the claim_treasure logic ───────────────────────────────────
//
// This mirrors the PostgreSQL function claim_treasure() and the surrounding
// API validation so we can property-test the invariants without a live DB.

interface TreasureHunt {
  id: string;
  name: string;
  hint_text: string;
  points: number;
  quota: number;
  remaining_quota: number;
  barcode_data: string;
}

interface TreasureHuntClaim {
  id: string;
  team_id: string;
  treasure_hunt_id: string;
  claimed_by: string;
  claimed_at: string;
}

interface TreasureHuntHint {
  team_id: string;
  treasure_hunt_id: string;
}

interface ClaimResult {
  success: boolean;
  message: string;
  quota_remaining?: number;
}

/**
 * Pure model of the atomic claim_treasure logic.
 * Mirrors the PostgreSQL function: checks duplicate, checks quota, inserts scan.
 * Returns the ClaimResult and the updated scans array (immutable-style).
 */
function modelClaimTreasure(
  teamId: string,
  treasure: TreasureHunt,
  claimedBy: string,
  existingClaims: TreasureHuntClaim[],
  hints: TreasureHuntHint[],
): { result: ClaimResult; newClaims: TreasureHuntClaim[] } {
  // Check if team has hint
  const hasHint = hints.some(
    (h) => h.team_id === teamId && h.treasure_hunt_id === treasure.id,
  );
  if (!hasHint) {
    return {
      result: { success: false, message: 'No hint for this treasure' },
      newClaims: existingClaims,
    };
  }

  // Check duplicate
  const alreadyClaimed = existingClaims.some(
    (c) => c.team_id === teamId && c.treasure_hunt_id === treasure.id,
  );
  if (alreadyClaimed) {
    return {
      result: { success: false, message: 'Already claimed by your team' },
      newClaims: existingClaims,
    };
  }

  // Check quota
  const claimCount = existingClaims.filter((c) => c.treasure_hunt_id === treasure.id).length;
  const quotaRemaining = treasure.quota - claimCount;
  if (quotaRemaining <= 0) {
    return {
      result: { success: false, message: 'Quota exhausted' },
      newClaims: existingClaims,
    };
  }

  // Insert claim
  const newClaim: TreasureHuntClaim = {
    id: `claim-${Math.random()}`,
    team_id: teamId,
    treasure_hunt_id: treasure.id,
    claimed_by: claimedBy,
    claimed_at: new Date().toISOString(),
  };

  return {
    result: {
      success: true,
      message: 'Treasure claimed!',
      quota_remaining: quotaRemaining - 1,
    },
    newClaims: [...existingClaims, newClaim],
  };
}

/**
 * Simulate N concurrent claim attempts for the same location.
 * Returns the final scans array after all attempts.
 */
function simulateConcurrentClaims(
  teamIds: string[],
  treasure: TreasureHunt,
  claimedBy: string,
): { successCount: number; finalClaims: TreasureHuntClaim[] } {
  // Simulate sequential execution (the DB serialises concurrent claims via FOR UPDATE)
  let claims: TreasureHuntClaim[] = [];
  let successCount = 0;

  // For concurrency test, assume everyone has a hint
  const hints: TreasureHuntHint[] = teamIds.map((id) => ({
    team_id: id,
    treasure_hunt_id: treasure.id,
  }));

  for (const teamId of teamIds) {
    const { result, newClaims } = modelClaimTreasure(teamId, treasure, claimedBy, claims, hints);
    claims = newClaims;
    if (result.success) successCount++;
  }

  return { successCount, finalClaims: claims };
}

/**
 * Pure model of the API-level barcode validation.
 * Returns an error string if the barcode is invalid, or null if valid.
 */
function validateBarcode(
  barcodeData: string,
  treasures: TreasureHunt[],
): string | null {
  const treasure = treasures.find((t) => t.barcode_data === barcodeData);
  if (!treasure) return 'Treasure tidak ditemukan';
  return null;
}

/**
 * Checks whether a scan record has all required audit fields non-null.
 */
function hasCompleteAuditRecord(claim: TreasureHuntClaim): boolean {
  return (
    typeof claim.team_id === 'string' &&
    claim.team_id.length > 0 &&
    typeof claim.treasure_hunt_id === 'string' &&
    claim.treasure_hunt_id.length > 0 &&
    typeof claim.claimed_by === 'string' &&
    claim.claimed_by.length > 0 &&
    typeof claim.claimed_at === 'string' &&
    claim.claimed_at.length > 0
  );
}

// ─── Generators ───────────────────────────────────────────────────────────────

const uuidArb = fc.uuid();

/** Arbitrary for a valid treasure hunt */
const treasureHuntArb = fc.record({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  hint_text: fc.string({ minLength: 10, maxLength: 200 }),
  points: fc.integer({ min: 10, max: 500 }),
  quota: fc.integer({ min: 1, max: 20 }),
  remaining_quota: fc.integer({ min: 0, max: 20 }),
  barcode_data: fc
    .tuple(fc.constant('treasure'), uuidArb)
    .map(([type, id]) => `fif-${type}-${id}`),
});

/** Arbitrary for a list of distinct team IDs */
const teamIdsArb = (minLength: number, maxLength: number) =>
  fc
    .array(uuidArb, { minLength, maxLength })
    .map((ids) => [...new Set(ids)]) // deduplicate
    .filter((ids) => ids.length >= minLength);

// ─── Property 11: Treasure Quota Is Strictly Enforced Under Concurrency ───────

// Feature: fif-adventure, Property 11: Treasure Quota Is Strictly Enforced Under Concurrency
describe('Property 11: Treasure Quota Is Strictly Enforced Under Concurrency', () => {
  it('total successful claims never exceeds quota Q for any N concurrent attempts', () => {
    // Validates: Requirements 5.3, 6.3
    fc.assert(
      fc.property(
        treasureHuntArb,
        teamIdsArb(1, 30),
        uuidArb,
        (treasure, teamIds, claimedBy) => {
          const { successCount } = simulateConcurrentClaims(teamIds, treasure, claimedBy);
          expect(successCount).toBeLessThanOrEqual(treasure.quota);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('exactly min(N, Q) claims succeed when N distinct teams attempt to claim quota Q', () => {
    // Validates: Requirements 5.3, 6.3
    fc.assert(
      fc.property(
        treasureHuntArb,
        teamIdsArb(1, 30),
        uuidArb,
        (treasure, teamIds, claimedBy) => {
          const N = teamIds.length;
          const Q = treasure.quota;
          const { successCount } = simulateConcurrentClaims(teamIds, treasure, claimedBy);
          expect(successCount).toBe(Math.min(N, Q));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('quota_remaining in the last successful claim result is always 0 when quota is exactly exhausted', () => {
    // Validates: Requirements 5.3, 6.3
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }).chain((quota) =>
          fc.record({
            treasure: treasureHuntArb.map((t) => ({ ...t, quota })),
            // Use exactly quota distinct teams so quota is fully exhausted
            teamIds: teamIdsArb(quota, quota),
            claimedBy: uuidArb,
          }),
        ),
        ({ treasure, teamIds, claimedBy }) => {
          let claims: TreasureHuntClaim[] = [];
          let lastSuccessResult: ClaimResult | null = null;
          const hints: TreasureHuntHint[] = teamIds.map((id) => ({
            team_id: id,
            treasure_hunt_id: treasure.id,
          }));

          for (const teamId of teamIds) {
            const { result, newClaims } = modelClaimTreasure(teamId, treasure, claimedBy, claims, hints);
            claims = newClaims;
            if (result.success) lastSuccessResult = result;
          }

          // The last successful claim should report quota_remaining = 0
          if (lastSuccessResult) {
            expect(lastSuccessResult.quota_remaining).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 12: Each (Team, Location) Pair Can Only Be Scanned Once ─────────

// Feature: fif-adventure, Property 12: Each (Team, Location) Pair Can Only Be Scanned Once
describe('Property 12: Each (Team, Location) Pair Can Only Be Scanned Once', () => {
  it('duplicate claim by the same team is always rejected', () => {
    // Validates: Requirements 5.4, 6.4
    fc.assert(
      fc.property(
        treasureHuntArb,
        uuidArb,
        uuidArb,
        (treasure, teamId, claimedBy) => {
          const hints: TreasureHuntHint[] = [{ team_id: teamId, treasure_hunt_id: treasure.id }];
          // First claim
          const { result: first, newClaims: claimsAfterFirst } = modelClaimTreasure(
            teamId,
            treasure,
            claimedBy,
            [],
            hints,
          );
          expect(first.success).toBe(true);

          // Second claim by the same team
          const { result: second, newClaims: claimsAfterSecond } = modelClaimTreasure(
            teamId,
            treasure,
            claimedBy,
            claimsAfterFirst,
            hints,
          );
          expect(second.success).toBe(false);
          expect(second.message).toContain('Already');

          // No additional claim record was created
          expect(claimsAfterSecond.length).toBe(claimsAfterFirst.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('claim count for a (team, treasure) pair never exceeds 1 after any number of attempts', () => {
    // Validates: Requirements 5.4, 6.4
    fc.assert(
      fc.property(
        treasureHuntArb,
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 10 }),
        (treasure, teamId, claimedBy, attempts) => {
          let claims: TreasureHuntClaim[] = [];
          const hints: TreasureHuntHint[] = [{ team_id: teamId, treasure_hunt_id: treasure.id }];

          for (let i = 0; i < attempts; i++) {
            const { newClaims } = modelClaimTreasure(teamId, treasure, claimedBy, claims, hints);
            claims = newClaims;
          }

          const pairCount = claims.filter(
            (c) => c.team_id === teamId && c.treasure_hunt_id === treasure.id,
          ).length;
          expect(pairCount).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 13: Treasure Quota Cannot Be Reduced Below Existing Claim Count ─

// Feature: fif-adventure, Property 13: Treasure Quota Cannot Be Reduced Below Existing Claim Count
describe('Property 13: Treasure Quota Cannot Be Reduced Below Existing Claim Count', () => {
  /**
   * Pure model of quota update validation.
   * Returns true if the new quota is valid (>= existing claim count), false otherwise.
   */
  function validateQuotaUpdate(newQuota: number, existingClaimCount: number): boolean {
    return newQuota >= existingClaimCount;
  }

  it('setting quota to any value less than existing claim count always fails', () => {
    // Validates: Requirements 5.6
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (claimCount, reduction) => {
          const newQuota = claimCount - reduction; // always < claimCount
          expect(validateQuotaUpdate(newQuota, claimCount)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('setting quota to exactly the existing claim count always succeeds', () => {
    // Validates: Requirements 5.6
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (claimCount) => {
        expect(validateQuotaUpdate(claimCount, claimCount)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('setting quota to any value greater than existing claim count always succeeds', () => {
    // Validates: Requirements 5.6
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (claimCount, excess) => {
          const newQuota = claimCount + excess; // always > claimCount
          expect(validateQuotaUpdate(newQuota, claimCount)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('after N successful claims, only quotas >= N are accepted', () => {
    // Validates: Requirements 5.6
    fc.assert(
      fc.property(
        treasureHuntArb,
        teamIdsArb(1, 15),
        uuidArb,
        (treasure, teamIds, claimedBy) => {
          // Perform as many claims as possible (up to quota)
          let claims: TreasureHuntClaim[] = [];
          const hints: TreasureHuntHint[] = teamIds.map((id) => ({
            team_id: id,
            treasure_hunt_id: treasure.id,
          }));
          for (const teamId of teamIds) {
            const { newClaims } = modelClaimTreasure(teamId, treasure, claimedBy, claims, hints);
            claims = newClaims;
          }

          const claimCount = claims.filter((c) => c.treasure_hunt_id === treasure.id).length;

          // Any quota < claimCount must be rejected
          if (claimCount > 0) {
            expect(validateQuotaUpdate(claimCount - 1, claimCount)).toBe(false);
          }
          // Any quota >= claimCount must be accepted
          expect(validateQuotaUpdate(claimCount, claimCount)).toBe(true);
          expect(validateQuotaUpdate(claimCount + 1, claimCount)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 14: Invalid QR Codes Are Always Rejected ────────────────────────

// Feature: fif-adventure, Property 14: Invalid QR Codes Are Always Rejected
describe('Property 14: Invalid QR Codes Are Always Rejected', () => {
  /** Arbitrary for a barcode string that is NOT in the locations list */
  const unknownBarcodeArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => !s.startsWith('fif-'));

  it('barcode not present in treasures always returns an error', () => {
    // Validates: Requirements 6.5
    fc.assert(
      fc.property(
        unknownBarcodeArb,
        fc.array(treasureHuntArb, { minLength: 0, maxLength: 5 }),
        (unknownBarcode, treasures) => {
          const error = validateBarcode(unknownBarcode, treasures);
          expect(error).not.toBeNull();
          expect(typeof error).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid active barcode returns null (no error)', () => {
    // Validates: Requirements 6.5
    fc.assert(
      fc.property(
        treasureHuntArb,
        fc.array(treasureHuntArb, { minLength: 0, maxLength: 4 }),
        (activeTreasure, otherTreasures) => {
          const allTreasures = [...otherTreasures, activeTreasure];
          const error = validateBarcode(activeTreasure.barcode_data, allTreasures);
          expect(error).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty barcode string always returns an error', () => {
    // Validates: Requirements 6.5
    fc.assert(
      fc.property(
        fc.array(treasureHuntArb, { minLength: 0, maxLength: 5 }),
        (treasures) => {
          const error = validateBarcode('', treasures);
          expect(error).not.toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 15: Every Successful Scan Creates a Complete Audit Record ────────

// Feature: fif-adventure, Property 15: Every Successful Scan Creates a Complete Audit Record
describe('Property 15: Every Successful Scan Creates a Complete Audit Record', () => {
  it('every claim record created by a successful claim has all required audit fields non-null', () => {
    // Validates: Requirements 6.6, 13.2
    fc.assert(
      fc.property(
        treasureHuntArb,
        uuidArb,
        uuidArb,
        (treasure, teamId, claimedBy) => {
          const hints: TreasureHuntHint[] = [{ team_id: teamId, treasure_hunt_id: treasure.id }];
          const { result, newClaims } = modelClaimTreasure(teamId, treasure, claimedBy, [], hints);

          expect(result.success).toBe(true);

          // Find the newly created claim record
          const newClaim = newClaims.find(
            (c) => c.team_id === teamId && c.treasure_hunt_id === treasure.id,
          );

          expect(newClaim).toBeDefined();
          if (newClaim) {
            expect(hasCompleteAuditRecord(newClaim)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('claim record contains the correct team_id, treasure_hunt_id, and claimed_by values', () => {
    // Validates: Requirements 6.6, 13.2
    fc.assert(
      fc.property(
        treasureHuntArb,
        uuidArb,
        uuidArb,
        (treasure, teamId, claimedBy) => {
          const hints: TreasureHuntHint[] = [{ team_id: teamId, treasure_hunt_id: treasure.id }];
          const { newClaims } = modelClaimTreasure(teamId, treasure, claimedBy, [], hints);

          const claim = newClaims.find(
            (c) => c.team_id === teamId && c.treasure_hunt_id === treasure.id,
          );

          expect(claim).toBeDefined();
          if (claim) {
            expect(claim.team_id).toBe(teamId);
            expect(claim.treasure_hunt_id).toBe(treasure.id);
            expect(claim.claimed_by).toBe(claimedBy);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('failed claims (duplicate or quota exhausted) never create a claim record', () => {
    // Validates: Requirements 6.6, 13.2
    fc.assert(
      fc.property(
        // Treasure with quota 1 so second claim exhausts quota
        treasureHuntArb.map((t) => ({ ...t, quota: 1 })),
        uuidArb,
        uuidArb,
        uuidArb,
        (treasure, teamId1, teamId2, claimedBy) => {
          const hints: TreasureHuntHint[] = [
            { team_id: teamId1, treasure_hunt_id: treasure.id },
            { team_id: teamId2, treasure_hunt_id: treasure.id },
          ];
          // First claim succeeds
          const { newClaims: claimsAfterFirst } = modelClaimTreasure(
            teamId1,
            treasure,
            claimedBy,
            [],
            hints,
          );
          const countAfterFirst = claimsAfterFirst.length;

          // Duplicate claim by same team — should fail
          const { result: dupResult, newClaims: claimsAfterDup } = modelClaimTreasure(
            teamId1,
            treasure,
            claimedBy,
            claimsAfterFirst,
            hints,
          );
          expect(dupResult.success).toBe(false);
          expect(claimsAfterDup.length).toBe(countAfterFirst); // no new record

          // Quota exhausted claim by different team — should fail
          const { result: quotaResult, newClaims: claimsAfterQuota } = modelClaimTreasure(
            teamId2,
            treasure,
            claimedBy,
            claimsAfterFirst,
            hints,
          );
          expect(quotaResult.success).toBe(false);
          expect(claimsAfterQuota.length).toBe(countAfterFirst); // no new record
        },
      ),
      { numRuns: 100 },
    );
  });

  it('claimed_at field is always a valid ISO 8601 date string', () => {
    // Validates: Requirements 6.6, 13.2
    fc.assert(
      fc.property(
        treasureHuntArb,
        uuidArb,
        uuidArb,
        (treasure, teamId, claimedBy) => {
          const hints: TreasureHuntHint[] = [{ team_id: teamId, treasure_hunt_id: treasure.id }];
          const { newClaims } = modelClaimTreasure(teamId, treasure, claimedBy, [], hints);

          const claim = newClaims.find(
            (c) => c.team_id === teamId && c.treasure_hunt_id === treasure.id,
          );

          expect(claim).toBeDefined();
          if (claim) {
            const parsed = new Date(claim.claimed_at);
            expect(isNaN(parsed.getTime())).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
