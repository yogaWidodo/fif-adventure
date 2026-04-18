import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Admin operations need service role
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export async function POST(request: NextRequest) {
  // 1. Authenticate and check Admin role
  const auth = await getAuthenticatedClient(request);
  if (!auth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('auth_id', auth.userId)
    .single();

  if (userProfile?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Logic to start timer
  // Requirement 4.0: Only start if status is 'idle'
  const { data: statusData } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'event_status')
    .single();

  if (statusData?.value !== 'idle') {
    return Response.json({ error: 'Timer already started or finished. Reset first.' }, { status: 400 });
  }

  // Update settings in database
  const updates = [
    { key: 'event_status', value: 'running' },
    { key: 'event_started_at', value: new Date().toISOString() },
    { key: 'event_elapsed_seconds', value: '0' }
  ];

  for (const item of updates) {
    await supabaseAdmin
      .from('settings')
      .upsert(item);
  }

  return Response.json({ success: true, message: 'Event started' });
}
