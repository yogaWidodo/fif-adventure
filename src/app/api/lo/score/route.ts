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

  try {
    await assertEventRunning(supabase);
  } catch {
    return Response.json({ error: 'Event sedang tidak berlangsung.' }, { status: 403 });
  }

  let body: { team_id?: unknown; points?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { team_id, points, note } = body;
  const pointsAwarded = Number(points);

  if (typeof team_id !== 'string' || isNaN(pointsAwarded)) {
    return Response.json({ error: 'team_id and valid points are required' }, { status: 400 });
  }

  // Get LO Profile & Assignment
  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role, npk')
    .eq('auth_id', userId)
    .single();

  if (!userProfile || userProfile.role !== 'lo') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: assignment } = await supabase
    .from('lo_assignments')
    .select('activity_id, activities(max_points)')
    .eq('lo_id', userProfile.id)
    .single();

  const activity = assignment?.activities as any;
  if (!assignment || !activity) {
    return Response.json({ error: 'LO assignment not found' }, { status: 403 });
  }

  if (pointsAwarded < 0 || pointsAwarded > activity.max_points) {
    return Response.json({ error: `Poin maksimal: ${activity.max_points}` }, { status: 400 });
  }

  // Verify Check-in
  const { data: checkin } = await supabase
    .from('activity_registrations')
    .select('id')
    .eq('team_id', team_id)
    .eq('activity_id', assignment.activity_id)
    .single();

  if (!checkin) {
    return Response.json({ error: 'Tim belum check-in di aktivitas ini' }, { status: 422 });
  }

  // Insert Score
  const { error: insertError } = await supabase
    .from('score_logs')
    .insert({
      team_id,
      activity_id: assignment.activity_id,
      lo_id: userProfile.id,
      points_awarded: pointsAwarded,
      note: note as string
    });

  if (insertError) {
    if (insertError.code === '23505') return Response.json({ error: 'Tim sudah dinilai' }, { status: 409 });
    return Response.json({ error: 'Gagal menyimpan poin' }, { status: 500 });
  }

  // Gacha Logic (Requirement 4.5.5.c)
  const { data: gachaProb } = await supabase.from('settings').select('value').eq('key', 'gacha_probability').single();
  const prob = parseFloat(gachaProb?.value || '0');
  let won = false;

  if (Math.random() < prob) {
    const { data: hintId } = await supabase.rpc('claim_gacha_th', {
      p_team_id: team_id,
      p_activity_id: assignment.activity_id
    });
    if (hintId) won = true;
  }

  return Response.json({ success: true, gacha_result: { won } });
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, userId } = auth;

  let body: { team_id?: unknown; points?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { team_id, points, note } = body;
  const pointsAwarded = Number(points);

  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role, npk')
    .eq('auth_id', userId)
    .single();

  if (!userProfile || userProfile.role !== 'lo') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { data: assignment } = await supabase
    .from('lo_assignments')
    .select('activity_id, activities(max_points)')
    .eq('lo_id', userProfile.id)
    .single();

  const activity = assignment?.activities as any;
  if (!assignment || !activity) return Response.json({ error: 'Forbidden' }, { status: 403 });

  if (pointsAwarded < 0 || pointsAwarded > activity.max_points) {
    return Response.json({ error: `Poin maksimal: ${activity.max_points}` }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('score_logs')
    .update({
      points_awarded: pointsAwarded,
      note: note as string,
      edited_by: userProfile.id,
      updated_at: new Date().toISOString()
    })
    .eq('team_id', team_id)
    .eq('activity_id', assignment.activity_id);

  if (updateError) return Response.json({ error: 'Gagal mengupdate poin' }, { status: 500 });

  return Response.json({ success: true });
}
