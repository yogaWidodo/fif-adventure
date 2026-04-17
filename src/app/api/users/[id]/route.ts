import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { buildAuthEmail } from '@/lib/userManagement';
import { isValidRole } from '@/lib/auth';

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

// PATCH /api/users/[id] — update user fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: {
    nama?: unknown;
    npk?: unknown;
    role?: unknown;
    event_id?: unknown;
    team_id?: unknown;
    no_unik?: unknown;
    assigned_location_id?: unknown;
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
    .select('id, auth_id, npk, nama, role')
    .eq('id', id)
    .single();

  if (fetchError || !currentUser) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  // Build update payload — only include fields that were sent
  const updates: Record<string, unknown> = {};

  if (typeof body.nama === 'string') {
    if (!body.nama.trim()) {
      return Response.json({ error: 'nama cannot be empty' }, { status: 400 });
    }
    updates.nama = body.nama.trim();
  }

  if (typeof body.role === 'string') {
    if (!isValidRole(body.role)) {
      return Response.json({ error: 'role is invalid' }, { status: 400 });
    }
    updates.role = body.role;
  }

  // event_id can be null (unassign from event)
  if ('event_id' in body) {
    updates.event_id = typeof body.event_id === 'string' && body.event_id ? body.event_id : null;
  }

  // team_id + no_unik for team assignment (both must be updated together)
  if ('team_id' in body) {
    updates.team_id = typeof body.team_id === 'string' && body.team_id ? body.team_id : null;
  }
  if ('no_unik' in body) {
    updates.no_unik = typeof body.no_unik === 'string' && body.no_unik ? body.no_unik : null;
  }

  // assigned_location_id: assign LO to a location (UUID) or unassign (null)
  if ('assigned_location_id' in body) {
    if (body.assigned_location_id === null || body.assigned_location_id === undefined) {
      // Unassign — set to NULL
      updates.assigned_location_id = null;
    } else if (typeof body.assigned_location_id === 'string' && body.assigned_location_id) {
      // Validate that the location exists
      const { data: location, error: locationError } = await supabaseAdmin
        .from('locations')
        .select('id')
        .eq('id', body.assigned_location_id)
        .maybeSingle();

      if (locationError) {
        console.error('[PATCH /api/users] location lookup failed:', locationError.message);
        return Response.json({ error: 'Failed to validate location' }, { status: 500 });
      }

      if (!location) {
        return Response.json({ error: 'Lokasi tidak ditemukan' }, { status: 404 });
      }

      updates.assigned_location_id = body.assigned_location_id;
    } else {
      return Response.json({ error: 'assigned_location_id must be a UUID string or null' }, { status: 400 });
    }
  }

  // Handle npk change — requires updating Supabase Auth email + password
  const newNpk = typeof body.npk === 'string' ? body.npk.trim() : null;
  if (newNpk !== null && newNpk !== currentUser.npk) {
    if (!newNpk) {
      return Response.json({ error: 'npk cannot be empty' }, { status: 400 });
    }

    if (!currentUser.auth_id) {
      return Response.json({ error: 'User has no auth account to update' }, { status: 400 });
    }

    // Update Supabase Auth email and password first
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      currentUser.auth_id,
      {
        email: buildAuthEmail(newNpk),
        password: newNpk,
      }
    );

    if (authUpdateError) {
      console.error('[PATCH /api/users] auth update failed:', authUpdateError.message);
      return Response.json({ error: 'Failed to update auth account' }, { status: 500 });
    }

    updates.npk = newNpk;
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
    // Check for unique constraint violation on (team_id, no_unik)
    if (updateError.code === '23505') {
      return Response.json({ error: 'no_unik sudah digunakan di tim tersebut' }, { status: 409 });
    }
    return Response.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return Response.json({ user: updatedUser });
}
