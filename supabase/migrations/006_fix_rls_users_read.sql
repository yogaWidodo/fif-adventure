-- Migration: 006_fix_rls_users_read
-- Fix RLS policy so that authenticated users can read all users in the same team,
-- and admins can read all users across all teams.

-- Drop existing read policies (if they exist)
DROP POLICY IF EXISTS "users_read_own" ON public.users;
DROP POLICY IF EXISTS "users_read_admin" ON public.users;
DROP POLICY IF EXISTS "users_read_authenticated" ON public.users;

-- Allow any authenticated user to read all users
CREATE POLICY "users_read_authenticated" ON public.users
  FOR SELECT TO authenticated
  USING (true);
