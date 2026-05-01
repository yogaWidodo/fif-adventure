import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import {
  buildAuthEmail,
  validateUserRow,
  buildUploadReport,
  formatDateForDB,
  type ParsedUserRow,
  type RowResult,
} from '@/lib/userManagement';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST /api/users/bulk — bulk import users from parsed CSV rows
export async function POST(request: NextRequest) {
  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.rows)) {
    return Response.json({ error: 'rows must be an array' }, { status: 400 });
  }

  const rows = body.rows as ParsedUserRow[];
  const supabaseAdmin = getAdminClient();
  // Cache team name → id to avoid redundant DB lookups
  const teamCache: Record<string, string> = {};

  const results = await Promise.all(rows.map(async (row, i) => {
    const rowIndex = i + 1;

    // Validate row
    const validationError = validateUserRow(row);
    if (validationError) {
      return { rowIndex, status: 'failed' as const, reason: validationError };
    }

    const npk = row.npk.trim();
    const name = row.name.trim();
    const role = row.role;
    const team_name = row.team_name.trim();
    const birth_date = row.birth_date.trim();

    let userId: string | null = null;
    let userCreated = false;
    let teamCreated = false;

    try {
      // Step 1: Check if user exists in public.users
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id, auth_id')
        .eq('npk', npk)
        .maybeSingle();

      if (existingUser) {
        userId = existingUser.id;
        // Update name and birth_date in case there are corrections in the CSV
        await supabaseAdmin
          .from('users')
          .update({
            name,
            birth_date: formatDateForDB(birth_date)
          })
          .eq('id', userId);
      } else {
        // Create or Link Auth account
        const email = buildAuthEmail(npk);
        let authUserId: string | null = null;

        // Try to create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: birth_date,
          email_confirm: true,
        });

        if (authError) {
          // If already exists in Auth but not in public.users (orphan auth account)
          if (authError.message.includes('already registered')) {
            // PERF FIX: Avoid listUsers() which pulls ALL users O(n).
            // Use signInWithPassword to discover the auth_id of the existing user.
            const { data: signInData } = await supabaseAdmin.auth.signInWithPassword({
              email,
              password: birth_date,
            });
            if (signInData?.user) {
              authUserId = signInData.user.id;
            } else {
              return { rowIndex, status: 'failed' as const, reason: `Auth Conflict: user exists but password mismatch` };
            }
          } else {
            return { rowIndex, status: 'failed' as const, reason: `Auth Error: ${authError.message}` };
          }
        } else {
          authUserId = authData.user.id;
        }

        // Insert user record
        const { data: newUser, error: insertError } = await supabaseAdmin
          .from('users')
          .insert({
            auth_id: authUserId,
            name,
            npk,
            role,
            birth_date: formatDateForDB(birth_date)
          })
          .select('id')
          .single();

        if (insertError || !newUser) {
          // Only delete auth user if we JUST created them in this run
          if (!authError) {
            await supabaseAdmin.auth.admin.deleteUser(authUserId!);
          }
          return {
            rowIndex,
            status: 'failed' as const,
            reason: `Insert Error: ${insertError?.message}`,
          };
        }

        userId = newUser.id;
        userCreated = true;
      }

      // Step 2: Team assignment
      if (team_name && userId) {
        // Use atomic upsert to handle parallel race conditions. 
        // If the team exists, it returns the ID. If not, it creates it.
        const { data: teamData, error: teamError } = await supabaseAdmin
          .from('teams')
          .upsert(
            { name: team_name }, 
            { onConflict: 'name', ignoreDuplicates: false }
          )
          .select('id')
          .maybeSingle();

        if (teamError || !teamData) {
          return {
            rowIndex,
            status: 'failed' as const,
            reason: `Team Sync Error: ${teamError?.message || 'Could not find/create team'}`,
          };
        }
        
        const teamId = teamData.id;
        teamCreated = false; // We can't easily know if it was just created or existing without more complex logic, but that's fine.

        // Check for existing captain if role is captain
        if (role === 'captain') {
          const { data: existingCap } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('team_id', teamId)
            .eq('role', 'captain')
            .neq('id', userId)
            .maybeSingle();

          if (existingCap) {
            return {
              rowIndex,
              status: 'failed' as const,
              reason: `Tim '${team_name}' sudah memiliki kapten.`,
            };
          }
        }

        // Update user with team and role
        const { error: assignError } = await supabaseAdmin
          .from('users')
          .update({ team_id: teamId, role })
          .eq('id', userId);

        if (assignError) {
          return {
            rowIndex,
            status: 'failed' as const,
            reason: `Assign Error: ${assignError.message}`,
          };
        }

        return {
          rowIndex,
          status: (userCreated ? 'created' : 'assigned') as any,
          teamCreated,
        };
      } else {
        return {
          rowIndex,
          status: (userCreated ? 'created' : 'skipped') as any,
          teamCreated: false,
        };
      }
    } catch (err: any) {
      return {
        rowIndex,
        status: 'failed' as const,
        reason: err.message || 'Internal logic error',
      };
    }
  }));

  const report = buildUploadReport(results, rows.length);
  return Response.json({ report });
}
