// Requirements: 7.2, 7.3, 7.4, 7.6

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isScoreValid } from '@/lib/auth';
import type { NextRequest } from 'next/server';

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
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;

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

  // ── 3. Look up location by location_id ────────────────────────────────────
  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('id, points, is_active, event_id')
    .eq('id', location_id.trim())
    .single();

  if (locationError || !location) {
    return Response.json({ error: 'Location not found' }, { status: 404 });
  }

  if (!location.is_active) {
    return Response.json({ error: 'Location is not active' }, { status: 404 });
  }

  // ── 4. Validate event is active and not expired ────────────────────────────
  if (location.event_id) {
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('is_active, end_time')
      .eq('id', location.event_id)
      .single();

    if (eventError || !event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    const now = new Date();
    const eventEnded = event.end_time ? new Date(event.end_time) <= now : false;

    if (!event.is_active || eventEnded) {
      return Response.json(
        { error: 'Event sudah berakhir, skor tidak dapat disubmit' },
        { status: 403 }
      );
    }
  }

  // ── 5. Validate score range: 0 <= score <= location.points ────────────────
  // Requirement 7.3
  if (!isScoreValid(score, location.points)) {
    return Response.json(
      { error: `Score must be between 0 and ${location.points}` },
      { status: 422 }
    );
  }

  // ── 5. Verify team has checked in (scan record exists) ────────────────────
  // Requirement 7.6
  const { data: scanRecord, error: scanError } = await supabase
    .from('scans')
    .select('id')
    .eq('team_id', team_id.trim())
    .eq('location_id', location_id.trim())
    .maybeSingle();

  if (scanError) {
    console.error('Scan lookup error:', scanError);
    return Response.json({ error: 'Failed to verify check-in' }, { status: 500 });
  }

  if (!scanRecord) {
    return Response.json(
      { error: 'Team has not checked in at this location' },
      { status: 422 }
    );
  }

  // ── 6. Check for duplicate score submission ────────────────────────────────
  // Requirement 7.2: prevent double-scoring the same team at the same location
  const { data: existingScore, error: existingScoreError } = await supabase
    .from('score_logs')
    .select('id')
    .eq('team_id', team_id.trim())
    .eq('location_id', location_id.trim())
    .maybeSingle();

  if (existingScoreError) {
    console.error('Score log lookup error:', existingScoreError);
    return Response.json({ error: 'Failed to check existing score' }, { status: 500 });
  }

  if (existingScore) {
    return Response.json(
      { error: 'Score already submitted for this team at this location' },
      { status: 409 }
    );
  }

  // ── 7. Insert into score_logs ─────────────────────────────────────────────
  // Requirement 7.4: trigger will automatically update teams.total_points
  const { error: insertError } = await supabase
    .from('score_logs')
    .insert({
      team_id: team_id.trim(),
      location_id: location_id.trim(),
      score,
      lo_user_id: userProfile.id,
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
