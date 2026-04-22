import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function assertEventRunning(supabase: any) {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'event_status')
    .single();
  if (data?.value !== 'running') {
    throw new Error('EVENT_NOT_RUNNING');
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, userId } = auth;

  // 2. Parse request body
  let body: { team_id?: unknown; points?: unknown; activity_id?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { team_id, points, activity_id, note } = body;
  if (typeof team_id !== 'string' || !team_id.trim()) {
    return Response.json({ error: 'team_id is required' }, { status: 400 });
  }
  if (typeof points !== 'number') {
    return Response.json({ error: 'points must be a number' }, { status: 400 });
  }
  if (typeof activity_id !== 'string' || !activity_id.trim()) {
    return Response.json({ error: 'activity_id is required' }, { status: 400 });
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

  // 4. Get LO profile and verify assignment
  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_id', userId)
    .single();

  if (!userProfile || userProfile.role !== 'lo') {
    return Response.json({ error: 'Forbidden: Role LO diperlukan' }, { status: 403 });
  }

  const { data: assignment } = await supabase
    .from('lo_assignments')
    .select('activity_id')
    .eq('lo_id', userProfile.id)
    .eq('activity_id', activity_id)
    .maybeSingle();

  if (!assignment) {
    return Response.json({ error: 'Anda tidak di-assign ke aktivitas ini' }, { status: 403 });
  }

  // 5. Check if Team has checked in (Requirement 7.2)
  const { data: checkin } = await supabase
    .from('activity_registrations')
    .select('id')
    .eq('team_id', team_id)
    .eq('activity_id', activity_id)
    .single();

  if (!checkin) {
    return Response.json({ error: 'Tim belum check-in di aktivitas ini.' }, { status: 422 });
  }

  // 6. Insert Score Log
  const { error: insertError } = await supabase
    .from('score_logs')
    .insert({
      team_id,
      activity_id,
      lo_id: userProfile.id,
      points_awarded: points,
      note: note as string
    });

  if (insertError) {
    if (insertError.code === '23505') return Response.json({ error: 'Tim sudah dinilai' }, { status: 409 });
    return Response.json({ error: 'Gagal menyimpan poin' }, { status: 500 });
  }

  return Response.json({ success: true, message: 'Points successfully awarded.' });
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, userId } = auth;

  let body: { team_id?: unknown; points?: unknown; activity_id?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { team_id, points, activity_id, note } = body;
  const pointsAwarded = Number(points);

  if (!team_id || !activity_id || isNaN(pointsAwarded)) {
    return Response.json({ error: 'team_id, activity_id and valid points are required' }, { status: 400 });
  }

  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_id', userId)
    .single();

  if (!userProfile || userProfile.role !== 'lo') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { data: assignment } = await supabase
    .from('lo_assignments')
    .select('activity_id')
    .eq('lo_id', userProfile.id)
    .eq('activity_id', activity_id)
    .maybeSingle();

  if (!assignment) return Response.json({ error: 'Anda tidak di-assign ke aktivitas ini' }, { status: 403 });

  const { error: updateError } = await supabase
    .from('score_logs')
    .update({
      points_awarded: pointsAwarded,
      note: note as string,
      edited_by: userProfile.id,
      updated_at: new Date().toISOString()
    })
    .eq('team_id', team_id)
    .eq('activity_id', activity_id);

  if (updateError) return Response.json({ error: 'Gagal mengupdate poin' }, { status: 500 });

  return Response.json({ success: true });
}
