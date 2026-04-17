import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { buildAuthEmail } from '@/lib/userManagement';
import { isValidRole } from '@/lib/auth';

// Requirements: 2.3, 2.4, 2.6, 2.7, 2.8, 2.9, 7.1, 7.2, 7.3, 7.6, 9.2, 9.3

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/users — list all users with team name
export async function GET() {
  const supabaseAdmin = getAdminClient();

  const { data, error } = await supabaseAdmin
    .from('users')
    .select(`
      id,
      auth_id,
      nama,
      npk,
      role,
      no_unik,
      team_id,
      event_id,
      assigned_location_id,
      created_at,
      teams (
        name
      ),
      events (
        name
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/users] error:', error.message);
    return Response.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  // Fetch all unique location IDs to get location names
  const locationIds = [...new Set((data ?? []).map((u: any) => u.assigned_location_id).filter(Boolean))];
  let locationMap: Record<string, string> = {};

  if (locationIds.length > 0) {
    const { data: locations } = await supabaseAdmin
      .from('locations')
      .select('id, name')
      .in('id', locationIds);

    if (locations) {
      locationMap = Object.fromEntries(locations.map((loc: any) => [loc.id, loc.name]));
    }
  }

  const users = (data ?? []).map((u: any) => ({
    id: u.id,
    auth_id: u.auth_id,
    nama: u.nama,
    npk: u.npk,
    role: u.role,
    no_unik: u.no_unik ?? null,
    team_id: u.team_id ?? null,
    team_name: u.teams?.name ?? null,
    event_id: u.event_id ?? null,
    event_name: u.events?.name ?? null,
    assigned_location_id: u.assigned_location_id ?? null,
    assigned_location_name: u.assigned_location_id ? (locationMap[u.assigned_location_id] ?? null) : null,
    created_at: u.created_at,
  }));

  return Response.json({ users });
}

// POST /api/users — create a single user
export async function POST(request: NextRequest) {
  let body: { nama?: unknown; npk?: unknown; role?: unknown; event_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { nama, npk, role, event_id } = body;

  // Validate required fields
  if (typeof nama !== 'string' || !nama.trim()) {
    return Response.json({ error: 'nama is required' }, { status: 400 });
  }
  if (typeof npk !== 'string' || !npk.trim()) {
    return Response.json({ error: 'npk is required' }, { status: 400 });
  }
  if (typeof role !== 'string' || !isValidRole(role)) {
    return Response.json({ error: 'role is invalid' }, { status: 400 });
  }

  const supabaseAdmin = getAdminClient();

  // Check if npk already exists
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('npk', npk.trim())
    .maybeSingle();

  if (existing) {
    return Response.json({ error: 'NPK already exists' }, { status: 409 });
  }

  // Create Supabase Auth account — password = npk
  const email = buildAuthEmail(npk.trim());
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: npk.trim(),
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error('[POST /api/users] auth createUser failed:', authError?.message);
    return Response.json({ error: 'Failed to create auth account' }, { status: 500 });
  }

  // Insert user record
  const { data: userRecord, error: insertError } = await supabaseAdmin
    .from('users')
    .insert({
      auth_id: authData.user.id,
      nama: nama.trim(),
      npk: npk.trim(),
      role,
      no_unik: null,
      team_id: null,
      event_id: typeof event_id === 'string' && event_id ? event_id : null,
    })
    .select()
    .single();

  if (insertError) {
    // Rollback: delete the auth account we just created
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    console.error('[POST /api/users] insert failed:', insertError.message);
    return Response.json({ error: 'Failed to create user' }, { status: 500 });
  }

  return Response.json({ user: userRecord }, { status: 201 });
}
