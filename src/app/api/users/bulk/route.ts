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
  const results: RowResult[] = [];

  // Cache team name → id to avoid redundant DB lookups
  const teamCache: Record<string, string> = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1;

    // Validate row
    const validationError = validateUserRow(row);
    if (validationError) {
      results.push({ rowIndex, status: 'failed', reason: validationError });
      continue;
    }

    const npk = row.npk.trim();
    const name = row.name.trim();
    const role = row.role;
    const team_name = row.team_name.trim();
    const birth_date = row.birth_date.trim();

    let userId: string | null = null;
    let userCreated = false;
    let teamCreated = false;

    // Step 1: Check if user exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, auth_id')
      .eq('npk', npk)
      .maybeSingle();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create Auth account using NPK as email and Birth Date as password
      const email = buildAuthEmail(npk);
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: birth_date,
        email_confirm: true,
      });

      if (authError || !authData.user) {
        results.push({
          rowIndex,
          status: 'failed',
          reason: `Auth Error: ${authError?.message}`,
        });
        continue;
      }

      // Insert user record
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          auth_id: authData.user.id,
          name,
          npk,
          role,
          birth_date: formatDateForDB(birth_date)
        })
        .select('id')
        .single();

      if (insertError || !newUser) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        results.push({
          rowIndex,
          status: 'failed',
          reason: `Insert Error: ${insertError?.message}`,
        });
        continue;
      }

      userId = newUser.id;
      userCreated = true;
    }

    // Step 2: Team assignment
    if (team_name && userId) {
      let teamId = teamCache[team_name.toLowerCase()];

      if (!teamId) {
        const { data: existingTeam } = await supabaseAdmin
          .from('teams')
          .select('id')
          .ilike('name', team_name)
          .maybeSingle();

        if (existingTeam) {
          teamId = existingTeam.id;
        } else {
          const { data: newTeam, error: teamError } = await supabaseAdmin
            .from('teams')
            .insert({ name: team_name })
            .select('id')
            .single();

          if (teamError || !newTeam) {
            results.push({
              rowIndex,
              status: 'failed',
              reason: `Team Error: ${teamError?.message}`,
            });
            continue;
          }
          teamId = newTeam.id;
          teamCreated = true;
        }
        teamCache[team_name.toLowerCase()] = teamId;
      }

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
          results.push({
            rowIndex,
            status: 'failed',
            reason: `Tim '${team_name}' sudah memiliki kapten.`,
          });
          continue;
        }
      }

      // Update user with team and role
      const { error: assignError } = await supabaseAdmin
        .from('users')
        .update({ team_id: teamId, role })
        .eq('id', userId);

      if (assignError) {
        results.push({
          rowIndex,
          status: 'failed',
          reason: `Assign Error: ${assignError.message}`,
        });
        continue;
      }

      results.push({
        rowIndex,
        status: userCreated ? 'created' : 'assigned',
        teamCreated,
      });
    } else {
      results.push({
        rowIndex,
        status: userCreated ? 'created' : 'skipped',
        teamCreated: false,
      });
    }
  }

  const report = buildUploadReport(results, rows.length);
  return Response.json({ report });
}
