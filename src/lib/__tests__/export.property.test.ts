/**
 * Property-based tests for CSV export logic.
 * Feature: fif-adventure, Property 23: CSV Export Round-Trip Preserves All Records
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCsv } from '../../app/api/export/route';

// ─── CSV parser (mirrors what Excel / a standard CSV reader would do) ─────────
//
// Parses RFC 4180-compliant CSV:
//   - Fields separated by commas
//   - Fields optionally wrapped in double-quotes
//   - Double-quotes inside quoted fields are escaped as ""
//   - Rows separated by CRLF (\r\n) or LF (\n)

function parseCsv(csv: string): string[][] {
  // Strip UTF-8 BOM if present
  const content = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;

  const rows: string[][] = [];
  // Split on CRLF or LF; keep empty lines (they may represent rows with empty fields)
  const lines = content.split(/\r\n|\n/);

  for (const line of lines) {
    // Skip truly blank lines (trailing newline at end of file)
    // A row with all-empty quoted fields looks like `"","",""` — not an empty string.
    // An empty line only appears as a trailing artifact after the last CRLF.
    if (line === '') continue;

    const fields: string[] = [];
    let i = 0;

    while (i <= line.length) {
      if (i === line.length) {
        // Trailing comma produced an extra empty field — but since we always
        // quote, this branch is only hit if the line ends with a comma.
        // In practice our encoder never produces trailing commas, so this
        // guard just prevents an infinite loop.
        break;
      }

      if (line[i] === '"') {
        // Quoted field
        let field = '';
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            // Escaped double-quote
            field += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            field += line[i];
            i++;
          }
        }
        fields.push(field);
        if (i < line.length && line[i] === ',') i++; // skip comma after closing quote
      } else {
        // Unquoted field — read until comma or end of line
        const start = i;
        while (i < line.length && line[i] !== ',') i++;
        fields.push(line.slice(start, i));
        if (i < line.length && line[i] === ',') i++; // skip comma
      }
    }

    rows.push(fields);
  }

  return rows;
}

// ─── Generators ───────────────────────────────────────────────────────────────

/**
 * Arbitrary for a plain string that may contain Indonesian characters,
 * commas, quotes, and spaces — but no raw newlines (those would break
 * single-line CSV fields without quoting, which our encoder handles).
 */
const fieldArb = fc.string({ minLength: 0, maxLength: 50 }).filter(
  // Exclude raw CR/LF inside fields — our encoder wraps them in quotes,
  // but the simple line-split parser above doesn't handle multi-line fields.
  // This keeps the round-trip test focused on the encoding/escaping logic.
  (s) => !s.includes('\r') && !s.includes('\n'),
);

/** Arbitrary for a single CSV row (1–6 fields). */
const rowArb = fc.array(fieldArb, { minLength: 1, maxLength: 6 });

/** Arbitrary for a non-empty set of data rows (1–20 rows). */
const dataRowsArb = fc.array(rowArb, { minLength: 1, maxLength: 20 });

/** Arbitrary for a header row with the same column count as the data rows. */
const tableArb = dataRowsArb.chain((dataRows) => {
  const colCount = dataRows[0].length;
  return fc
    .array(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('\r') && !s.includes('\n')), {
      minLength: colCount,
      maxLength: colCount,
    })
    .map((header) => ({ header, dataRows }));
});

/** Arbitrary for strings containing common Indonesian characters. */
const indonesianStringArb = fc.constantFrom(
  'Budi Santoso',
  'Siti Rahayu',
  'Wahana Petualangan',
  'Ekspedisi Nusantara',
  'Ñoño',
  'café',
  'résumé',
  'naïve',
  'Jl. Sudirman No. 1, Jakarta',
  'Tim "Garuda" Perkasa',
  'Slogan: Maju, Terus, Pantang Mundur!',
  'Score: 100/200',
);

// ─── Property 23: CSV Export Round-Trip Preserves All Records ─────────────────

// Feature: fif-adventure, Property 23: CSV Export Round-Trip Preserves All Records
describe('Property 23: CSV Export Round-Trip Preserves All Records', () => {
  it('parsing the CSV output of buildCsv yields the same number of rows as input', () => {
    // Validates: Requirements 11.1, 11.2
    fc.assert(
      fc.property(dataRowsArb, (dataRows) => {
        const csv = buildCsv(dataRows);
        const parsed = parseCsv(csv);

        expect(parsed).toHaveLength(dataRows.length);
      }),
      { numRuns: 100 },
    );
  });

  it('each parsed row has the same number of fields as the original row', () => {
    // Validates: Requirements 11.1, 11.2
    fc.assert(
      fc.property(dataRowsArb, (dataRows) => {
        const csv = buildCsv(dataRows);
        const parsed = parseCsv(csv);

        for (let i = 0; i < dataRows.length; i++) {
          expect(parsed[i]).toHaveLength(dataRows[i].length);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('each parsed field value exactly matches the original field value', () => {
    // Validates: Requirements 11.1, 11.2, 11.4
    fc.assert(
      fc.property(dataRowsArb, (dataRows) => {
        const csv = buildCsv(dataRows);
        const parsed = parseCsv(csv);

        for (let i = 0; i < dataRows.length; i++) {
          for (let j = 0; j < dataRows[i].length; j++) {
            const original = dataRows[i][j] == null ? '' : String(dataRows[i][j]);
            expect(parsed[i][j]).toBe(original);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('fields containing commas are preserved correctly after round-trip', () => {
    // Validates: Requirements 11.4 — commas in Indonesian addresses/names
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.includes(',')),
            fieldArb,
          ),
          { minLength: 1, maxLength: 10 },
        ),
        (rows) => {
          const csv = buildCsv(rows);
          const parsed = parseCsv(csv);

          for (let i = 0; i < rows.length; i++) {
            expect(parsed[i][0]).toBe(rows[i][0]);
            expect(parsed[i][1]).toBe(rows[i][1]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fields containing double-quotes are preserved correctly after round-trip', () => {
    // Validates: Requirements 11.4
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.includes('"')),
            fieldArb,
          ),
          { minLength: 1, maxLength: 10 },
        ),
        (rows) => {
          const csv = buildCsv(rows);
          const parsed = parseCsv(csv);

          for (let i = 0; i < rows.length; i++) {
            expect(parsed[i][0]).toBe(rows[i][0]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Indonesian character strings survive the round-trip without corruption', () => {
    // Validates: Requirements 11.4 — UTF-8 encoding for Indonesian characters
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(indonesianStringArb, fc.integer({ min: 0, max: 100_000 })),
          { minLength: 1, maxLength: 10 },
        ),
        (rows) => {
          const csv = buildCsv(rows);
          const parsed = parseCsv(csv);

          for (let i = 0; i < rows.length; i++) {
            expect(parsed[i][0]).toBe(rows[i][0]);
            expect(parsed[i][1]).toBe(String(rows[i][1]));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('numeric values are preserved as their string representation after round-trip', () => {
    // Validates: Requirements 11.1, 11.2 — total_points and score are numbers
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fieldArb,
            points: fc.integer({ min: 0, max: 100_000 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (records) => {
          const rows = records.map((r) => [r.name, r.points] as [string, number]);
          const csv = buildCsv(rows);
          const parsed = parseCsv(csv);

          for (let i = 0; i < records.length; i++) {
            expect(parsed[i][1]).toBe(String(records[i].points));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty string fields are preserved as empty strings after round-trip', () => {
    // Validates: Requirements 11.1 — slogan may be empty/null
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fieldArb, fc.constant('')),
          { minLength: 1, maxLength: 10 },
        ),
        (rows) => {
          const csv = buildCsv(rows);
          const parsed = parseCsv(csv);

          for (let i = 0; i < rows.length; i++) {
            expect(parsed[i][1]).toBe('');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('null and undefined values are serialized as empty strings', () => {
    // Validates: Requirements 11.1 — captain may be null if unassigned
    fc.assert(
      fc.property(
        fc.array(fieldArb, { minLength: 1, maxLength: 10 }),
        (names) => {
          const rows = names.map((name) => [name, null, undefined] as (string | null | undefined)[]);
          const csv = buildCsv(rows);
          const parsed = parseCsv(csv);

          for (let i = 0; i < names.length; i++) {
            expect(parsed[i][1]).toBe('');
            expect(parsed[i][2]).toBe('');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a full teams-style export round-trips correctly (name, slogan, points, captain)', () => {
    // Validates: Requirements 11.1 — teams export schema
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fieldArb,
            slogan: fieldArb,
            total_points: fc.integer({ min: 0, max: 100_000 }),
            captain_name: fieldArb,
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (teams) => {
          const header = ['Nama Tim', 'Slogan', 'Total Poin', 'Nama Kaptain'];
          const dataRows = teams.map((t) => [t.name, t.slogan, t.total_points, t.captain_name]);
          const csv = buildCsv([header, ...dataRows]);
          const parsed = parseCsv(csv);

          // Header row + data rows
          expect(parsed).toHaveLength(teams.length + 1);

          // Verify header
          expect(parsed[0]).toEqual(header);

          // Verify each data row
          for (let i = 0; i < teams.length; i++) {
            const row = parsed[i + 1];
            expect(row[0]).toBe(teams[i].name);
            expect(row[1]).toBe(teams[i].slogan);
            expect(row[2]).toBe(String(teams[i].total_points));
            expect(row[3]).toBe(teams[i].captain_name);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a full score_logs-style export round-trips correctly (team_id, activity_id, points_awarded, lo_id, created_at)', () => {
    // Validates: Requirements 11.2 — score_logs export schema
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            team_id: fc.uuid(),
            activity_id: fc.uuid(),
            points_awarded: fc.integer({ min: 0, max: 1000 }),
            lo_id: fc.uuid(),
            created_at: fc.constant(new Date().toISOString()),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (logs) => {
          const header = ['Team ID', 'Activity ID', 'Points', 'LO ID', 'Created At'];
          const dataRows = logs.map((l) => [
            l.team_id,
            l.activity_id,
            l.points_awarded,
            l.lo_id,
            l.created_at,
          ]);
          const csv = buildCsv([header, ...dataRows]);
          const parsed = parseCsv(csv);

          expect(parsed).toHaveLength(logs.length + 1);
          expect(parsed[0]).toEqual(header);

          for (let i = 0; i < logs.length; i++) {
            const row = parsed[i + 1];
            expect(row[0]).toBe(logs[i].team_id);
            expect(row[1]).toBe(logs[i].activity_id);
            expect(row[2]).toBe(String(logs[i].points_awarded));
            expect(row[3]).toBe(logs[i].lo_id);
            expect(row[4]).toBe(logs[i].created_at);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildCsv output is always a non-empty string for non-empty input', () => {
    // Validates: Requirements 11.3 — file must be downloadable (non-empty)
    fc.assert(
      fc.property(dataRowsArb, (dataRows) => {
        const csv = buildCsv(dataRows);
        expect(typeof csv).toBe('string');
        expect(csv.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('row count is preserved regardless of field content complexity', () => {
    // Validates: Requirements 11.1, 11.2 — all records exported
    fc.assert(
      fc.property(tableArb, ({ header, dataRows }) => {
        const csv = buildCsv([header, ...dataRows]);
        const parsed = parseCsv(csv);

        // Total rows = 1 header + N data rows
        expect(parsed).toHaveLength(dataRows.length + 1);
      }),
      { numRuns: 100 },
    );
  });
});
