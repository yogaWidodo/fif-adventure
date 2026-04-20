// Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 9.3

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/serverAuth';

interface ScanResult {
  success: boolean;
  message: string;
  location_type?: string;
  points_awarded?: number;
  description?: string | null;
  how_to_play?: string | null;
  already_discovered?: boolean;
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
    .select('id, name, type, max_points, description, how_to_play')
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

  // ── 5. Check if already discovered (Optional Info) ────────────────────────
  const { data: existingReg } = await supabase
    .from('activity_registrations')
    .select('id')
    .eq('team_id', team_id.trim())
    .eq('activity_id', activity.id)
    .maybeSingle();

  // ── 6. Return ScanResult ──────────────────────────────────────────────────
  const result: ScanResult = {
    success: true,
    message: `Berhasil! Intel recovered for ${activity.name}`,
    location_type: activity.type,
    points_awarded: 0,
    description: activity.description,
    how_to_play: activity.how_to_play,
    already_discovered: !!existingReg
  };

  return Response.json(result, { status: 200 });
}
