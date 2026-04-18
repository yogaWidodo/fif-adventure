import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: userProfile } = await supabaseAdmin.from('users').select('role').eq('auth_id', auth.userId).single();
  if (userProfile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Requirement 4.0: Calculate elapsed time and set to paused
  const { data: settings } = await supabaseAdmin.from('settings').select('key, value');
  const config = settings?.reduce((acc, { key, value }) => { acc[key] = value; return acc; }, {} as Record<string, string>) || {};

  if (config.event_status !== 'running') {
    return Response.json({ error: 'Only running events can be paused' }, { status: 400 });
  }

  const startedAt = new Date(config.event_started_at).getTime();
  const now = Date.now();
  const currentElapsed = parseInt(config.event_elapsed_seconds || '0', 10);
  const totalElapsed = currentElapsed + Math.floor((now - startedAt) / 1000);

  await supabaseAdmin.from('settings').upsert({ key: 'event_status', value: 'paused' });
  await supabaseAdmin.from('settings').upsert({ key: 'event_elapsed_seconds', value: totalElapsed.toString() });

  return Response.json({ success: true, message: 'Event paused' });
}
