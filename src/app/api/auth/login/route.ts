import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 9.5
// Login flow:
//   1. Validate nama + npk + no_unik are present
//   2. Lookup user by nama + npk (case-insensitive)
//   3. Validate user.no_unik === input_no_unik (same error message to prevent user enumeration)
//   4. Sign in via Supabase Auth with password = npk (not no_unik)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Use service role key for server-side operations (bypasses RLS)
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

export async function POST(request: NextRequest) {
  // Parse and validate request body
  let body: { nama?: unknown; npk?: unknown; no_unik?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { nama, npk, no_unik } = body;

  if (
    typeof nama !== 'string' || !nama.trim() ||
    typeof npk !== 'string' || !npk.trim() ||
    typeof no_unik !== 'string' || !no_unik.trim()
  ) {
    return Response.json(
      { error: 'nama, npk, and no_unik are required' },
      { status: 400 }
    );
  }

  // Use service role client for DB lookup (bypasses RLS)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Step 1: Look up user by nama + npk (case-insensitive)
  // no_unik is NOT part of the DB query — validated separately to prevent user enumeration
  const { data: userRecord, error: lookupError } = await supabaseAdmin
    .from('users')
    .select('id, nama, npk, role, team_id, event_id, no_unik')
    .ilike('npk', npk.trim())
    .ilike('nama', nama.trim())
    .single();

  if (lookupError || !userRecord) {
    console.error('[login] users table lookup failed:', lookupError?.message, { npk: npk.trim(), nama: nama.trim() });
    // Same error message regardless of whether user exists or no_unik is wrong (anti-enumeration)
    return Response.json({ error: 'Credentials not found' }, { status: 401 });
  }

  // Step 2: Validate no_unik matches — same error message as step 1 (anti-enumeration)
  if (!userRecord.no_unik || userRecord.no_unik !== no_unik.trim()) {
    console.error('[login] no_unik mismatch for user:', userRecord.npk);
    return Response.json({ error: 'Credentials not found' }, { status: 401 });
  }

  console.log('[login] credentials valid, found:', userRecord.npk, userRecord.role);

  // Step 3: Sign in via Supabase Auth — password = npk (not no_unik)
  const email = `${npk.trim().toLowerCase()}@fif.internal`;
  const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password: npk.trim(),
  });

  if (authError || !authData.session) {
    console.error('[login] Supabase Auth signInWithPassword failed:', authError?.message, { email });
    return Response.json({ error: 'Authentication failed' }, { status: 401 });
  }

  // Return session tokens + user info
  return Response.json({
    session: {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
    },
    user: {
      id: userRecord.id,
      nama: userRecord.nama,
      npk: userRecord.npk,
      role: userRecord.role,
      team_id: userRecord.team_id ?? null,
      event_id: userRecord.event_id ?? null,
    },
  });
}
