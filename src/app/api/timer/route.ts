import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const revalidate = 10;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Requirement 4.0: Get timer settings from 'settings' table
  const { data: settings, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['event_status', 'event_duration_minutes', 'event_started_at', 'event_elapsed_seconds']);

  if (error || !settings) {
    return NextResponse.json({ error: 'Failed to fetch timer settings' }, { status: 500 });
  }

  // Convert array to object for easier access
  const config = settings.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const status = config.event_status || 'idle';
  const durationMinutes = parseInt(config.event_duration_minutes || '0', 10);
  const startedAtStr = config.event_started_at;
  const elapsedSeconds = parseInt(config.event_elapsed_seconds || '0', 10);

  let totalElapsed = elapsedSeconds;
  
  if (status === 'running' && startedAtStr) {
    const startedAt = new Date(startedAtStr).getTime();
    const now = Date.now();
    totalElapsed += Math.floor((now - startedAt) / 1000);
  }

  const totalDurationSeconds = durationMinutes * 60;
  let remainingSeconds = totalDurationSeconds - totalElapsed;

  // Ensure remaining doesn't go below zero
  if (remainingSeconds < 0) {
    remainingSeconds = 0;
  }

  // Auto-finish if time is up and it's still running
  // Note: Real state change should ideally be handled by a background worker or admin-triggered,
  // but we can reflect it in the API response.
  const currentStatus = (status === 'running' && remainingSeconds <= 0) ? 'finished' : status;

  return NextResponse.json({
    status: currentStatus,
    event_duration_minutes: durationMinutes,
    event_started_at: startedAtStr,
    event_elapsed_seconds: elapsedSeconds,
    remaining_seconds: remainingSeconds,
  });
}
