import type { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/serverAuth';

/**
 * GET /api/lo/queue
 * Returns teams checked-in and scored at the LO's assigned activity.
 * Response: { checked_in: Team[], scored: Team[], activity: { id, name, max_points } }
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, userId } = auth;

  // Get LO profile
  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_id', userId)
    .single();

  if (!userProfile || userProfile.role !== 'lo') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get LO assignment
  const { data: assignment } = await supabase
    .from('lo_assignments')
    .select('activity_id, activities(id, name, max_points)')
    .eq('lo_id', userProfile.id)
    .single();

  if (!assignment) {
    return Response.json({ error: 'LO tidak memiliki assignment aktivitas' }, { status: 404 });
  }

  const activityId = assignment.activity_id;
  const activity = (assignment.activities as unknown) as { id: string; name: string; max_points: number } | null;

  // Get all teams checked in at this activity
  const { data: registrations } = await supabase
    .from('activity_registrations')
    .select('team_id, checked_in_at, teams(id, name, total_points)')
    .eq('activity_id', activityId)
    .order('checked_in_at', { ascending: true });

  // Get all teams that have received points at this activity
  const { data: scoreLogs } = await supabase
    .from('score_logs')
    .select('team_id, points_awarded, note, updated_at, teams(id, name, total_points)')
    .eq('activity_id', activityId)
    .order('updated_at', { ascending: false });

  const scoredTeamIds = new Set((scoreLogs ?? []).map((sl) => sl.team_id));

  const checkedIn = (registrations ?? [])
    .filter((r) => !scoredTeamIds.has(r.team_id))
    .map((r) => ({
      ...((r.teams as unknown) as { id: string; name: string; total_points: number }),
      checked_in_at: r.checked_in_at,
    }));

  const scored = (scoreLogs ?? []).map((sl) => ({
    ...((sl.teams as unknown) as { id: string; name: string; total_points: number }),
    points_awarded: sl.points_awarded,
    note: sl.note,
    scored_at: sl.updated_at,
  }));

  return Response.json({
    activity,
    checked_in: checkedIn,
    scored,
  });
}
