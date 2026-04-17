/**
 * User Management utility functions for FIF Adventure
 * Requirements: 2.3, 3.4, 4.3, 4.4, 4.8, 4.9, 4.11, 4.12, 7.3
 */

import { type Role, isValidRole } from './auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedUserRow {
  nama: string;
  npk: string;
  role: string;        // raw string from CSV; validated separately
  team_name: string;   // empty string if not filled
  no_unik: string;     // empty string if not filled
}

export interface ParseUserCSVResult {
  rows: ParsedUserRow[];
  errors: string[];    // format errors (missing columns, invalid role, empty required fields)
}

export interface RowResult {
  rowIndex: number;    // 1-based (excluding header)
  status: 'created' | 'skipped' | 'assigned' | 'failed';
  reason?: string;     // reason for failure if status === 'failed'
  teamCreated?: boolean; // true if a new team was created for this row
}

export interface UploadReport {
  totalRows: number;
  usersCreated: number;
  usersSkipped: number;      // npk already exists, creation skipped
  teamsCreated: number;
  assignmentsSuccess: number;
  failed: number;
  failedRows: Array<{ row: number; reason: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_CSV_COLUMNS = ['nama', 'npk', 'role'] as const;
const OPTIONAL_CSV_COLUMNS = ['team_name', 'no_unik'] as const;

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Construct Supabase Auth email from npk.
 * Requirements: 2.3, 3.4, 7.3
 */
export function buildAuthEmail(npk: string): string {
  return `${npk.toLowerCase()}@fif.internal`;
}

/**
 * Validate a single parsed CSV row before processing.
 * Returns null if valid, error string if invalid.
 * Requirements: 4.9, 4.11, 4.12
 */
export function validateUserRow(row: ParsedUserRow): string | null {
  // Check: nama empty or whitespace-only
  if (!row.nama || row.nama.trim() === '') {
    return 'nama dan npk wajib diisi';
  }
  // Check: npk empty or whitespace-only
  if (!row.npk || row.npk.trim() === '') {
    return 'nama dan npk wajib diisi';
  }
  // Check: role invalid
  if (!isValidRole(row.role)) {
    return `role '${row.role}' tidak valid`;
  }
  // Check: team_name filled but no_unik empty
  if (row.team_name.trim() !== '' && row.no_unik.trim() === '') {
    return 'no_unik wajib diisi jika team_name diisi';
  }
  return null;
}

/**
 * Parse CSV with columns: nama, npk, role (required), team_name, no_unik (optional).
 * Columns team_name and no_unik default to empty string if absent or empty per row.
 * Requirements: 4.3, 4.4
 */
export function parseUserCSV(content: string): ParseUserCSVResult {
  const rows: ParsedUserRow[] = [];
  const errors: string[] = [];

  if (!content || content.trim() === '') {
    errors.push('CSV content is empty');
    return { rows, errors };
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    errors.push('CSV content is empty');
    return { rows, errors };
  }

  // Parse header row
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

  // Check for required columns
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
    return { rows, errors };
  }

  // Build column index map
  const colIndex: Record<string, number> = {};
  for (const col of [...REQUIRED_CSV_COLUMNS, ...OPTIONAL_CSV_COLUMNS]) {
    colIndex[col] = headers.indexOf(col); // -1 if optional column absent
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());

    const nama = values[colIndex['nama']] ?? '';
    const npk = values[colIndex['npk']] ?? '';
    const role = values[colIndex['role']] ?? '';
    const team_name = colIndex['team_name'] >= 0 ? (values[colIndex['team_name']] ?? '') : '';
    const no_unik = colIndex['no_unik'] >= 0 ? (values[colIndex['no_unik']] ?? '') : '';

    rows.push({ nama, npk, role, team_name, no_unik });
  }

  return { rows, errors };
}

/**
 * Build UploadReport from array of RowResult.
 * Invariant: totalRows === usersCreated + usersSkipped + failed
 * (assigned rows are counted separately and don't affect the invariant)
 * Requirements: 4.8
 */
export function buildUploadReport(results: RowResult[], totalRows: number): UploadReport {
  let usersCreated = 0;
  let usersSkipped = 0;
  let teamsCreated = 0;
  let assignmentsSuccess = 0;
  let failed = 0;
  const failedRows: Array<{ row: number; reason: string }> = [];

  for (const result of results) {
    if (result.teamCreated) teamsCreated++;

    switch (result.status) {
      case 'created':
        usersCreated++;
        break;
      case 'skipped':
        usersSkipped++;
        break;
      case 'assigned':
        assignmentsSuccess++;
        break;
      case 'failed':
        failed++;
        if (result.reason) {
          failedRows.push({ row: result.rowIndex, reason: result.reason });
        }
        break;
    }
  }

  return {
    totalRows,
    usersCreated,
    usersSkipped,
    teamsCreated,
    assignmentsSuccess,
    failed,
    failedRows,
  };
}
