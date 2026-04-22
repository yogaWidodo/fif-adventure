-- Add participant tracking to score_logs
ALTER TABLE score_logs ADD COLUMN IF NOT EXISTS participant_ids UUID[] DEFAULT '{}';
