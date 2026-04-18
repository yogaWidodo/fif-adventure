import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Authenticate LO
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, userId } = auth;

  // 2. Parse request body (team_id from QR)
  let body: { team_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { team_id } = body;
  if (typeof team_id !== 'string' || !team_id.trim()) {
    return Response.json({ error: 'team_id is required' }, { status: 400 });
  }

  // 3. Validate Event Status (Requirement 4.0)
  const { data: statusData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'event_status')
    .single();

  if (statusData?.value !== 'running') {
    return Response.json({ error: 'Event sedang tidak berlangsung.' }, { status: 403 });
  }

  // 4. Get LO profile and assignment
  // In V2, we link auth user to public user via auth_id
  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role, npk')
    .eq('auth_id', userId)
    .single();

  if (!userProfile || userProfile.role !== 'lo') {
    return Response.json({ error: 'Forbidden: Role LO diperlukan' }, { status: 403 });
  }

  const { data: assignment } = await supabase
    .from('lo_assignments')
    .select('activity_id')
    .eq('lo_id', userProfile.id)
    .single();

  if (!assignment) {
    return Response.json({ error: 'LO belum di-assign ke aktivitas manapun' }, { status: 403 });
  }

  // 5. Insert Registration (Check-in)
  const { data: registration, error: insertError } = await supabase
    .from('activity_registrations')
    .insert({
      team_id,
      activity_id: assignment.activity_id,
      checked_in_by: userProfile.id
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return Response.json({ error: 'Tim sudah check-in di aktivitas ini sebelumnya.' }, { status: 409 });
    }
    return Response.json({ error: 'Gagal melakukan check-in' }, { status: 500 });
  }

  return Response.json({ success: true, registration });
}
