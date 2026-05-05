import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 10; // Cache this route globally per 10 seconds

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');

  if (!teamId) {
    return NextResponse.json({ error: 'Missing teamId' }, { status: 400 });
  }

  try {
    const [teamRes, membersRes, actRes, regRes, hintsRes, claimRes, logsRes, publicThRes] = await Promise.all([
      supabase.from('teams').select('id, name, slogan, total_points').eq('id', teamId).maybeSingle(),
      supabase.from('users').select('id, name, role').eq('team_id', teamId).order('role'),
      supabase.from('activities').select('id, name, type, max_points, description, how_to_play, difficulty_level').eq('is_visible', true).order('name'),
      supabase.from('activity_registrations').select('activity_id, checked_in_at, participant_ids').eq('team_id', teamId),
      supabase.from('treasure_hunt_hints').select('id, treasure_hunt_id, received_at, treasure_hunts(id, name, hint_text, points)').eq('team_id', teamId).order('received_at', { ascending: false }),
      supabase.from('treasure_hunt_claims').select('treasure_hunt_id, claimed_by, claimed_at, treasure_hunts(name, points)').eq('team_id', teamId),
      supabase.from('score_logs').select('*, activities(name)').eq('team_id', teamId).order('created_at', { ascending: false }),
      supabase.from('treasure_hunts').select('*').eq('is_public', true)
    ]);

    return NextResponse.json({
      team: teamRes.data,
      members: membersRes.data,
      activities: actRes.data,
      registrations: regRes.data,
      hints: hintsRes.data,
      claims: claimRes.data,
      scoreLogs: logsRes.data,
      publicTreasures: publicThRes.data
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
