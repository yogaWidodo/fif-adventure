import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { buildAuthEmail, formatDateForDB } from '@/lib/userManagement';
import { isValidRole } from '@/lib/auth';
import { getAuthenticatedClient } from '@/lib/serverAuth';

// Requirements: 3.3, 3.4, 3.5, 3.7, 3.8, 7.5, 2.3, 2.4, 2.5, 2.6

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  let body: {
    name?: unknown;
    npk?: unknown;
    role?: unknown;
    team_id?: unknown;
    birth_date?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabaseAdmin = getAdminClient();

  // Fetch current user record
  const { data: currentUser, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('id, auth_id, npk, name, role, team_id')
    .eq('id', id)
    .single();

  if (fetchError || !currentUser) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  // Build update payload — only include fields that were sent
  const updates: Record<string, unknown> = {};

  if (typeof body.name === 'string') {
    if (!body.name.trim()) {
      return Response.json({ error: 'name cannot be empty' }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (typeof body.role === 'string') {
    if (!isValidRole(body.role)) {
      return Response.json({ error: 'role is invalid' }, { status: 400 });
    }
    updates.role = body.role;
  }

  // team_id for team assignment
  if ('team_id' in body) {
    updates.team_id = typeof body.team_id === 'string' && body.team_id ? body.team_id : null;
  }

  // birth_date for user authentication/updates
  if (typeof body.birth_date === 'string') {
    if (!body.birth_date.trim()) {
      return Response.json({ error: 'birth_date cannot be empty' }, { status: 400 });
    }
    updates.birth_date = formatDateForDB(body.birth_date.trim());
  }

  // Handle NPK or Birth Date change — requires updating Supabase Auth email and/or password
  const newNpk = typeof body.npk === 'string' ? body.npk.trim() : null;
  const newBirthDateRaw = typeof body.birth_date === 'string' ? body.birth_date.trim() : null;
  
  const npkChanged = newNpk !== null && newNpk !== currentUser.npk;
  const birthDateChanged = newBirthDateRaw !== null;

  if ((npkChanged || birthDateChanged) && currentUser.auth_id) {
    const authUpdates: any = {};
    
    if (npkChanged) {
      if (!newNpk) return Response.json({ error: 'npk cannot be empty' }, { status: 400 });
      authUpdates.email = buildAuthEmail(newNpk);
      updates.npk = newNpk;
    }
    
    if (birthDateChanged) {
      authUpdates.password = newBirthDateRaw; // Password is the raw ddmmyyyy string
    } else if (npkChanged) {
      // If NPK changed but birth_date didn't, we still want to ensure password is the current birth_date
      // In this system, the password is DDMMYYYY.
      const { data: userWithBirthDate } = await supabaseAdmin
        .from('users')
        .select('birth_date')
        .eq('id', id)
        .single();
        
      if (userWithBirthDate?.birth_date) {
        // Convert YYYY-MM-DD back to DDMMYYYY for the password
        const [y, m, d] = userWithBirthDate.birth_date.split('-');
        authUpdates.password = `${d}${m}${y}`;
      }
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      currentUser.auth_id,
      authUpdates
    );

    if (authUpdateError) {
      console.error('[PATCH /api/users] auth update failed:', authUpdateError.message);
      return Response.json({ error: `Gagal memperbarui akun login: ${authUpdateError.message}` }, { status: 500 });
    }
  } else if (npkChanged) {
    if (!newNpk) return Response.json({ error: 'npk cannot be empty' }, { status: 400 });
    updates.npk = newNpk;
  }

  // Enforce "one captain per team" rule
  const finalRole = (updates.role as string) || currentUser.role;
  const finalTeamId = 'team_id' in updates ? (updates.team_id as string | null) : currentUser.team_id;

  if (finalRole === 'captain' && finalTeamId) {
    const { data: existingCaptain } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('team_id', finalTeamId)
      .eq('role', 'captain')
      .neq('id', id)
      .maybeSingle();

    if (existingCaptain) {
      return Response.json(
        { error: 'Tim ini sudah memiliki kapten. Satu tim hanya boleh memiliki satu kapten.' },
        { status: 400 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Update user record in DB
  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('[PATCH /api/users] update failed:', updateError.message);
    return Response.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return Response.json({ user: updatedUser });
}

// DELETE /api/users/[id] — soft-delete (Req. 4.1: preserve historical log)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const supabaseAdmin = getAdminClient();

  const { data: currentUser, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('id, auth_id, role')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !currentUser) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  // Clear lo_assignments if role = lo before soft-deleting
  if (currentUser.role === 'lo') {
    await supabaseAdmin.from('lo_assignments').delete().eq('lo_id', id);
  }

  // Soft-delete: set deleted_at instead of hard DELETE
  const { error: deleteError } = await supabaseAdmin
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (deleteError) {
    console.error('[DELETE /api/users] soft-delete failed:', deleteError.message);
    return Response.json({ error: 'Failed to delete user' }, { status: 500 });
  }

  return Response.json({ success: true });
}
