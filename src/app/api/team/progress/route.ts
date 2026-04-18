import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, userId } = auth;

  // Get User Profile to find team_id
  const { data: userProfile } = await supabase
    .from('users')
    .select('team_id, npk')
    .eq('auth_id', userId)
    .single();

  if (!userProfile?.team_id) {
    return Response.json({ error: 'Team not found' }, { status: 404 });
  }

  const teamId = userProfile.team_id;

  // 1. Fetch Activity Progress (Check-ins & Scores)
  const { data: registrations } = await supabase
    .from('activity_registrations')
    .select('activity_id, created_at, activities(id, name, type, max_points)')
    .eq('team_id', teamId);

  const { data: scores } = await supabase
    .from('score_logs')
    .select('activity_id, points_awarded, created_at')
    .eq('team_id', teamId);

  // 2. Fetch Treasure Hunt Hints
  const { data: hints } = await supabase
    .from('treasure_hunt_hints')
    .select('created_at, treasure_hunts(id, title, hint_text, clue_image_url)')
    .eq('team_id', teamId);

  // 3. Fetch Claims
  const { data: claims } = await supabase
    .from('treasure_hunt_claims')
    .select('treasure_hunt_id, created_at')
    .eq('team_id', teamId);

  return Response.json({
    activities: {
      registrations: registrations || [],
      scores: scores || []
    },
    treasure_hunt: {
      hints: hints || [],
      claims: claims || []
    }
  });
}
