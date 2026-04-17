/**
 * Server-side auth helper.
 * Reads the access token from:
 *   1. sb-access-token cookie (set by login route)
 *   2. Authorization: Bearer <token> header (fallback for clients that send it)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

/**
 * Extracts the access token from cookie or Authorization header.
 * Returns null if neither is present.
 */
export async function getAccessToken(request: NextRequest): Promise<string | null> {
  // 1. Try Authorization header first (most reliable in production)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // 2. Fallback: cookie
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('sb-access-token')?.value;
  if (cookieToken) return cookieToken;

  return null;
}

/**
 * Creates an authenticated Supabase client and validates the session.
 * Returns { supabase, userId } on success, or null if unauthorized.
 */
export async function getAuthenticatedClient(
  request: NextRequest
): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const accessToken = await getAccessToken(request);
  if (!accessToken) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) return null;

  return { supabase, userId: user.id };
}

/**
 * Checks if an event is currently paused.
 * Returns true if paused, false otherwise.
 */
export async function isEventPaused(
  supabase: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('events')
    .select('timer_state')
    .eq('id', eventId)
    .single();
  return data?.timer_state === 'paused';
}
