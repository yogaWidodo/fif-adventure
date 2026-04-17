// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8, 9.1, 9.2, 9.3, 9.4, 9.5

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

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

  // ── 2. Validate session from cookie ───────────────────────────────────────
  // Requirement 9.4: validate sb-access-token before processing any request
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;

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

  // Requirement 9.3: LO can only check-in at their assigned location
  if (userProfile.assigned_location_id !== locationId) {
    return Response.json(
      { error: 'Anda tidak di-assign ke lokasi ini' },
      { status: 403 }
    );
  }

  // ── 5. Look up team by barcode_data ───────────────────────────────────────
  // Requirement 6.5: return HTTP 404 if barcode_data not found in teams table
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name, event_id')
    .eq('barcode_data', barcodeData)
    .single();

  if (teamError || !team) {
    return Response.json({ error: 'Tim tidak ditemukan' }, { status: 404 });
  }

  // ── 6. Validate event is active and not expired ────────────────────────────
  // Requirement 6.8: reject if event is inactive or has ended
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

  // ── 7. Insert scan record ─────────────────────────────────────────────────
  // Requirements 6.3, 6.4: insert with scanned_by = lo_user_id;
  // handle UNIQUE(team_id, location_id) violation with HTTP 409
  const { data: scanRecord, error: insertError } = await supabase
    .from('scans')
    .insert({
      team_id: team.id,
      location_id: locationId,
      scanned_by: userProfile.id,
    })
    .select('scanned_at')
    .single();

  if (insertError) {
    // PostgreSQL unique constraint violation
    if (insertError.code === '23505') {
      return Response.json(
        { error: 'Tim sudah check-in sebelumnya' },
        { status: 409 }
      );
    }

    console.error('[POST /api/lo/checkin] insert error:', insertError);
    return Response.json({ error: 'Gagal menyimpan check-in' }, { status: 500 });
  }

  // ── 8. Return success ─────────────────────────────────────────────────────
  return Response.json(
    {
      success: true,
      team_id: team.id,
      team_name: team.name,
      location_id: locationId,
      scanned_at: scanRecord.scanned_at,
    },
    { status: 200 }
  );
}
