import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Gunakan Service Role Key untuk update status gacha_rolled tanpa khawatir RLS yang ketat di tabel score_logs untuk non-admin
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await getAuthenticatedClient(request);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, userId } = auth;

  // 1. Dapatkan Profil Kapten
  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role, team_id')
    .eq('auth_id', userId)
    .single();

  if (!userProfile || !userProfile.team_id || !['captain', 'vice_captain'].includes(userProfile.role)) {
    return Response.json({ error: 'Akses ditolak. Hanya kapten yang bisa memutar Gacha.' }, { status: 403 });
  }

  const teamId = userProfile.team_id;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // 2. Cek apakah ada score_log yang gacha_rolled = false
  const { data: scoreLog } = await supabaseAdmin
    .from('score_logs')
    .select('id, activity_id')
    .eq('team_id', teamId)
    .eq('gacha_rolled', false)
    .limit(1)
    .maybeSingle();

  if (!scoreLog) {
    return Response.json({ error: 'Tidak ada sisa kesempatan Gacha saat ini.' }, { status: 400 });
  }

  // 3. Mark gacha_rolled = true atomically (prevent double spend)
  // Walaupun di Supabase JS standard, ini berpotensi race condition. 
  // Opsi paling aman adalah UPDATE WHERE gacha_rolled = false RETURNING id
  const { data: updatedLog, error: updateError } = await supabaseAdmin
    .from('score_logs')
    .update({ gacha_rolled: true })
    .eq('id', scoreLog.id)
    .eq('gacha_rolled', false)
    .select('id')
    .single();

  if (updateError || !updatedLog) {
    return Response.json({ error: 'Gagal memproses Gacha. Coba lagi.' }, { status: 500 });
  }

  // 4. Hitung gacha probability
  const { data: gachaProb } = await supabaseAdmin.from('settings').select('value').eq('key', 'gacha_probability').single();
  const prob = parseFloat(gachaProb?.value || '0.3');
  
  let won = false;
  let thResult = null;

  if (Math.random() < prob) {
    // 5. Jalankan RPC untuk mendapatkan Hint secara acak
    const { data: hintId } = await supabaseAdmin.rpc('claim_gacha_th', {
      p_team_id: teamId,
      p_activity_id: scoreLog.activity_id
    });

    if (hintId) {
      won = true;
      // Ambil detail hint untuk ditampilkan di layar kapten
      const { data: thData } = await supabaseAdmin
        .from('treasure_hunts')
        .select('name, hint_text, points')
        .eq('id', hintId)
        .single();
        
      if (thData) {
        thResult = thData;
      }
    }
  }

  return Response.json({ 
    success: true, 
    gacha_result: { 
      won, 
      treasure: thResult 
    } 
  });
}
