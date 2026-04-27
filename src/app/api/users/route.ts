import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { buildAuthEmail, formatDateForDB } from '@/lib/userManagement';
import { isValidRole } from '@/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

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
      name,
      npk,
      role,
      birth_date,
      team_id,
      created_at,
      teams (
        name
      ),
      lo_assignments (
        activity_id,
        activities (
          name
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/users] error:', error.message);
    return Response.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  const users = (data ?? []).map((u: any) => {
    const assignments = Array.isArray(u.lo_assignments) ? u.lo_assignments : (u.lo_assignments ? [u.lo_assignments] : []);
    const activityNames = assignments.map((a: any) => a.activities?.name).filter(Boolean);

    return {
      id: u.id,
      auth_id: u.auth_id,
      name: u.name,
      npk: u.npk,
      role: u.role,
      birth_date: u.birth_date ?? null,
      team_id: u.team_id ?? null,
      team_name: u.teams?.name ?? null,
      activity_id: assignments[0]?.activity_id ?? null,
      activity_name: activityNames.join(', ') || null,
      activity_ids: assignments.map((a: any) => a.activity_id),
      created_at: u.created_at,
    };
  });

  return Response.json({ users });
}

// POST /api/users — create a single user
export async function POST(request: NextRequest) {
  let body: { name?: unknown; npk?: unknown; role?: unknown; birth_date?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, npk, role, birth_date } = body;

  // Validate required fields
  if (typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }
  if (typeof npk !== 'string' || !npk.trim()) {
    return Response.json({ error: 'npk is required' }, { status: 400 });
  }
  if (typeof birth_date !== 'string' || !birth_date.trim()) {
    return Response.json({ error: 'birth_date is required' }, { status: 400 });
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

  // Create Supabase Auth account — password = birth_date
  const email = buildAuthEmail(npk.trim());
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: birth_date.trim(),
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
      name: name.trim(),
      npk: npk.trim(),
      role,
      birth_date: formatDateForDB(birth_date.trim()),
      team_id: null,
    })
    .select()
    .single();

  if (insertError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    console.error('[POST /api/users] insert failed:', insertError.message);
    return Response.json({ error: 'Failed to create user' }, { status: 500 });
  }

  return Response.json({ user: userRecord }, { status: 201 });
}
