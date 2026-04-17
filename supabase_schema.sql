-- Event Games Management System Schema

-- 1. Events Table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  captain_id UUID, -- Reference to auth.users if needed
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Team Members Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- Reference to auth.users
  role TEXT DEFAULT 'member', -- captain, cocaptain, member
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Locations (Wahana / Challenge / Treasure)
CREATE TYPE location_type AS ENUM ('wahana', 'challenge', 'treasure');

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type location_type NOT NULL,
  points INTEGER DEFAULT 0,
  barcode_data TEXT UNIQUE,
  hint TEXT,
  coordinate_x FLOAT,
  coordinate_y FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Scans Table (Audit Log)
CREATE TABLE IF NOT EXISTS public.scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  scanned_by UUID, -- Reference to user_id
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  points_awarded INTEGER DEFAULT 0,
  UNIQUE(team_id, location_id) -- Prevent duplicate scans for same team/location
);

-- 6. Point Logs (Detailed Transactions)
CREATE TABLE IF NOT EXISTS public.point_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. System Logs
CREATE TABLE IF NOT EXISTS public.system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to update team total points automatically
CREATE OR REPLACE FUNCTION update_team_points()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.teams
  SET total_points = (
    SELECT COALESCE(SUM(points_awarded), 0)
    FROM public.scans
    WHERE team_id = NEW.team_id
  )
  WHERE id = NEW.team_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_team_points
AFTER INSERT OR UPDATE ON public.scans
FOR EACH ROW EXECUTE FUNCTION update_team_points();
