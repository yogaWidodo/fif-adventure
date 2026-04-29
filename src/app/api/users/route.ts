import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { buildAuthEmail, formatDateForDB } from '@/lib/userManagement';
import { isValidRole } from '@/lib/auth';
import { getAuthenticatedClient } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/users — list users with pagination, search, and filtering
export async function GET(request: NextRequest) {
  // 1. Authenticate Requester
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase: userSupabase, userId: requesterId } = auth;

  // 2. Verify Admin Role
  const { data: requesterProfile } = await userSupabase
    .from('users')
    .select('role')
    .eq('auth_id', requesterId)
    .single();

  if (!requesterProfile || requesterProfile.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const role = searchParams.get('role') || 'all';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');

  const supabaseAdmin = getAdminClient();

  let query = supabaseAdmin
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
    `, { count: 'exact' });

  // Filters
  if (role !== 'all') {
    query = query.eq('role', role);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,npk.ilike.%${search}%`);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

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

  // Get accurate counts for each role from database (unfiltered by search/role)
  const roles = ['admin', 'captain', 'member', 'lo'];
  const countPromises = roles.map(r => 
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', r)
  );
  const totalCountPromise = supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
  
  const [countResults, totalResult] = await Promise.all([
    Promise.all(countPromises),
    totalCountPromise
  ]);

  const roleCounts: Record<string, number> = { all: totalResult.count || 0 };
  
  roles.forEach((r, i) => {
    roleCounts[r] = countResults[i].count || 0;
  });

  return Response.json({ users, total: count || 0, roleCounts });
}

// POST /api/users — create a single user
export async function POST(request: NextRequest) {
  // 1. Authenticate Requester
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase: userSupabase, userId: requesterId } = auth;

  // 2. Verify Admin Role
  const { data: requesterProfile } = await userSupabase
    .from('users')
    .select('role')
    .eq('auth_id', requesterId)
    .single();

  if (!requesterProfile || requesterProfile.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

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
