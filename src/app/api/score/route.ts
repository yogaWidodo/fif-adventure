// Requirements: 7.2, 7.3, 7.4, 7.6

import { createClient } from '@supabase/supabase-js';
import { isScoreValid } from '@/lib/auth';
import type { NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

export async function POST(request: NextRequest): Promise<Response> {
  // ── 1. Parse request body ──────────────────────────────────────────────────
  let body: { team_id?: unknown; location_id?: unknown; score?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { team_id, location_id, score } = body;

  if (typeof team_id !== 'string' || !team_id.trim()) {
    return Response.json({ error: 'team_id is required' }, { status: 400 });
  }
  if (typeof location_id !== 'string' || !location_id.trim()) {
    return Response.json({ error: 'location_id is required' }, { status: 400 });
  }
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return Response.json({ error: 'score must be a number' }, { status: 400 });
  }

  // ── 2. Validate session from cookie ───────────────────────────────────────
  const accessToken = await getAccessToken(request);

  if (!accessToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Build an authenticated Supabase client using the session token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  // Verify the token is valid and get the authenticated user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch the user's profile (role check — must be lo)
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_id', user.id)
    .single();

  if (profileError || !userProfile) {
    return Response.json({ error: 'User profile not found' }, { status: 401 });
  }

  if (userProfile.role !== 'lo') {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // ── 3. Look up activity by activity_id ────────────────────────────────────
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('id, max_points')
    .eq('id', location_id.trim())
    .single();

  if (activityError || !activity) {
    return Response.json({ error: 'Activity not found' }, { status: 404 });
  }

  // ── 4. Validate event is active ────────────────────────────
  const { data: statusData } = await supabase.from('settings').select('value').eq('key', 'event_status').single();
  if (statusData?.value !== 'running') {
    return Response.json({ error: 'Event sedang tidak berlangsung.' }, { status: 403 });
  }

  // ── 5. Validate score range ────────────────
  if (score < 0 || score > activity.max_points) {
    return Response.json(
      { error: `Score must be between 0 and ${activity.max_points}` },
      { status: 422 }
    );
  }

  // ── 5. Verify team has checked in (registration record exists) ────────────────────
  const { data: registration, error: regError } = await supabase
    .from('activity_registrations')
    .select('id')
    .eq('team_id', team_id.trim())
    .eq('activity_id', location_id.trim())
    .maybeSingle();

  if (regError) {
    console.error('Registration lookup error:', regError);
    return Response.json({ error: 'Failed to verify check-in' }, { status: 500 });
  }

  if (!registration) {
    return Response.json(
      { error: 'Team has not checked in at this activity' },
      { status: 422 }
    );
  }

  // ── 6. Check for duplicate score submission ────────────────────────────────
  const { data: existingScore, error: existingScoreError } = await supabase
    .from('score_logs')
    .select('id')
    .eq('team_id', team_id.trim())
    .eq('activity_id', location_id.trim())
    .maybeSingle();

  if (existingScoreError) {
    console.error('Score log lookup error:', existingScoreError);
    return Response.json({ error: 'Failed to check existing score' }, { status: 500 });
  }

  if (existingScore) {
    return Response.json(
      { error: 'Score already submitted for this team at this activity' },
      { status: 409 }
    );
  }

  // ── 7. Insert into score_logs ─────────────────────────────────────────────
  const { error: insertError } = await supabase
    .from('score_logs')
    .insert({
      team_id: team_id.trim(),
      activity_id: location_id.trim(),
      points_awarded: score,
      lo_id: userProfile.id,
    });

  if (insertError) {
    // Handle unique constraint violation (race condition fallback)
    if (insertError.code === '23505') {
      return Response.json(
        { error: 'Score already submitted for this team at this location' },
        { status: 409 }
      );
    }

    console.error('Score log insert error:', insertError);
    return Response.json({ error: 'Failed to save score' }, { status: 500 });
  }

  // ── 8. Return success ─────────────────────────────────────────────────────
  return Response.json({ success: true }, { status: 200 });
}
