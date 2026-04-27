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
  let body: { team_id?: unknown; points?: unknown; activity_id?: unknown; note?: unknown; participant_ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { team_id, points, activity_id, note, participant_ids } = body;
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
    .select('id, participant_ids')
    .eq('team_id', team_id)
    .eq('activity_id', activity_id)
    .maybeSingle();

  if (!checkin) {
    return Response.json({ error: 'Tim belum check-in di aktivitas ini.' }, { status: 422 });
  }

  // Ensure participants being scored are actually checked in
  const currentQueueIds = (checkin.participant_ids as string[]) || [];
  const incomingIds = (participant_ids as string[]) || [];
  const validScoringIds = incomingIds.filter((id: string) => currentQueueIds.includes(id));
  
  if (validScoringIds.length === 0) {
    return Response.json({ error: 'Peserta yang di-scan tidak ditemukan dalam antrean tim.' }, { status: 400 });
  }

  // 6. Insert Score Log
  const { error: insertError } = await supabase
    .from('score_logs')
    .insert({
      team_id,
      activity_id,
      lo_id: userProfile.id,
      points_awarded: points,
      note: note as string,
      participant_ids: validScoringIds
    });

  if (insertError) {
    // Since we now allow multiple split-team scores, we don't strictly block by unique team_id/activity_id
    // but the DB might still have a constraint. Let's handle generic errors.
    return Response.json({ error: 'Gagal menyimpan poin. ' + insertError.message }, { status: 500 });
  }

  // 7. Cleanup: Remove ONLY the participants who received points from the queue
  const remainingIds = currentQueueIds.filter((id: string) => !validScoringIds.includes(id));
  
  if (remainingIds.length > 0) {
    // Some members are still in queue
    await supabase
      .from('activity_registrations')
      .update({ participant_ids: remainingIds })
      .eq('id', checkin.id);
  } else {
    // Everyone in this registration has been scored
    await supabase
      .from('activity_registrations')
      .delete()
      .eq('id', checkin.id);
  }

  return Response.json({ success: true, message: 'Poin berhasil dicatat untuk tim.' });
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
