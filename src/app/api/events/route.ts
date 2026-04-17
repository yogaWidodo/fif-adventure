import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

interface EventListItem {
  id: string;
  name: string;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

export async function GET(_request: NextRequest): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .from('events')
    .select('id, name, is_active, start_time, end_time')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Events fetch error:', error);
    return Response.json({ error: 'Failed to fetch events' }, { status: 500 });
  }

  return new Response(JSON.stringify((data ?? []) as EventListItem[]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
