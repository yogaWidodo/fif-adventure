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

  // 2. Parse request body
  let body: { team_id?: unknown; activity_id?: unknown; participant_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { team_id, activity_id, participant_id } = body;
  if (typeof team_id !== 'string' || !team_id.trim()) {
    return Response.json({ error: 'team_id is required' }, { status: 400 });
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

  // 4. Get LO profile and verify assignment for this SPECIFIC activity
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

  // 5. Check-in logic: Cumulative for individual scans
  // Check if team already in queue
  const { data: existingReg } = await supabase
    .from('activity_registrations')
    .select('id, participant_ids')
    .eq('team_id', team_id)
    .eq('activity_id', activity_id)
    .maybeSingle();

  const newParticipantId = typeof participant_id === 'string' ? participant_id : null;

  if (existingReg) {
    const pIds = Array.isArray(existingReg.participant_ids) ? existingReg.participant_ids : [];
    
    // If we have a specific participant, add them if not already there
    if (newParticipantId && !pIds.includes(newParticipantId)) {
      const updatedPIds = [...pIds, newParticipantId];
      const { error: updateError } = await supabase
        .from('activity_registrations')
        .update({ participant_ids: updatedPIds })
        .eq('id', existingReg.id);
      
      if (updateError) return Response.json({ error: 'Gagal update partisipan antrean' }, { status: 500 });
    } else if (newParticipantId) {
      return Response.json({ error: 'Member sudah masuk antrean' }, { status: 409 });
    }
  } else {
    // New registration
    const { error: insertError } = await supabase
      .from('activity_registrations')
      .insert({
        team_id,
        activity_id,
        checked_in_by: userProfile.id,
        participant_ids: newParticipantId ? [newParticipantId] : []
      });

    if (insertError) {
      return Response.json({ error: 'Gagal melakukan check-in' }, { status: 500 });
    }
  }

  // 6. AUTOMATED TREASURE HINT (New Requirement)
  // Check if this activity has a linked private treasure hunt
  const { data: activityData } = await supabase
    .from('activities')
    .select('treasure_hunt_id, type')
    .eq('id', activity_id)
    .single();

  let hint_granted = false;
  if (activityData?.treasure_hunt_id && !activityData.type.startsWith('challenge')) {
    // Grant the hint to the team automatically
    const { error: upsertError } = await supabase
      .from('treasure_hunt_hints')
      .upsert({
        team_id,
        treasure_hunt_id: activityData.treasure_hunt_id,
        triggered_by_activity_id: activity_id
      }, { onConflict: 'team_id, treasure_hunt_id' });
    
    if (!upsertError) {
      hint_granted = true;
    }
  }

  return Response.json({ success: true, hint_granted });
}
