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

  const updates = [
    { key: 'event_status', value: 'idle' },
    { key: 'event_started_at', value: '' },
    { key: 'event_elapsed_seconds', value: '0' }
  ];

  for (const item of updates) {
    await supabaseAdmin.from('settings').upsert(item);
  }

  return Response.json({ success: true, message: 'Event reset to idle' });
}
