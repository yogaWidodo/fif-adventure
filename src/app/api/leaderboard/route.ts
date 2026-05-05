import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const revalidate = 15; // Cache ini akan sangat membantu menahan beban 1500 user

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Requirement 4.7: Leaderboard displays teams sorted by total_points
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, name, total_points')
    .order('total_points', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }

  return NextResponse.json({ leaderboard: teams });
}
