// Requirements: 8.1, 8.3

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

// Force dynamic rendering — no static caching at the Next.js layer.
// GET handlers are already dynamic by default in Next.js 15+, but this
// makes the intent explicit and ensures compatibility across deploy targets.
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

interface LeaderboardEntry {
  id: string;
  name: string;
  total_points: number;
  rank: number;
}

export async function GET(_request: NextRequest): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // ── 1. Find the active event ───────────────────────────────────────────────
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) {
    console.error('Leaderboard event lookup error:', eventError);
    return Response.json({ error: 'Failed to fetch active event' }, { status: 500 });
  }

  if (!event) {
    // No active event — return empty leaderboard
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=4, stale-while-revalidate=1',
      },
    });
  }

  // ── 2. Query teams for the active event, sorted by total_points DESC ───────
  // Requirement 8.1: sorted descending by total_points
  // Requirement 8.3: pre-calculated total_points column keeps this query fast
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, total_points')
    .eq('event_id', event.id)
    .order('total_points', { ascending: false });

  if (teamsError) {
    console.error('Leaderboard teams query error:', teamsError);
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }

  // ── 3. Assign rank (1-based, position in sorted array) ────────────────────
  const leaderboard: LeaderboardEntry[] = (teams ?? []).map((team, index) => ({
    id: team.id,
    name: team.name,
    total_points: team.total_points ?? 0,
    rank: index + 1,
  }));

  // ── 4. Return with HTTP cache headers ─────────────────────────────────────
  // s-maxage=4: CDN/proxy caches serve this for up to 4 seconds
  // stale-while-revalidate=1: serve stale for 1 extra second while revalidating
  // This means clients polling every 5s will see data at most ~5s old
  return new Response(JSON.stringify(leaderboard), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=4, stale-while-revalidate=1',
    },
  });
}
