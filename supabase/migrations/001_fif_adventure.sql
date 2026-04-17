-- FIF Adventure Schema Migration
-- This migration adds all required schema changes for the FIF Adventure system

-- ============================================================================
-- 1. Create users table (replaces localStorage auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  npk TEXT NOT NULL UNIQUE,
  no_unik TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'kaptain', 'cocaptain', 'member', 'lo')),
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create index for faster login queries
CREATE INDEX IF NOT EXISTS idx_users_npk ON public.users(npk);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
-- ============================================================================
-- 2. Add slogan column to teams table
-- ============================================================================
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS slogan TEXT;
-- ============================================================================
-- 3. Add columns to locations table
-- ============================================================================
ALTER TABLE public.locations 
  ADD COLUMN IF NOT EXISTS challenge_type TEXT CHECK (challenge_type IN ('regular', 'popup', 'additional')),
  ADD COLUMN IF NOT EXISTS quota INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
-- Create index for active locations
CREATE INDEX IF NOT EXISTS idx_locations_is_active ON public.locations(is_active);
-- ============================================================================
-- 4. Create score_logs table (immutable audit log for LO score input)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.score_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  lo_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_score_logs_team_id ON public.score_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_score_logs_location_id ON public.score_logs(location_id);
CREATE INDEX IF NOT EXISTS idx_score_logs_created_at ON public.score_logs(created_at);
-- ============================================================================
-- 5. Update update_team_points trigger function
-- ============================================================================
-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_update_team_points ON public.scans;
DROP TRIGGER IF EXISTS trigger_update_team_points_from_score ON public.score_logs;
DROP FUNCTION IF EXISTS update_team_points();
-- Create updated function that sums both scans and score_logs
CREATE OR REPLACE FUNCTION update_team_points()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.teams
  SET total_points = (
    SELECT COALESCE(SUM(points_awarded), 0) 
    FROM public.scans 
    WHERE team_id = NEW.team_id
  ) + (
    SELECT COALESCE(SUM(score), 0) 
    FROM public.score_logs 
    WHERE team_id = NEW.team_id
  )
  WHERE id = NEW.team_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- ============================================================================
-- 6. Create triggers for both scans and score_logs
-- ============================================================================
CREATE TRIGGER trigger_update_team_points
AFTER INSERT ON public.scans
FOR EACH ROW EXECUTE FUNCTION update_team_points();
CREATE TRIGGER trigger_update_team_points_from_score
AFTER INSERT ON public.score_logs
FOR EACH ROW EXECUTE FUNCTION update_team_points();
-- ============================================================================
-- 7. Create atomic treasure claim function
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_treasure(
  p_team_id UUID,
  p_location_id UUID,
  p_scanned_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_location RECORD;
  v_existing_scan UUID;
  v_quota_remaining INTEGER;
  v_event_active BOOLEAN;
  v_event_ended BOOLEAN;
BEGIN
  -- Lock the location row to prevent concurrent claims
  SELECT * INTO v_location
  FROM public.locations
  WHERE id = p_location_id AND type = 'treasure'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Treasure not found');
  END IF;

  -- Check if location is active
  IF NOT v_location.is_active THEN
    RETURN jsonb_build_object('success', false, 'message', 'Treasure is not active');
  END IF;

  -- Check if event is active
  SELECT is_active, (end_time < NOW()) INTO v_event_active, v_event_ended
  FROM public.events
  WHERE id = v_location.event_id;

  IF NOT v_event_active OR v_event_ended THEN
    RETURN jsonb_build_object('success', false, 'message', 'Event is not active');
  END IF;

  -- Check if team already claimed
  SELECT id INTO v_existing_scan
  FROM public.scans
  WHERE team_id = p_team_id AND location_id = p_location_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already claimed by your team');
  END IF;

  -- Check quota
  v_quota_remaining := v_location.quota - (
    SELECT COUNT(*) FROM public.scans WHERE location_id = p_location_id
  );

  IF v_quota_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quota exhausted');
  END IF;

  -- Insert scan
  INSERT INTO public.scans (team_id, location_id, scanned_by, points_awarded)
  VALUES (p_team_id, p_location_id, p_scanned_by, v_location.points);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Treasure claimed!',
    'points_awarded', v_location.points,
    'quota_remaining', v_quota_remaining - 1
  );
END;
$$ LANGUAGE plpgsql;
-- ============================================================================
-- 8. Row Level Security Policies
-- ============================================================================

-- Enable RLS on score_logs (insert-only, immutable)
ALTER TABLE public.score_logs ENABLE ROW LEVEL SECURITY;
-- LO can insert score logs
CREATE POLICY "score_logs_insert_lo" ON public.score_logs
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'lo'
    )
  );
-- Anyone can read score logs (for audit purposes)
CREATE POLICY "score_logs_select_all" ON public.score_logs
  FOR SELECT TO authenticated
  USING (true);
-- No UPDATE or DELETE policies = immutable

-- Enable RLS on scans (insert-only for captains)
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
-- Kaptain and cocaptain can insert scans
CREATE POLICY "scans_insert_captain" ON public.scans
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role IN ('kaptain', 'cocaptain')
    )
  );
-- Anyone can read scans (for leaderboard and audit)
CREATE POLICY "scans_select_all" ON public.scans
  FOR SELECT TO authenticated
  USING (true);
-- No UPDATE or DELETE policies = immutable

-- Enable RLS on teams (public read access)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
-- Public read access for leaderboard
CREATE POLICY "teams_read_public" ON public.teams
  FOR SELECT 
  USING (true);
-- Admin can insert/update teams
CREATE POLICY "teams_write_admin" ON public.teams
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );
-- Enable RLS on users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- Users can read their own profile
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid());
-- Admin can read all users
CREATE POLICY "users_read_admin" ON public.users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );
-- Admin can insert/update users
CREATE POLICY "users_write_admin" ON public.users
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );
-- Enable RLS on locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
-- Public read access for active locations
CREATE POLICY "locations_read_public" ON public.locations
  FOR SELECT 
  USING (is_active = true);
-- Admin can read all locations (including inactive)
CREATE POLICY "locations_read_admin" ON public.locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );
-- Admin can insert/update locations
CREATE POLICY "locations_write_admin" ON public.locations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );
-- Enable RLS on events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
-- Public read access for active events
CREATE POLICY "events_read_public" ON public.events
  FOR SELECT 
  USING (is_active = true);
-- Admin can read all events
CREATE POLICY "events_read_admin" ON public.events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );
-- Admin can insert/update events
CREATE POLICY "events_write_admin" ON public.events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );
-- ============================================================================
-- Migration Complete
-- ============================================================================;
