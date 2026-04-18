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

  // Fetch the user's profile (role check — must be captain or vice_captain)
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('id, role, team_id')
    .eq('auth_id', user.id)
    .single();

  if (profileError || !userProfile) {
    return Response.json({ error: 'User profile not found' }, { status: 401 });
  }

  if (!['captain', 'vice_captain'].includes(userProfile.role)) {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // ── 3. Look up activity by barcode_data ───────────────────────────────────
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('id, name, type, max_points')
    .eq('barcode_data', barcode_data.trim())
    .single();

  if (activityError || !activity) {
    return Response.json({ success: false, message: 'Lokasi tidak ditemukan' }, { status: 404 });
  }

  // ── 4. Check event status ──────────────────────────────
  const { data: statusData } = await supabase.from('settings').select('value').eq('key', 'event_status').single();
  if (statusData?.value !== 'running') {
    return Response.json({ success: false, message: 'Event sedang tidak berlangsung.' }, { status: 403 });
  }

  // ── 5. Insert activity registration ─────────────────────────────────────────────────
  const { error: insertError } = await supabase
    .from('activity_registrations')
    .insert({
      team_id: team_id.trim(),
      activity_id: activity.id,
    });

  if (insertError) {
    if (insertError.code === '23505') {
      return Response.json({ success: false, message: 'Tim sudah pernah mengunjungi lokasi ini' }, { status: 409 });
    }
    return Response.json({ error: 'Gagal menyimpan scan' }, { status: 500 });
  }

  // Also log to score_logs if it's a fixed-point activity (legacy behavior)
  if (activity.max_points > 0) {
    await supabase.from('score_logs').insert({
      team_id: team_id.trim(),
      activity_id: activity.id,
      points_awarded: activity.max_points,
      lo_id: userProfile.id, // though Captain is scanning, we use their profile ID
    });
  }

  // ── 6. Return ScanResult ──────────────────────────────────────────────────
  const result: ScanResult = {
    success: true,
    message: `Berhasil! Found ${activity.name}`,
    location_name: activity.name,
    points_awarded: activity.max_points
  };

  return Response.json(result, { status: 200 });
}
