// Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 9.3

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/serverAuth';

interface ScanResult {
  success: boolean;
  message: string;
  location_name?: string;
  points_awarded?: number;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

export async function POST(request: NextRequest): Promise<Response> {
  // ── 1. Parse request body ──────────────────────────────────────────────────
  let body: { barcode_data?: unknown; team_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { barcode_data, team_id } = body;

  if (typeof barcode_data !== 'string' || !barcode_data.trim()) {
    return Response.json({ error: 'barcode_data is required' }, { status: 400 });
  }
  if (typeof team_id !== 'string' || !team_id.trim()) {
    return Response.json({ error: 'team_id is required' }, { status: 400 });
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

  // Fetch the user's profile (role check — must be kaptain or cocaptain)
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('id, role, team_id')
    .eq('auth_id', user.id)
    .single();

  if (profileError || !userProfile) {
    return Response.json({ error: 'User profile not found' }, { status: 401 });
  }

  if (!['kaptain', 'cocaptain'].includes(userProfile.role)) {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // ── 3. Look up location by barcode_data ───────────────────────────────────
  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('id, event_id, name, type, points, is_active')
    .eq('barcode_data', barcode_data.trim())
    .single();

  if (locationError || !location) {
    const result: ScanResult = {
      success: false,
      message: 'Lokasi tidak ditemukan',
    };
    return Response.json(result, { status: 404 });
  }

  // Requirement 6.5: inactive location → 404
  if (!location.is_active) {
    const result: ScanResult = {
      success: false,
      message: 'Lokasi tidak aktif',
    };
    return Response.json(result, { status: 404 });
  }

  // ── 4. Check event is active and not expired ──────────────────────────────
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('is_active, end_time')
    .eq('id', location.event_id)
    .single();

  if (eventError || !event) {
    return Response.json({ error: 'Event tidak ditemukan' }, { status: 404 });
  }

  // Requirement 9.3: reject if event is inactive or has ended
  const now = new Date();
  const eventEnded = event.end_time ? new Date(event.end_time) <= now : false;

  if (!event.is_active || eventEnded) {
    const result: ScanResult = {
      success: false,
      message: 'Event tidak aktif atau sudah berakhir',
    };
    return Response.json(result, { status: 403 });
  }

  // ── 5. Insert scan record ─────────────────────────────────────────────────
  // Requirement 6.4: UNIQUE(team_id, location_id) → 409 on duplicate
  const { data: scanRecord, error: insertError } = await supabase
    .from('scans')
    .insert({
      team_id: team_id.trim(),
      location_id: location.id,
      scanned_by: userProfile.id,
      points_awarded: location.points,
    })
    .select('id')
    .single();

  if (insertError) {
    // PostgreSQL unique violation error code
    if (insertError.code === '23505') {
      const result: ScanResult = {
        success: false,
        message: 'Tim sudah pernah mengunjungi lokasi ini',
      };
      return Response.json(result, { status: 409 });
    }

    console.error('Scan insert error:', insertError);
    return Response.json({ error: 'Gagal menyimpan scan' }, { status: 500 });
  }

  // ── 6. Return ScanResult ──────────────────────────────────────────────────
  const result: ScanResult = {
    success: true,
    message: `Berhasil! +${location.points} poin`,
    location_name: location.name,
    points_awarded: location.points,
  };

  void scanRecord; // used only to confirm insert succeeded

  return Response.json(result, { status: 200 });
}
