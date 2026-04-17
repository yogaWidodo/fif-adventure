import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import {
  buildAuthEmail,
  validateUserRow,
  buildUploadReport,
  type ParsedUserRow,
  type RowResult,
} from '@/lib/userManagement';

// Requirements: 4.5, 4.6, 4.7, 4.9, 4.10, 4.11, 4.12, 4.13

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  '';

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST /api/users/bulk — bulk import users from parsed CSV rows
export async function POST(request: NextRequest) {
  let body: { rows?: unknown; event_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.rows)) {
    return Response.json({ error: 'rows must be an array' }, { status: 400 });
  }

  const rows = body.rows as ParsedUserRow[];
  const event_id = typeof body.event_id === 'string' && body.event_id ? body.event_id : null;
  const supabaseAdmin = getAdminClient();
  const results: RowResult[] = [];

  // Cache team name → id to avoid redundant DB lookups within the same import
  const teamCache: Record<string, string> = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1; // 1-based

    // Validate row
    const validationError = validateUserRow(row);
    if (validationError) {
      results.push({ rowIndex, status: 'failed', reason: validationError });
      continue;
    }

    const npk = row.npk.trim();
    const nama = row.nama.trim();
    const role = row.role;
    const team_name = row.team_name.trim();
    const no_unik = row.no_unik.trim();

    let userId: string | null = null;
    let userCreated = false;
    let teamCreated = false;

    // Step 1: Check if user with this npk already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, auth_id')
      .eq('npk', npk)
      .maybeSingle();

    if (existingUser) {
      // User already exists — skip creation
      userId = existingUser.id;
    } else {
      // Create Supabase Auth account — password = npk
      const email = buildAuthEmail(npk);
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: npk,
        email_confirm: true,
      });

      if (authError || !authData.user) {
        results.push({
          rowIndex,
          status: 'failed',
          reason: `Gagal membuat auth account: ${authError?.message ?? 'unknown error'}`,
        });
        continue;
      }

      // Insert user record
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          auth_id: authData.user.id,
          nama,
          npk,
          role,
          no_unik: null,
          team_id: null,
          event_id,
        })
        .select('id')
        .single();

      if (insertError || !newUser) {
        // Rollback auth account
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        results.push({
          rowIndex,
          status: 'failed',
          reason: `Gagal menyimpan user: ${insertError?.message ?? 'unknown error'}`,
        });
        continue;
      }

      userId = newUser.id;
      userCreated = true;
    }

    // Step 2: Team assignment (if team_name is provided)
    if (team_name && userId) {
      // Resolve team id (check cache first)
      let teamId = teamCache[team_name.toLowerCase()];

      if (!teamId) {
        // Check if team exists
        const { data: existingTeam } = await supabaseAdmin
          .from('teams')
          .select('id')
          .ilike('name', team_name)
          .maybeSingle();

        if (existingTeam) {
          teamId = existingTeam.id;
        } else {
          // Create new team
          const { data: newTeam, error: teamError } = await supabaseAdmin
            .from('teams')
            .insert({ name: team_name })
            .select('id')
            .single();

          if (teamError || !newTeam) {
            results.push({
              rowIndex,
              status: 'failed',
              reason: `Gagal membuat tim '${team_name}': ${teamError?.message ?? 'unknown error'}`,
              teamCreated: false,
            });
            continue;
          }

          teamId = newTeam.id;
          teamCreated = true;
        }

        teamCache[team_name.toLowerCase()] = teamId;
      }

      // Check no_unik uniqueness in this team
      const { data: conflictUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('team_id', teamId)
        .eq('no_unik', no_unik)
        .neq('id', userId)
        .maybeSingle();

      if (conflictUser) {
        results.push({
          rowIndex,
          status: 'failed',
          reason: `no_unik '${no_unik}' sudah digunakan di tim '${team_name}'`,
          teamCreated,
        });
        continue;
      }

      // Assign user to team
      const { error: assignError } = await supabaseAdmin
        .from('users')
        .update({ team_id: teamId, no_unik, role })
        .eq('id', userId);

      if (assignError) {
        if (assignError.code === '23505') {
          results.push({
            rowIndex,
            status: 'failed',
            reason: `no_unik '${no_unik}' sudah digunakan di tim '${team_name}'`,
            teamCreated,
          });
        } else {
          results.push({
            rowIndex,
            status: 'failed',
            reason: `Gagal assign ke tim: ${assignError.message}`,
            teamCreated,
          });
        }
        continue;
      }

      results.push({
        rowIndex,
        status: userCreated ? 'created' : 'assigned',
        teamCreated,
      });
    } else {
      // No team assignment
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
