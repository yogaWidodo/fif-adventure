/**
 * User Management utility functions for FIF Adventure V2
 */

import { type Role, isValidRole } from './auth';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedUserRow {
  name: string;
  npk: string;
  role: string;        // raw string from CSV; validated separately
  team_name: string;   // empty string if not filled
  birth_date: string;  // Required DDMMYYYY from CSV
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

const REQUIRED_CSV_COLUMNS = ['name', 'npk', 'role', 'birth_date'] as const;
const OPTIONAL_CSV_COLUMNS = ['team_name'] as const;

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Construct Supabase Auth email from npk.
 */
export function buildAuthEmail(npk: string): string {
  return `${npk.toLowerCase()}@fif.internal`;
}

/**
 * Validate a single parsed CSV row before processing.
 * Returns null if valid, error string if invalid.
 */
export function validateUserRow(row: ParsedUserRow): string | null {
  if (!row.name || row.name.trim() === '') {
    return 'name dan npk wajib diisi';
  }
  if (!row.npk || row.npk.trim() === '') {
    return 'name dan npk wajib diisi';
  }
  if (!isValidRole(row.role)) {
    return `role '${row.role}' tidak valid`;
  }
  if (!row.birth_date || !/^\d{8}$/.test(row.birth_date)) {
    return 'birth_date wajib diisi dengan format DDMMYYYY (8 digit angka)';
  }
  return null;
}

/**
 * Convert DDMMYYYY to YYYY-MM-DD for Postgres.
 */
export function formatDateForDB(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const day = dateStr.slice(0, 2);
  const month = dateStr.slice(2, 4);
  const year = dateStr.slice(4, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Parse CSV with columns: name, npk, role, birth_date (required), team_name (optional).
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
    colIndex[col] = headers.indexOf(col);
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());

    const name = values[colIndex['name']] ?? '';
    const npk = values[colIndex['npk']] ?? '';
    const role = values[colIndex['role']] ?? '';
    const birth_date = values[colIndex['birth_date']] ?? '';
    const team_name = colIndex['team_name'] >= 0 ? (values[colIndex['team_name']] ?? '') : '';

    rows.push({ name, npk, role, team_name, birth_date });
  }

  return { rows, errors };
}

/**
 * Parse Excel file content.
 */
export function parseUserExcel(data: ArrayBuffer): ParseUserCSVResult {
  const rows: ParsedUserRow[] = [];
  const errors: string[] = [];

  try {
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with headers
    const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

    if (jsonData.length === 0) {
      errors.push('Excel sheet is empty');
      return { rows, errors };
    }

    // Check for required columns (case insensitive)
    const firstRow = jsonData[0];
    const actualKeys = Object.keys(firstRow).map(k => k.toLowerCase().trim());
    
    const missingColumns = REQUIRED_CSV_COLUMNS.filter((col) => !actualKeys.includes(col));
    if (missingColumns.length > 0) {
      errors.push(`Missing required columns in Excel: ${missingColumns.join(', ')}`);
      return { rows, errors };
    }

    // Map keys to standard fields
    jsonData.forEach((row, index) => {
      const normalizedRow: any = {};
      Object.keys(row).forEach(key => {
        normalizedRow[key.toLowerCase().trim()] = row[key];
      });

      rows.push({
        name: String(normalizedRow['name'] ?? '').trim(),
        npk: String(normalizedRow['npk'] ?? '').trim(),
        role: String(normalizedRow['role'] ?? '').trim().toLowerCase(),
        birth_date: String(normalizedRow['birth_date'] ?? '').trim(),
        team_name: String(normalizedRow['team_name'] ?? '').trim(),
      });
    });

  } catch (e: any) {
    errors.push(`Excel parsing failed: ${e.message}`);
  }

  return { rows, errors };
}

/**
 * Build UploadReport from array of RowResult.
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
