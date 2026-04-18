// Requirements: 11.1, 11.2, 11.3, 11.4

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

// UTF-8 BOM for Excel compatibility with Indonesian characters
const UTF8_BOM = '\uFEFF';

/**
 * Escapes a single CSV field value per RFC 4180.
 * Always wraps in double-quotes so that empty fields, fields with commas,
 * double-quotes, or newlines are all unambiguous when parsed back.
 * Doubles any internal double-quote characters.
 */
function escapeCsvField(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  // Always quote — this makes empty fields ("") distinguishable from blank
  // lines and ensures round-trip fidelity for all field values.
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Converts an array of row arrays into a CSV string (no BOM — caller adds it).
 * Each inner array is one row; values are escaped per RFC 4180.
 */
export function buildCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
}

export async function GET(request: NextRequest): Promise<Response> {
  // ── 1. Validate session ────────────────────────────────────────────────────
  const accessToken = await getAccessToken(request);

  if (!accessToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admin role may export data
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', user.id)
    .single();

  if (profileError || !userProfile) {
    return Response.json({ error: 'User profile not found' }, { status: 401 });
  }

  if (userProfile.role !== 'admin') {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // ── 2. Read query param ────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type !== 'teams' && type !== 'score_logs') {
    return Response.json(
      { error: 'Query param "type" must be "teams" or "score_logs"' },
      { status: 400 },
    );
  }

  // ── 3. Build CSV based on type ─────────────────────────────────────────────
  let csvContent: string;
  let filename: string;

  if (type === 'teams') {
    // Requirement 11.1: export nama tim, slogan, total_points, nama Kaptain
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select(`
        name,
        slogan,
        total_points,
        captain_id,
        users!teams_captain_id_fkey ( name )
      `)
      .order('total_points', { ascending: false });

    if (teamsError) {
      console.error('Export teams query error:', teamsError);
      return Response.json({ error: 'Failed to fetch teams data' }, { status: 500 });
    }

    const header = ['Nama Tim', 'Slogan', 'Total Poin', 'Nama Kaptain'];
    const dataRows = (teams ?? []).map((team) => {
      // Supabase foreign key join returns an array; take the first element
      const usersArr = team.users as { name: string }[] | null;
      const captainUser = Array.isArray(usersArr) ? usersArr[0] : null;
      return [
        team.name,
        team.slogan ?? '',
        team.total_points ?? 0,
        captainUser?.name ?? '',
      ];
    });

    csvContent = UTF8_BOM + buildCsv([header, ...dataRows]);
    filename = 'teams-export.csv';
  } else {
    // Requirement 11.2: export team_id, location_id, score, lo_user_id, created_at
    const { data: scoreLogs, error: scoreLogsError } = await supabase
      .from('score_logs')
      .select('team_id, activity_id, points_awarded, lo_id, created_at')
      .order('created_at', { ascending: true });

    if (scoreLogsError) {
      console.error('Export score_logs query error:', scoreLogsError);
      return Response.json({ error: 'Failed to fetch score logs data' }, { status: 500 });
    }

    const header = ['Team ID', 'Activity ID', 'Points', 'LO ID', 'Created At'];
    const dataRows = (scoreLogs ?? []).map((log) => [
      log.team_id,
      log.activity_id,
      log.points_awarded,
      log.lo_id,
      log.created_at,
    ]);

    csvContent = UTF8_BOM + buildCsv([header, ...dataRows]);
    filename = 'score-logs-export.csv';
  }

  // ── 4. Return CSV response ─────────────────────────────────────────────────
  // Requirement 11.3: downloadable file
  // Requirement 11.4: UTF-8 encoding with BOM for Indonesian character support
  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
