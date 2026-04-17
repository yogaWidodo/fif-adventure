// Requirements: 7.3, 7.4, 7.5, 7.6, 7.8, 7.9, 7.11, 9.1, 9.2, 9.3, 9.4, 9.5

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAccessToken, isEventPaused } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

export async function POST(request: NextRequest): Promise<Response> {
  // ── 1. Parse request body ──────────────────────────────────────────────────
  let body: { barcode_data?: unknown; location_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { barcode_data, location_id } = body;

  if (typeof barcode_data !== 'string' || !barcode_data.trim()) {
    return Response.json({ error: 'barcode_data is required' }, { status: 400 });
  }
  if (typeof location_id !== 'string' || !location_id.trim()) {
    return Response.json({ error: 'location_id is required' }, { status: 400 });
  }

  const barcodeData = barcode_data.trim();
  const locationId = location_id.trim();

  // ── 2. Validate session (cookie or Authorization header) ───────────────────
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

  // ── 3. Fetch user profile and validate role ────────────────────────────────
  // Requirements 9.1, 9.2: reject non-LO users with HTTP 403
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('id, role, assigned_location_id')
    .eq('auth_id', user.id)
    .single();

  if (profileError || !userProfile) {
    return Response.json({ error: 'User profile not found' }, { status: 401 });
  }

  if (userProfile.role !== 'lo') {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // ── 4. Validate assigned_location_id matches requested location_id ─────────
  // Requirement 9.5: LO without assignment → HTTP 403
  if (!userProfile.assigned_location_id) {
    return Response.json(
      { error: 'LO belum di-assign ke lokasi manapun' },
      { status: 403 }
    );
  }

  // Requirement 9.3: LO can only score at their assigned location
  if (userProfile.assigned_location_id !== locationId) {
    return Response.json(
      { error: 'Anda tidak di-assign ke lokasi ini' },
      { status: 403 }
    );
  }

  // ── 5. Look up team by barcode_data ───────────────────────────────────────
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name, event_id')
    .eq('barcode_data', barcodeData)
    .single();

  if (teamError || !team) {
    return Response.json({ error: 'Tim tidak ditemukan' }, { status: 404 });
  }

  // ── 6. Validate event is active and not expired ────────────────────────────
  // Requirement 7.9: reject if event is inactive or has ended
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('is_active, end_time')
    .eq('id', team.event_id)
    .single();

  if (eventError || !event) {
    return Response.json({ error: 'Event tidak ditemukan' }, { status: 404 });
  }

  const now = new Date();
  const eventEnded = event.end_time ? new Date(event.end_time) <= now : false;

  if (!event.is_active || eventEnded) {
    return Response.json({ error: 'Event sudah berakhir' }, { status: 403 });
  }

  // ── 6b. Block if event is paused ──────────────────────────────────────────
  const paused = await isEventPaused(supabase, team.event_id);
  if (paused) {
    return Response.json({ error: 'Event sedang dijeda. Tunggu hingga event dilanjutkan.' }, { status: 403 });
  }

  // ── 7. Fetch location to get points value ─────────────────────────────────
  // Requirement 7.5: score must equal locations.points (not caller-supplied)
  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('points')
    .eq('id', locationId)
    .single();

  if (locationError || !location) {
    return Response.json({ error: 'Lokasi tidak ditemukan' }, { status: 404 });
  }

  // ── 8. Verify team has checked in ─────────────────────────────────────────
  // Requirement 7.4: HTTP 422 if team has not checked in yet
  const { data: scanRecord, error: scanLookupError } = await supabase
    .from('scans')
    .select('id')
    .eq('team_id', team.id)
    .eq('location_id', locationId)
    .maybeSingle();

  if (scanLookupError) {
    console.error('[POST /api/lo/score] scan lookup error:', scanLookupError);
    return Response.json({ error: 'Gagal memverifikasi check-in' }, { status: 500 });
  }

  if (!scanRecord) {
    return Response.json(
      { error: 'Tim belum check-in di wahana ini' },
      { status: 422 }
    );
  }

  // ── 9. Check for duplicate score submission ────────────────────────────────
  // Requirement 7.6, 7.11: HTTP 409 if score_logs record already exists
  const { data: existingScore, error: existingScoreError } = await supabase
    .from('score_logs')
    .select('id')
    .eq('team_id', team.id)
    .eq('location_id', locationId)
    .maybeSingle();

  if (existingScoreError) {
    console.error('[POST /api/lo/score] score_logs lookup error:', existingScoreError);
    return Response.json({ error: 'Gagal memeriksa data poin' }, { status: 500 });
  }

  if (existingScore) {
    return Response.json(
      { error: 'Tim sudah mendapat poin di wahana ini' },
      { status: 409 }
    );
  }

  // ── 10. Insert into score_logs ────────────────────────────────────────────
  // Requirement 7.5: score = locations.points; lo_user_id = authenticated LO
  const { data: scoreLog, error: insertError } = await supabase
    .from('score_logs')
    .insert({
      team_id: team.id,
      location_id: locationId,
      score: location.points,
      lo_user_id: userProfile.id,
    })
    .select('created_at')
    .single();

  if (insertError) {
    // Handle unique constraint violation as a race-condition fallback
    if (insertError.code === '23505') {
      return Response.json(
        { error: 'Tim sudah mendapat poin di wahana ini' },
        { status: 409 }
      );
    }

    console.error('[POST /api/lo/score] insert error:', insertError);
    return Response.json({ error: 'Gagal menyimpan poin' }, { status: 500 });
  }

  // ── 11. Return success ────────────────────────────────────────────────────
  return Response.json(
    {
      success: true,
      team_id: team.id,
      team_name: team.name,
      location_id: locationId,
      score: location.points,
      created_at: scoreLog.created_at,
    },
    { status: 200 }
  );
}
