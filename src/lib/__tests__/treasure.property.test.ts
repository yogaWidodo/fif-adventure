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

interface Location {
  id: string;
  barcode_data: string;
  is_active: boolean;
  quota: number;
  points: number;
  type: 'wahana' | 'challenge' | 'treasure';
}

interface ScanRecord {
  team_id: string;
  location_id: string;
  scanned_by: string;
  scanned_at: string;
  points_awarded: number;
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
  location: Location,
  scannedBy: string,
  existingScans: ScanRecord[],
): { result: ClaimResult; newScans: ScanRecord[] } {
  // Check duplicate
  const alreadyClaimed = existingScans.some(
    (s) => s.team_id === teamId && s.location_id === location.id,
  );
  if (alreadyClaimed) {
    return {
      result: { success: false, message: 'Already claimed by your team' },
      newScans: existingScans,
    };
  }

  // Check quota
  const claimCount = existingScans.filter((s) => s.location_id === location.id).length;
  const quotaRemaining = location.quota - claimCount;
  if (quotaRemaining <= 0) {
    return {
      result: { success: false, message: 'Quota exhausted' },
      newScans: existingScans,
    };
  }

  // Insert scan
  const newScan: ScanRecord = {
    team_id: teamId,
    location_id: location.id,
    scanned_by: scannedBy,
    scanned_at: new Date().toISOString(),
    points_awarded: location.points,
  };

  return {
    result: {
      success: true,
      message: 'Treasure claimed!',
      quota_remaining: quotaRemaining - 1,
    },
    newScans: [...existingScans, newScan],
  };
}

/**
 * Simulate N concurrent claim attempts for the same location.
 * Returns the final scans array after all attempts.
 */
function simulateConcurrentClaims(
  teamIds: string[],
  location: Location,
  scannedBy: string,
): { successCount: number; finalScans: ScanRecord[] } {
  // Simulate sequential execution (the DB serialises concurrent claims via FOR UPDATE)
  let scans: ScanRecord[] = [];
  let successCount = 0;

  for (const teamId of teamIds) {
    const { result, newScans } = modelClaimTreasure(teamId, location, scannedBy, scans);
    scans = newScans;
    if (result.success) successCount++;
  }

  return { successCount, finalScans: scans };
}

/**
 * Pure model of the API-level barcode validation.
 * Returns an error string if the barcode is invalid, or null if valid.
 */
function validateBarcode(
  barcodeData: string,
  locations: Location[],
): string | null {
  const location = locations.find((l) => l.barcode_data === barcodeData);
  if (!location) return 'Lokasi tidak ditemukan';
  if (!location.is_active) return 'Lokasi tidak aktif';
  return null;
}

/**
 * Checks whether a scan record has all required audit fields non-null.
 */
function hasCompleteAuditRecord(scan: ScanRecord): boolean {
  return (
    typeof scan.team_id === 'string' &&
    scan.team_id.length > 0 &&
    typeof scan.location_id === 'string' &&
    scan.location_id.length > 0 &&
    typeof scan.scanned_by === 'string' &&
    scan.scanned_by.length > 0 &&
    typeof scan.scanned_at === 'string' &&
    scan.scanned_at.length > 0 &&
    typeof scan.points_awarded === 'number'
  );
}

// ─── Generators ───────────────────────────────────────────────────────────────

const uuidArb = fc.uuid();

/** Arbitrary for a valid treasure location */
const treasureLocationArb = fc.record({
  id: uuidArb,
  barcode_data: fc
    .tuple(fc.constantFrom('wahana', 'challenge', 'treasure'), uuidArb)
    .map(([type, id]) => `fif-${type}-${id}`),
  is_active: fc.constant(true),
  quota: fc.integer({ min: 1, max: 20 }),
  points: fc.integer({ min: 10, max: 500 }),
  type: fc.constant('treasure' as const),
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
        treasureLocationArb,
        teamIdsArb(1, 30),
        uuidArb,
        (location, teamIds, scannedBy) => {
          const { successCount } = simulateConcurrentClaims(teamIds, location, scannedBy);
          expect(successCount).toBeLessThanOrEqual(location.quota);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('exactly min(N, Q) claims succeed when N distinct teams attempt to claim quota Q', () => {
    // Validates: Requirements 5.3, 6.3
    fc.assert(
      fc.property(
        treasureLocationArb,
        teamIdsArb(1, 30),
        uuidArb,
        (location, teamIds, scannedBy) => {
          const N = teamIds.length;
          const Q = location.quota;
          const { successCount } = simulateConcurrentClaims(teamIds, location, scannedBy);
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
            location: treasureLocationArb.map((l) => ({ ...l, quota })),
            // Use exactly quota distinct teams so quota is fully exhausted
            teamIds: teamIdsArb(quota, quota),
            scannedBy: uuidArb,
          }),
        ),
        ({ location, teamIds, scannedBy }) => {
          let scans: ScanRecord[] = [];
          let lastSuccessResult: ClaimResult | null = null;

          for (const teamId of teamIds) {
            const { result, newScans } = modelClaimTreasure(teamId, location, scannedBy, scans);
            scans = newScans;
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
        treasureLocationArb,
        uuidArb,
        uuidArb,
        (location, teamId, scannedBy) => {
          // First claim
          const { result: first, newScans: scansAfterFirst } = modelClaimTreasure(
            teamId,
            location,
            scannedBy,
            [],
          );
          expect(first.success).toBe(true);

          // Second claim by the same team
          const { result: second, newScans: scansAfterSecond } = modelClaimTreasure(
            teamId,
            location,
            scannedBy,
            scansAfterFirst,
          );
          expect(second.success).toBe(false);
          expect(second.message).toContain('Already');

          // No additional scan record was created
          expect(scansAfterSecond.length).toBe(scansAfterFirst.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scan count for a (team, location) pair never exceeds 1 after any number of attempts', () => {
    // Validates: Requirements 5.4, 6.4
    fc.assert(
      fc.property(
        treasureLocationArb,
        uuidArb,
        uuidArb,
        fc.integer({ min: 1, max: 10 }),
        (location, teamId, scannedBy, attempts) => {
          let scans: ScanRecord[] = [];

          for (let i = 0; i < attempts; i++) {
            const { newScans } = modelClaimTreasure(teamId, location, scannedBy, scans);
            scans = newScans;
          }

          const pairCount = scans.filter(
            (s) => s.team_id === teamId && s.location_id === location.id,
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
        treasureLocationArb,
        teamIdsArb(1, 15),
        uuidArb,
        (location, teamIds, scannedBy) => {
          // Perform as many claims as possible (up to quota)
          let scans: ScanRecord[] = [];
          for (const teamId of teamIds) {
            const { newScans } = modelClaimTreasure(teamId, location, scannedBy, scans);
            scans = newScans;
          }

          const claimCount = scans.filter((s) => s.location_id === location.id).length;

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

  it('barcode not present in locations always returns an error', () => {
    // Validates: Requirements 6.5
    fc.assert(
      fc.property(
        unknownBarcodeArb,
        fc.array(treasureLocationArb, { minLength: 0, maxLength: 5 }),
        (unknownBarcode, locations) => {
          const error = validateBarcode(unknownBarcode, locations);
          expect(error).not.toBeNull();
          expect(typeof error).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('barcode belonging to an inactive location always returns an error', () => {
    // Validates: Requirements 6.5
    fc.assert(
      fc.property(
        treasureLocationArb.map((l) => ({ ...l, is_active: false })),
        fc.array(treasureLocationArb, { minLength: 0, maxLength: 4 }),
        (inactiveLocation, otherLocations) => {
          const allLocations = [...otherLocations, inactiveLocation];
          const error = validateBarcode(inactiveLocation.barcode_data, allLocations);
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
        treasureLocationArb, // is_active: true by default in our arb
        fc.array(treasureLocationArb, { minLength: 0, maxLength: 4 }),
        (activeLocation, otherLocations) => {
          const allLocations = [...otherLocations, activeLocation];
          const error = validateBarcode(activeLocation.barcode_data, allLocations);
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
        fc.array(treasureLocationArb, { minLength: 0, maxLength: 5 }),
        (locations) => {
          const error = validateBarcode('', locations);
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
  it('every scan record created by a successful claim has all required audit fields non-null', () => {
    // Validates: Requirements 6.6, 13.2
    fc.assert(
      fc.property(
        treasureLocationArb,
        uuidArb,
        uuidArb,
        (location, teamId, scannedBy) => {
          const { result, newScans } = modelClaimTreasure(teamId, location, scannedBy, []);

          expect(result.success).toBe(true);

          // Find the newly created scan record
          const newScan = newScans.find(
            (s) => s.team_id === teamId && s.location_id === location.id,
          );

          expect(newScan).toBeDefined();
          if (newScan) {
            expect(hasCompleteAuditRecord(newScan)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scan record contains the correct team_id, location_id, and scanned_by values', () => {
    // Validates: Requirements 6.6, 13.2
    fc.assert(
      fc.property(
        treasureLocationArb,
        uuidArb,
        uuidArb,
        (location, teamId, scannedBy) => {
          const { newScans } = modelClaimTreasure(teamId, location, scannedBy, []);

          const scan = newScans.find(
            (s) => s.team_id === teamId && s.location_id === location.id,
          );

          expect(scan).toBeDefined();
          if (scan) {
            expect(scan.team_id).toBe(teamId);
            expect(scan.location_id).toBe(location.id);
            expect(scan.scanned_by).toBe(scannedBy);
            expect(scan.points_awarded).toBe(location.points);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('failed claims (duplicate or quota exhausted) never create a scan record', () => {
    // Validates: Requirements 6.6, 13.2
    fc.assert(
      fc.property(
        // Location with quota 1 so second claim exhausts quota
        treasureLocationArb.map((l) => ({ ...l, quota: 1 })),
        uuidArb,
        uuidArb,
        uuidArb,
        (location, teamId1, teamId2, scannedBy) => {
          // First claim succeeds
          const { newScans: scansAfterFirst } = modelClaimTreasure(
            teamId1,
            location,
            scannedBy,
            [],
          );
          const countAfterFirst = scansAfterFirst.length;

          // Duplicate claim by same team — should fail
          const { result: dupResult, newScans: scansAfterDup } = modelClaimTreasure(
            teamId1,
            location,
            scannedBy,
            scansAfterFirst,
          );
          expect(dupResult.success).toBe(false);
          expect(scansAfterDup.length).toBe(countAfterFirst); // no new record

          // Quota exhausted claim by different team — should fail
          const { result: quotaResult, newScans: scansAfterQuota } = modelClaimTreasure(
            teamId2,
            location,
            scannedBy,
            scansAfterFirst,
          );
          expect(quotaResult.success).toBe(false);
          expect(scansAfterQuota.length).toBe(countAfterFirst); // no new record
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scanned_at field is always a valid ISO 8601 date string', () => {
    // Validates: Requirements 6.6, 13.2
    fc.assert(
      fc.property(
        treasureLocationArb,
        uuidArb,
        uuidArb,
        (location, teamId, scannedBy) => {
          const { newScans } = modelClaimTreasure(teamId, location, scannedBy, []);

          const scan = newScans.find(
            (s) => s.team_id === teamId && s.location_id === location.id,
          );

          expect(scan).toBeDefined();
          if (scan) {
            const parsed = new Date(scan.scanned_at);
            expect(isNaN(parsed.getTime())).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
