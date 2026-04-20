-- Migration: Add gacha_rolled to score_logs
-- This allows Captains to pull gacha manually based on their score logs.
ALTER TABLE public.score_logs ADD COLUMN IF NOT EXISTS gacha_rolled BOOLEAN NOT NULL DEFAULT FALSE;

-- RLS Policy allowing Captains to read their team's score_logs
CREATE POLICY "Captain can read their team score logs" ON public.score_logs
FOR SELECT USING (
  team_id IN (
    SELECT team_id FROM public.users WHERE auth_id = auth.uid()
  )
);
