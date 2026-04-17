// Requirements: 5.3, 5.4, 6.3, 9.3

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

interface ClaimResult {
  success: boolean;
  message: string;
  quota_remaining?: number;
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
    const result: ClaimResult = {
      success: false,
      message: 'Lokasi tidak ditemukan',
    };
    return Response.json(result, { status: 404 });
  }

  // Requirement 6.5: inactive location → 404
  if (!location.is_active) {
    const result: ClaimResult = {
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
    const result: ClaimResult = {
      success: false,
      message: 'Event tidak aktif atau sudah berakhir',
    };
    return Response.json(result, { status: 403 });
  }

  // ── 5. Call claim_treasure RPC (atomic: quota check + insert in one tx) ───
  // Requirement 5.3, 5.4, 6.3: atomic claim via PostgreSQL function
  const { data: rpcResult, error: rpcError } = await supabase.rpc('claim_treasure', {
    p_team_id: team_id.trim(),
    p_location_id: location.id,
    p_scanned_by: userProfile.id,
  });

  if (rpcError) {
    console.error('claim_treasure RPC error:', rpcError);
    return Response.json({ error: 'Gagal memproses klaim' }, { status: 500 });
  }

  // rpcResult is the JSONB returned by the PostgreSQL function
  const rpc = rpcResult as {
    success: boolean;
    message: string;
    points_awarded?: number;
    quota_remaining?: number;
  };

  if (!rpc.success) {
    // Map RPC failure messages to appropriate HTTP status codes
    if (
      rpc.message === 'Already claimed by your team' ||
      rpc.message === 'Already visited'
    ) {
      return Response.json({ error: 'Already visited' }, { status: 409 });
    }
    if (rpc.message === 'Quota exhausted') {
      return Response.json({ error: 'Quota exhausted' }, { status: 409 });
    }
    // Generic failure (e.g. treasure not found)
    const result: ClaimResult = {
      success: false,
      message: rpc.message,
    };
    return Response.json(result, { status: 422 });
  }

  // ── 6. Return ClaimResult ─────────────────────────────────────────────────
  const result: ClaimResult = {
    success: true,
    message: rpc.message ?? 'Treasure berhasil diklaim!',
    quota_remaining: rpc.quota_remaining,
  };

  return Response.json(result, { status: 200 });
}
