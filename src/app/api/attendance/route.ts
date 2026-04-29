import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Haversine formula — returns distance in meters between two lat/lng points */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: NextRequest) {
  // 1. Authenticate Requester
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase: userSupabase, userId: requesterAuthId } = auth;

  let body: { user_id?: unknown; lat?: unknown; lng?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { user_id, lat, lng } = body;

  if (!user_id || typeof user_id !== 'string') {
    return Response.json({ error: 'user_id required' }, { status: 400 });
  }

  // Verify that the user is marking attendance for THEMSELVES, or is an Admin
  const { data: requesterProfile } = await userSupabase
    .from('users')
    .select('id, role')
    .eq('auth_id', requesterAuthId)
    .single();

  if (!requesterProfile) {
    return Response.json({ error: 'User profile not found' }, { status: 403 });
  }

  // Security Check: Only allow self-attendance or admin-attendance
  if (requesterProfile.id !== user_id && requesterProfile.role !== 'admin') {
    return Response.json({ error: 'Hanya bisa mencatat absensi untuk diri sendiri.' }, { status: 403 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch geofence settings
  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', ['venue_lat', 'venue_lng', 'venue_radius_meters', 'geofence_enabled']);

  const settingsMap: Record<string, string> = {};
  (settings ?? []).forEach((s: { key: string; value: string }) => {
    settingsMap[s.key] = s.value;
  });

  const geofenceEnabled = settingsMap['geofence_enabled'] === 'true';
  const venueLat = parseFloat(settingsMap['venue_lat'] ?? '');
  const venueLng = parseFloat(settingsMap['venue_lng'] ?? '');
  const venueRadius = parseFloat(settingsMap['venue_radius_meters'] ?? '500');

  let withinGeofence = true; // default: allowed if geofence not enabled or no coords from client
  let distanceMeters: number | null = null;

  if (geofenceEnabled && !isNaN(venueLat) && !isNaN(venueLng)) {
    // If geofence is on but client didn't send coords → deny
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat as number) || isNaN(lng as number)) {
      return Response.json(
        { error: 'Geolokasi diperlukan untuk absensi. Mohon izinkan akses lokasi.' },
        { status: 403 }
      );
    }

    distanceMeters = haversineDistance(lat as number, lng as number, venueLat, venueLng);
    withinGeofence = distanceMeters <= venueRadius;

    if (!withinGeofence) {
      return Response.json(
        {
          error: `Anda berada ${Math.round(distanceMeters)}m dari venue (maks. ${Math.round(venueRadius)}m). Hadir di lokasi acara untuk absensi.`,
          distance_meters: Math.round(distanceMeters),
          within_geofence: false,
        },
        { status: 403 }
      );
    }
  }

  // Mark user as present
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      is_login: true,
      login_at: new Date().toISOString(),
      login_lat: typeof lat === 'number' ? lat : null,
      login_lng: typeof lng === 'number' ? lng : null,
    })
    .eq('id', user_id);

  if (updateError) {
    console.error('[attendance] update error:', updateError.message);
    return Response.json({ error: 'Gagal mencatat kehadiran' }, { status: 500 });
  }

  return Response.json({
    success: true,
    within_geofence: withinGeofence,
    distance_meters: distanceMeters !== null ? Math.round(distanceMeters) : null,
  });
}

/** GET /api/attendance — return attendance summary for admin */
export async function GET(request: NextRequest) {
  // 1. Authenticate Requester
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase: userSupabase, userId: requesterAuthId } = auth;

  // 2. Verify Admin Role
  const { data: requesterProfile } = await userSupabase
    .from('users')
    .select('role')
    .eq('auth_id', requesterAuthId)
    .single();

  if (!requesterProfile || requesterProfile.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, name, npk, role, team_id, is_login, login_at, login_lat, login_lng')
    .in('role', ['captain', 'vice_captain', 'member', 'lo'])
    .order('is_login', { ascending: false })
    .order('login_at', { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const present = (users ?? []).filter(u => u.is_login).length;
  const absent = (users ?? []).length - present;

  return Response.json({ users: users ?? [], summary: { present, absent, total: users?.length ?? 0 } });
}
