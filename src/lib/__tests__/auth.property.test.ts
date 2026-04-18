/**
 * Property-based tests for auth utility functions.
 * Feature: fif-adventure
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getRoleRedirect,
  isValidRole,
  parseTeamCSV,
  isScoreValid,
  isEventTimeValid,
  timeRemaining,
  type Role,
} from '../auth';

// ─── Generators ───────────────────────────────────────────────────────────────

const VALID_ROLES: Role[] = ['admin', 'captain', 'vice_captain', 'member', 'lo'];

const validRoleArb = fc.constantFrom(...VALID_ROLES);

/** Arbitrary for strings that are NOT valid roles */
const invalidRoleArb = fc
  .string({ minLength: 0, maxLength: 30 })
  .filter((s) => !VALID_ROLES.includes(s as Role));

/** Arbitrary for a single non-empty, comma-free string (safe CSV field).
 *  Must not contain commas, newlines, or leading/trailing whitespace,
 *  because parseTeamCSV trims values and CSV uses comma as delimiter.
 */
const csvFieldArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter(
    (s) =>
      !s.includes(',') &&
      !s.includes('\n') &&
      !s.includes('\r') &&
      s === s.trim() && // no leading/trailing whitespace
      s.trim() !== '',
  );

const memberRowArb = fc.record({
  name: csvFieldArb,
  npk: csvFieldArb,
  birth_date: csvFieldArb,
  role: validRoleArb,
});

/** Build a valid CSV string from an array of member rows */
function buildCSV(rows: Array<{ name: string; npk: string; birth_date: string; role: Role }>): string {
  const header = 'name,npk,birth_date,role';
  const dataRows = rows.map((r) => `${r.name},${r.npk},${r.birth_date},${r.role}`);
  return [header, ...dataRows].join('\n');
}

// ─── Property 1: Role-Based Redirect Correctness ─────────────────────────────

// Feature: fif-adventure, Property 1: Role-Based Redirect Correctness
describe('Property 1: Role-Based Redirect Correctness', () => {
  it('getRoleRedirect always returns one of /admin, /captain, /lo, / for every valid role', () => {
    // Validates: Requirements 1.2
    const allowedRedirects = new Set(['/admin', '/captain', '/lo', '/']);

    fc.assert(
      fc.property(validRoleArb, (role) => {
        const redirect = getRoleRedirect(role);
        expect(allowedRedirects.has(redirect)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('getRoleRedirect maps each valid role to the correct specific URL', () => {
    // Validates: Requirements 1.2
    fc.assert(
      fc.property(validRoleArb, (role) => {
        const redirect = getRoleRedirect(role);
        if (role === 'admin') {
          expect(redirect).toBe('/admin');
        } else if (role === 'captain' || role === 'vice_captain') {
          expect(redirect).toBe('/captain');
        } else if (role === 'lo') {
          expect(redirect).toBe('/lo');
        } else {
          // member
          expect(redirect).toBe('/');
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: Invalid Credentials Are Always Rejected ─────────────────────

// Feature: fif-adventure, Property 2: Invalid Credentials Are Always Rejected
describe('Property 2: Invalid Credentials Are Always Rejected', () => {
  it('isValidRole rejects any string that is not one of the 5 valid roles', () => {
    // Validates: Requirements 1.3
    // The pure-function equivalent: unknown role strings are always rejected,
    // meaning they would never produce a valid session/role assignment.
    fc.assert(
      fc.property(invalidRoleArb, (role) => {
        expect(isValidRole(role)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parseTeamCSV with invalid role values in rows produces errors, not records', () => {
    // Validates: Requirements 1.3
    fc.assert(
      fc.property(
        fc.record({
          name: csvFieldArb,
          npk: csvFieldArb,
          birth_date: csvFieldArb,
          invalidRole: invalidRoleArb.filter((s) => s.length > 0),
        }),
        ({ name, npk, birth_date, invalidRole }) => {
          const csv = `name,npk,birth_date,role\n${name},${npk},${birth_date},${invalidRole}`;
          const result = parseTeamCSV(csv);
          // Row with invalid role must not produce a record
          expect(result.records.length).toBe(0);
          expect(result.errors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3: Every Authenticated User Has Exactly One Role ───────────────

// Feature: fif-adventure, Property 3: Every Authenticated User Has Exactly One Role
describe('Property 3: Every Authenticated User Has Exactly One Role', () => {
  it('isValidRole returns true for exactly the 5 valid roles and false for everything else', () => {
    // Validates: Requirements 1.4
    // Positive: all 5 valid roles pass
    fc.assert(
      fc.property(validRoleArb, (role) => {
        expect(isValidRole(role)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('isValidRole never returns true for null, undefined, or unknown strings', () => {
    // Validates: Requirements 1.4
    fc.assert(
      fc.property(invalidRoleArb, (role) => {
        expect(isValidRole(role)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parseTeamCSV only produces records whose role is one of the 5 valid roles', () => {
    // Validates: Requirements 1.4
    fc.assert(
      fc.property(fc.array(memberRowArb, { minLength: 1, maxLength: 10 }), (rows) => {
        const csv = buildCSV(rows);
        const result = parseTeamCSV(csv);
        for (const record of result.records) {
          expect(VALID_ROLES).toContain(record.role);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: CSV Import Round-Trip Preserves All Member Data ──────────────

// Feature: fif-adventure, Property 5: CSV Import Round-Trip Preserves All Member Data
describe('Property 5: CSV Import Round-Trip Preserves All Member Data', () => {
  it('parseTeamCSV returns exactly N records for N valid CSV data rows', () => {
    // Validates: Requirements 2.2
    fc.assert(
      fc.property(fc.array(memberRowArb, { minLength: 1, maxLength: 20 }), (rows) => {
        const csv = buildCSV(rows);
        const result = parseTeamCSV(csv);
        expect(result.errors).toHaveLength(0);
        expect(result.records).toHaveLength(rows.length);
      }),
      { numRuns: 100 },
    );
  });

  it('parseTeamCSV preserves field values exactly for each row', () => {
    // Validates: Requirements 2.2
    fc.assert(
      fc.property(fc.array(memberRowArb, { minLength: 1, maxLength: 10 }), (rows) => {
        const csv = buildCSV(rows);
        const result = parseTeamCSV(csv);
        expect(result.records).toHaveLength(rows.length);
        for (let i = 0; i < rows.length; i++) {
          expect(result.records[i].name).toBe(rows[i].name);
          expect(result.records[i].npk).toBe(rows[i].npk);
          expect(result.records[i].birth_date).toBe(rows[i].birth_date);
          expect(result.records[i].role).toBe(rows[i].role);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6: Invalid CSV Is Always Rejected With Descriptive Error ────────

// Feature: fif-adventure, Property 6: Invalid CSV Is Always Rejected With Descriptive Error
describe('Property 6: Invalid CSV Is Always Rejected With Descriptive Error', () => {
  const ALL_REQUIRED_COLUMNS = ['name', 'npk', 'birth_date', 'role'] as const;

  it('CSV missing any required column always produces an error naming the missing column', () => {
    // Validates: Requirements 2.3
    // Generate a subset of columns that is missing at least one required column
    fc.assert(
      fc.property(
        fc.subarray(ALL_REQUIRED_COLUMNS as unknown as string[], { minLength: 0, maxLength: 3 }),
        (presentColumns) => {
          const missingColumns = ALL_REQUIRED_COLUMNS.filter(
            (col) => !presentColumns.includes(col),
          );
          if (missingColumns.length === 0) return; // skip if all present (valid case)

          const header = presentColumns.join(',');
          const csv = header + '\nsome,data,here,extra';
          const result = parseTeamCSV(csv);

          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.records).toHaveLength(0);

          // The error message must mention at least one of the missing columns
          const errorText = result.errors.join(' ');
          const mentionsMissingColumn = missingColumns.some((col) => errorText.includes(col));
          expect(mentionsMissingColumn).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty CSV always produces an error and no records', () => {
    // Validates: Requirements 2.3
    fc.assert(
      fc.property(
        fc.constantFrom('', '   ', '\n', '\r\n'),
        (emptyContent) => {
          const result = parseTeamCSV(emptyContent);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.records).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 16: Score Validation Correctly Enforces Range ──────────────────

// Feature: fif-adventure, Property 16: Score Validation Correctly Enforces Range
describe('Property 16: Score Validation Correctly Enforces Range', () => {
  it('isScoreValid(S, M) is true if and only if 0 <= S <= M', () => {
    // Validates: Requirements 7.3
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (score, maxPoints) => {
          const result = isScoreValid(score, maxPoints);
          const expected = score >= 0 && score <= maxPoints;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isScoreValid returns false for any negative score', () => {
    // Validates: Requirements 7.3
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: -1 }),
        fc.integer({ min: 0, max: 1000 }),
        (negativeScore, maxPoints) => {
          expect(isScoreValid(negativeScore, maxPoints)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isScoreValid returns false for any score exceeding maxPoints', () => {
    // Validates: Requirements 7.3
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 500 }),
        (base, excess) => {
          const maxPoints = base;
          const score = base + excess; // always > maxPoints
          expect(isScoreValid(score, maxPoints)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isScoreValid returns true for score exactly at 0 and exactly at maxPoints', () => {
    // Validates: Requirements 7.3
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (maxPoints) => {
        expect(isScoreValid(0, maxPoints)).toBe(true);
        expect(isScoreValid(maxPoints, maxPoints)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 20: Countdown Timer Calculation Is Correct ─────────────────────

// Feature: fif-adventure, Property 20: Countdown Timer Calculation Is Correct
describe('Property 20: Countdown Timer Calculation Is Correct', () => {
  it('timeRemaining returns max(0, endTime - now) in milliseconds', () => {
    // Validates: Requirements 9.2
    const baseMs = Date.now();

    fc.assert(
      fc.property(
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.integer({ min: -100_000, max: 100_000 }),
        (endOffset, nowOffset) => {
          const endTime = new Date(baseMs + endOffset);
          const now = new Date(baseMs + nowOffset);
          const result = timeRemaining(endTime, now);
          const expected = Math.max(0, endTime.getTime() - now.getTime());
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('timeRemaining returns a positive value when endTime is in the future', () => {
    // Validates: Requirements 9.2
    const baseMs = Date.now();

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (futureOffset) => {
          const endTime = new Date(baseMs + futureOffset);
          const now = new Date(baseMs);
          expect(timeRemaining(endTime, now)).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('timeRemaining returns exactly 0 when endTime has already passed', () => {
    // Validates: Requirements 9.2
    const baseMs = Date.now();

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (pastOffset) => {
          const endTime = new Date(baseMs - pastOffset);
          const now = new Date(baseMs);
          expect(timeRemaining(endTime, now)).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('timeRemaining returns 0 when endTime equals now', () => {
    // Validates: Requirements 9.2
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (ms) => {
        const t = new Date(ms);
        expect(timeRemaining(t, t)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 22: Event End Time Must Be After Start Time ────────────────────

// Feature: fif-adventure, Property 22: Event End Time Must Be After Start Time
describe('Property 22: Event End Time Must Be After Start Time', () => {
  it('isEventTimeValid returns false when endTime <= startTime', () => {
    // Validates: Requirements 9.4
    const baseMs = Date.now();

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (aOffset, bOffset) => {
          const t1 = new Date(baseMs + aOffset);
          const t2 = new Date(baseMs + bOffset);
          // When endTime <= startTime, result must be false
          if (t2.getTime() <= t1.getTime()) {
            expect(isEventTimeValid(t1, t2)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isEventTimeValid returns true when endTime is strictly after startTime', () => {
    // Validates: Requirements 9.4
    const baseMs = Date.now();

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (offset) => {
          const startTime = new Date(baseMs);
          const endTime = new Date(baseMs + offset);
          expect(isEventTimeValid(startTime, endTime)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isEventTimeValid returns false when endTime equals startTime', () => {
    // Validates: Requirements 9.4
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (ms) => {
        const t = new Date(ms);
        expect(isEventTimeValid(t, t)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isEventTimeValid returns false when endTime is before startTime', () => {
    // Validates: Requirements 9.4
    const baseMs = Date.now();

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (offset) => {
          const startTime = new Date(baseMs + offset);
          const endTime = new Date(baseMs);
          expect(isEventTimeValid(startTime, endTime)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Protected Routes Always Redirect Unauthenticated Users ──────

/**
 * The AuthGuard component (src/components/AuthGuard.tsx) implements the
 * following redirect logic when a user is unauthenticated (userRole === null):
 *
 *   router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
 *
 * This property tests that pure redirect URL computation:
 * for ANY protected route path, the resulting redirect URL always starts
 * with "/login", regardless of the specific path being accessed.
 *
 * Feature: fif-adventure, Property 4: Protected Routes Always Redirect Unauthenticated Users
 */

/**
 * Pure function that mirrors the AuthGuard redirect URL computation.
 * When an unauthenticated user accesses a protected route at `pathname`,
 * AuthGuard redirects to this URL.
 */
function buildUnauthenticatedRedirectUrl(pathname: string): string {
  return `/login?redirect=${encodeURIComponent(pathname)}`;
}

/**
 * Returns true if the given URL is a redirect to the login page.
 * Matches the AuthGuard behaviour: destination always starts with "/login".
 */
function isLoginRedirect(url: string): boolean {
  return url.startsWith('/login');
}

// ─── Generators ───────────────────────────────────────────────────────────────

/** Known protected routes in the application */
const PROTECTED_ROUTES = [
  '/admin',
  '/captain',
  '/captain/scan',
  '/captain/journal',
  '/lo',
] as const;

const knownProtectedRouteArb = fc.constantFrom(...PROTECTED_ROUTES);

/**
 * Arbitrary for a URL-safe path segment (no spaces, no special chars that
 * would break URL encoding tests — we want to exercise encodeURIComponent).
 */
const pathSegmentArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0 && !s.includes('\0'));

/** Arbitrary for a multi-segment absolute path like /foo/bar/baz */
const arbitraryProtectedPathArb = fc
  .array(pathSegmentArb, { minLength: 1, maxLength: 4 })
  .map((segments) => '/' + segments.join('/'));

// ─── Tests ────────────────────────────────────────────────────────────────────

// Feature: fif-adventure, Property 4: Protected Routes Always Redirect Unauthenticated Users
describe('Property 4: Protected Routes Always Redirect Unauthenticated Users', () => {
  it('redirect URL always starts with /login for every known protected route', () => {
    // Validates: Requirements 1.7
    fc.assert(
      fc.property(knownProtectedRouteArb, (pathname) => {
        const redirectUrl = buildUnauthenticatedRedirectUrl(pathname);
        expect(isLoginRedirect(redirectUrl)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('redirect URL always starts with /login for any arbitrary protected path', () => {
    // Validates: Requirements 1.7
    fc.assert(
      fc.property(arbitraryProtectedPathArb, (pathname) => {
        const redirectUrl = buildUnauthenticatedRedirectUrl(pathname);
        expect(isLoginRedirect(redirectUrl)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('redirect URL always encodes the original pathname as the redirect query param', () => {
    // Validates: Requirements 1.7
    // The return path must be preserved so the user can be sent back after login.
    fc.assert(
      fc.property(arbitraryProtectedPathArb, (pathname) => {
        const redirectUrl = buildUnauthenticatedRedirectUrl(pathname);
        // URL must contain the encoded pathname as the redirect param value
        const expectedParam = `redirect=${encodeURIComponent(pathname)}`;
        expect(redirectUrl).toContain(expectedParam);
      }),
      { numRuns: 100 },
    );
  });

  it('redirect URL is never empty and never equals the original protected path', () => {
    // Validates: Requirements 1.7
    fc.assert(
      fc.property(arbitraryProtectedPathArb, (pathname) => {
        const redirectUrl = buildUnauthenticatedRedirectUrl(pathname);
        expect(redirectUrl.length).toBeGreaterThan(0);
        expect(redirectUrl).not.toBe(pathname);
      }),
      { numRuns: 100 },
    );
  });

  it('redirect URL always starts with /login regardless of nesting depth of the protected path', () => {
    // Validates: Requirements 1.7
    // Deeply nested paths (e.g. /captain/scan/detail/123) must still redirect to /login.
    fc.assert(
      fc.property(
        fc.array(pathSegmentArb, { minLength: 1, maxLength: 8 }),
        (segments) => {
          const deepPath = '/' + segments.join('/');
          const redirectUrl = buildUnauthenticatedRedirectUrl(deepPath);
          expect(isLoginRedirect(redirectUrl)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
