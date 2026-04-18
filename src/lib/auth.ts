/**
 * Auth utility functions for FIF Adventure
 * Requirements: 1.2, 1.4, 2.2, 2.3, 7.3, 9.2, 9.4
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'captain' | 'vice_captain' | 'member' | 'lo';

export interface MemberRecord {
  name: string;
  npk: string;
  birth_date: string;
  role: Role;
}

export interface ParseCSVResult {
  records: MemberRecord[];
  errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_ROLES: Role[] = ['admin', 'captain', 'vice_captain', 'member', 'lo'];

const REQUIRED_CSV_COLUMNS = ['name', 'npk', 'birth_date', 'role'] as const;

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Maps a user role to its corresponding dashboard URL.
 * Requirements: 1.2
 */
export function getRoleRedirect(role: string): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'captain':
    case 'vice_captain':
      return '/captain';
    case 'lo':
      return '/lo';
    case 'member':
      return '/member';
    default:
      return '/';
  }
}

/**
 * Validates that a role string is one of the allowed roles.
 * Requirements: 1.4
 */
export function isValidRole(role: string): role is Role {
  return (VALID_ROLES as string[]).includes(role);
}

/**
 * Parses and validates a CSV string with columns: name, npk, birth_date, role.
 * Returns parsed records and any validation errors encountered.
 * Requirements: 2.2, 2.3
 */
export function parseTeamCSV(content: string): ParseCSVResult {
  const records: MemberRecord[] = [];
  const errors: string[] = [];

  if (!content || content.trim() === '') {
    errors.push('CSV content is empty');
    return { records, errors };
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    errors.push('CSV content is empty');
    return { records, errors };
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  // Check for required columns
  const missingColumns = REQUIRED_CSV_COLUMNS.filter(
    (col) => !headers.includes(col)
  );

  if (missingColumns.length > 0) {
    errors.push(
      `Missing required columns: ${missingColumns.join(', ')}`
    );
    return { records, errors };
  }

  // Build column index map
  const colIndex: Record<string, number> = {};
  for (const col of REQUIRED_CSV_COLUMNS) {
    colIndex[col] = headers.indexOf(col);
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-based, accounting for header
    const line = lines[i];
    const values = line.split(',').map((v) => v.trim());

    const name = values[colIndex['name']] ?? '';
    const npk = values[colIndex['npk']] ?? '';
    const birth_date = values[colIndex['birth_date']] ?? '';
    const roleRaw = values[colIndex['role']] ?? '';

    const rowErrors: string[] = [];

    if (!name) rowErrors.push('name is required');
    if (!npk) rowErrors.push('npk is required');
    if (!birth_date) rowErrors.push('birth_date is required');
    if (!roleRaw) {
      rowErrors.push('role is required');
    } else if (!isValidRole(roleRaw)) {
      rowErrors.push(
        `role "${roleRaw}" is invalid; must be one of: ${VALID_ROLES.join(', ')}`
      );
    }

    if (rowErrors.length > 0) {
      errors.push(`Row ${rowNumber}: ${rowErrors.join('; ')}`);
      continue;
    }

    records.push({
      name,
      npk,
      birth_date,
      role: roleRaw as Role,
    });
  }

  return { records, errors };
}

/**
 * Generates a barcode data string in the format `fif-{type}-{id}`.
 * Requirements: 3.2 (via admin dashboard usage)
 */
export function generateBarcodeData(type: string, id: string): string {
  return `fif-${type}-${id}`;
}

/** Regex for a canonical UUID (v4 or any version). */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates a team barcode string in the format `fif-team-{teamId}`.
 * Requirements: 1.1, 1.7
 */
export function generateTeamBarcode(teamId: string): string {
  return generateBarcodeData('team', teamId);
}

/**
 * Returns true if `value` is a valid team barcode (`fif-team-{uuid}`).
 * Requirements: 1.1, 1.7
 */
export function isTeamBarcode(value: string): boolean {
  if (!value.startsWith('fif-team-')) return false;
  const maybeUuid = value.slice('fif-team-'.length);
  return UUID_REGEX.test(maybeUuid);
}

/**
 * Extracts the team UUID from a team barcode string.
 * Returns `null` if the barcode does not match the expected format.
 * Requirements: 1.7
 */
export function extractTeamIdFromBarcode(barcode: string): string | null {
  if (!isTeamBarcode(barcode)) return null;
  return barcode.slice('fif-team-'.length);
}

/**
 * Validates that a score is within the allowed range [0, maxPoints].
 * Requirements: 7.3
 */
export function isScoreValid(score: number, maxPoints: number): boolean {
  return score >= 0 && score <= maxPoints;
}

/**
 * Validates that an event's end time is strictly after its start time.
 * Requirements: 9.4
 */
export function isEventTimeValid(startTime: Date, endTime: Date): boolean {
  return endTime.getTime() > startTime.getTime();
}

/**
 * Returns the time remaining until endTime from now, in milliseconds.
 * Returns 0 if endTime has already passed.
 * Requirements: 9.2
 */
export function timeRemaining(endTime: Date, now: Date): number {
  return Math.max(0, endTime.getTime() - now.getTime());
}
