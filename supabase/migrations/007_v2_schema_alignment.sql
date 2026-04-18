-- FIF Adventure V2 Schema Alignment
-- Clean slate migration: Drops existing V1 tables and creates V2 schema

-- 1. Cleanup old schema
DROP TABLE IF EXISTS public.treasure_hunt_claims CASCADE;
DROP TABLE IF EXISTS public.treasure_hunt_hints CASCADE;
DROP TABLE IF EXISTS public.treasure_hunts CASCADE;
DROP TABLE IF EXISTS public.score_logs CASCADE;
DROP TABLE IF EXISTS public.activity_registrations CASCADE;
DROP TABLE IF EXISTS public.lo_assignments CASCADE;
DROP TABLE IF EXISTS public.activities CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.scans CASCADE;
DROP TABLE IF EXISTS public.point_logs CASCADE;
DROP TABLE IF EXISTS public.system_logs CASCADE;
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.activity_type;
DROP TYPE IF EXISTS public.location_type;

-- 2. Create Types
CREATE TYPE public.user_role AS ENUM ('admin', 'lo', 'captain', 'vice_captain', 'member');
CREATE TYPE public.activity_type AS ENUM ('wahana', 'challenge_regular', 'challenge_popup', 'challenge_additional');

-- 3. Settings Table
CREATE TABLE public.settings (
    key VARCHAR PRIMARY KEY,
    value VARCHAR NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial settings
INSERT INTO public.settings (key, value) VALUES
('gacha_probability', '0.3'),
('map_image_url', ''),
('event_duration_minutes', '480'),
('event_status', 'idle'),
('event_started_at', ''),
('event_elapsed_seconds', '0');

-- 4. Teams Table
CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    slogan VARCHAR,
    total_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Users Table
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE, -- Supabase Auth ID
    name VARCHAR NOT NULL,
    npk VARCHAR UNIQUE NOT NULL,
    birth_date DATE NOT NULL,
    role public.user_role NOT NULL,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Activities Table
CREATE TABLE public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    description TEXT,
    how_to_play TEXT,
    type public.activity_type NOT NULL,
    max_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. LO Assignments
CREATE TABLE public.lo_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lo_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(lo_id) -- One LO can only have one assignment
);

-- 8. Activity Registrations (Check-ins)
CREATE TABLE public.activity_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    checked_in_by UUID NOT NULL REFERENCES public.users(id),
    checked_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, activity_id) -- One team per activity
);

-- 9. Score Logs
CREATE TABLE public.score_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    lo_id UUID NOT NULL REFERENCES public.users(id),
    points_awarded INTEGER NOT NULL,
    edited_by UUID REFERENCES public.users(id),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, activity_id) -- One score per activity
);

-- 10. Treasure Hunts
CREATE TABLE public.treasure_hunts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    hint_text TEXT NOT NULL,
    points INTEGER NOT NULL,
    quota INTEGER NOT NULL,
    remaining_quota INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Treasure Hunt Hints
CREATE TABLE public.treasure_hunt_hints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    treasure_hunt_id UUID NOT NULL REFERENCES public.treasure_hunts(id) ON DELETE CASCADE,
    triggered_by_activity_id UUID REFERENCES public.activities(id),
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Treasure Hunt Claims
CREATE TABLE public.treasure_hunt_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    treasure_hunt_id UUID NOT NULL REFERENCES public.treasure_hunts(id) ON DELETE CASCADE,
    claimed_by UUID NOT NULL REFERENCES public.users(id),
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, treasure_hunt_id)
);

-- 13. Points Calculation Trigger
CREATE OR REPLACE FUNCTION public.recalculate_team_points()
RETURNS TRIGGER AS $$
DECLARE
    v_team_id UUID;
    v_total INTEGER;
BEGIN
    v_team_id := COALESCE(NEW.team_id, OLD.team_id);

    SELECT 
        COALESCE(SUM(sl.points_awarded), 0) + 
        COALESCE(SUM(thc.points), 0)
    INTO v_total
    FROM public.teams t
    LEFT JOIN public.score_logs sl ON sl.team_id = t.id
    LEFT JOIN public.treasure_hunt_claims th_log ON th_log.team_id = t.id
    LEFT JOIN public.treasure_hunts thc ON th_log.treasure_hunt_id = thc.id
    WHERE t.id = v_team_id;

    UPDATE public.teams SET 
        total_points = v_total, 
        updated_at = NOW()
    WHERE id = v_team_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_on_score
AFTER INSERT OR UPDATE ON public.score_logs
FOR EACH ROW EXECUTE FUNCTION public.recalculate_team_points();

CREATE TRIGGER trg_recalc_on_claim
AFTER INSERT ON public.treasure_hunt_claims
FOR EACH ROW EXECUTE FUNCTION public.recalculate_team_points();

-- 14. Atomic Gacha Hint Function
CREATE OR REPLACE FUNCTION public.claim_gacha_th(p_team_id UUID, p_activity_id UUID)
RETURNS UUID AS $$
DECLARE
    v_th_id UUID;
BEGIN
    -- Select random hint that team hasn't received and has quota
    SELECT id INTO v_th_id
    FROM public.treasure_hunts
    WHERE remaining_quota > 0
      AND id NOT IN (
          SELECT treasure_hunt_id FROM public.treasure_hunt_hints
          WHERE team_id = p_team_id
      )
    ORDER BY RANDOM()
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_th_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Update quota
    UPDATE public.treasure_hunts SET remaining_quota = remaining_quota - 1
    WHERE id = v_th_id;

    -- Insert hint
    INSERT INTO public.treasure_hunt_hints (team_id, treasure_hunt_id, triggered_by_activity_id, received_at)
    VALUES (p_team_id, v_th_id, p_activity_id, NOW());

    RETURN v_th_id;
END;
$$ LANGUAGE plpgsql;

-- 15. Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lo_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasure_hunts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasure_hunt_hints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasure_hunt_claims ENABLE ROW LEVEL SECURITY;

-- Simple public read policies (to be refined later)
CREATE POLICY "Public read for all" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Public read for all" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Public read for all" ON public.activities FOR SELECT USING (true);
CREATE POLICY "Public read for all" ON public.treasure_hunts FOR SELECT USING (true);

-- Admin full access
CREATE POLICY "Admin full access" ON public.settings FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.users FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.teams FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.activities FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.lo_assignments FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.activity_registrations FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.score_logs FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.treasure_hunts FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.treasure_hunt_hints FOR ALL USING (true);
CREATE POLICY "Admin full access" ON public.treasure_hunt_claims FOR ALL USING (true);
