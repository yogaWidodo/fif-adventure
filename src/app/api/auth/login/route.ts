import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

// V2 Login flow:
//   1. Validate npk + birth_date are present
//   2. Parse birth_date (ddmmyyyy) to YYYY-MM-DD
//   3. Lookup user by npk + birth_date in public.users
//   4. If match, ensure user exists in auth.users and create session

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[login] Warning: Supabase URL or Service Role Key is missing in environment variables.');
}

export async function POST(request: NextRequest) {
  // Parse and validate request body
  let body: { npk?: unknown; birth_date?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { npk, birth_date } = body;

  if (
    typeof npk !== 'string' || !npk.trim() ||
    typeof birth_date !== 'string' || !birth_date.trim()
  ) {
    return Response.json(
      { error: 'npk and birth_date are required' },
      { status: 400 }
    );
  }

  const cleanNpk = npk.trim();
  const cleanBirthDate = birth_date.trim();

  // Validate birth_date format (ddmmyyyy)
  if (!/^\d{8}$/.test(cleanBirthDate)) {
    return Response.json(
      { error: 'birth_date must be in ddmmyyyy format' },
      { status: 400 }
    );
  }

  // Parse ddmmyyyy to YYYY-MM-DD
  const day = cleanBirthDate.slice(0, 2);
  const month = cleanBirthDate.slice(2, 4);
  const year = cleanBirthDate.slice(4, 8);
  const isoBirthDate = `${year}-${month}-${day}`;

  // Use service role client
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Runtime check for placeholders
  if (supabaseUrl.includes('placeholder') || supabaseServiceKey.includes('placeholder')) {
    return Response.json(
      { error: 'Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.' },
      { status: 500 }
    );
  }

  // Step 1: Look up user in public.users
  const { data: userRecord, error: lookupError } = await supabaseAdmin
    .from('users')
    .select('id, name, npk, role, team_id, auth_id')
    .eq('npk', cleanNpk)
    .eq('birth_date', isoBirthDate)
    .single();

  if (lookupError || !userRecord) {
    console.error('[login] users table lookup failed:', lookupError?.message);
    return Response.json({ error: 'Kredensial tidak ditemukan' }, { status: 401 });
  }

  const email = `${cleanNpk.toLowerCase()}@fif.internal`;
  
  // Step 2: Ensure user exists in auth.users
  // The "real" credential check was already done against the birth_date in public.users.
  let targetAuthId = userRecord.auth_id;

  if (!targetAuthId) {
    // PERF FIX: Avoid listUsers() which pulls ALL auth users (O(n)).
    // Strategy: Try to create the auth user. If it already exists (409),
    // signInWithPassword below will still work and we get the ID from the session.
    const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: cleanBirthDate, // Password is ddmmyyyy
      email_confirm: true,
      user_metadata: { name: userRecord.name }
    });

    if (newAuthUser?.user) {
      // New auth user created successfully
      targetAuthId = newAuthUser.user.id;
      await supabaseAdmin.from('users').update({ auth_id: targetAuthId }).eq('id', userRecord.id);
    } else if (createError?.message?.includes('already been registered') || createError?.status === 422) {
      // Auth user already exists — proceed to signIn below, which will yield the auth_id
      // We'll extract auth_id from the session after sign-in
    } else if (createError) {
      console.error('[login] failed to create auth user:', createError.message);
      return Response.json({ error: 'Gagal menginisialisasi sesi' }, { status: 500 });
    }
  }

  // Step 3: Sign in to get session
  // Note: We use the birth_date (ddmmyyyy) as the stable password.
  const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password: cleanBirthDate,
  });

  if (authError || !authData.session) {
    console.error('[login] Supabase Auth sign-in failed:', authError?.message);

    // Forward rate-limit errors to client for retry logic
    if (authError?.status === 429 || authError?.message?.toLowerCase().includes('rate limit')) {
      return Response.json(
        { error: 'Terlalu banyak permintaan login. Silakan tunggu beberapa detik.' },
        { status: 429, headers: { 'Retry-After': '3' } }
      );
    }

    return Response.json({ error: 'Gagal masuk ke sistem' }, { status: 401 });
  }

  // PERF FIX: If auth_id wasn't in our record, save it now for future O(1) lookups
  if (!userRecord.auth_id && authData.session.user?.id) {
    await supabaseAdmin.from('users')
      .update({ auth_id: authData.session.user.id })
      .eq('id', userRecord.id);
  }

  // Final Response
  const response = Response.json({
    user: {
      id: userRecord.id,
      name: userRecord.name,
      npk: userRecord.npk,
      role: userRecord.role,
      team_id: userRecord.team_id ?? null,
    },
    session: {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
    }
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = authData.session.expires_in ?? 3600;

  response.headers.append(
    'Set-Cookie',
    `sb-access-token=${authData.session.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${isProduction ? '; Secure' : ''}; HttpOnly`
  );
  response.headers.append(
    'Set-Cookie',
    `sb-refresh-token=${authData.session.refresh_token}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${isProduction ? '; Secure' : ''}; HttpOnly`
  );

  return response;
}
