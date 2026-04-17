-- Migration 005: Fix claim_treasure to handle NULL quota
-- If quota is NULL, treat as unlimited (no quota check)

CREATE OR REPLACE FUNCTION claim_treasure(
  p_team_id UUID,
  p_location_id UUID,
  p_scanned_by UUID
) RETURNS JSONB AS $
DECLARE
  v_location RECORD;
  v_existing_scan UUID;
  v_claim_count INTEGER;
  v_quota_remaining INTEGER;
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

  -- Check if event is active (only if event_id is set)
  IF v_location.event_id IS NOT NULL THEN
    DECLARE
      v_event_active BOOLEAN;
      v_event_ended BOOLEAN;
    BEGIN
      SELECT is_active, (end_time IS NOT NULL AND end_time < NOW())
      INTO v_event_active, v_event_ended
      FROM public.events
      WHERE id = v_location.event_id;

      IF NOT FOUND OR NOT v_event_active OR v_event_ended THEN
        RETURN jsonb_build_object('success', false, 'message', 'Event is not active');
      END IF;
    END;
  END IF;

  -- Check if team already claimed this treasure
  SELECT id INTO v_existing_scan
  FROM public.scans
  WHERE team_id = p_team_id AND location_id = p_location_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already claimed by your team');
  END IF;

  -- Count existing claims for this treasure
  SELECT COUNT(*) INTO v_claim_count
  FROM public.scans
  WHERE location_id = p_location_id;

  -- Check quota — if quota IS NULL, treat as unlimited
  IF v_location.quota IS NOT NULL THEN
    v_quota_remaining := v_location.quota - v_claim_count;
    IF v_quota_remaining <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Quota exhausted');
    END IF;
  ELSE
    -- Unlimited quota — set remaining to a large number for response
    v_quota_remaining := 999999;
  END IF;

  -- Insert scan record
  INSERT INTO public.scans (team_id, location_id, scanned_by, points_awarded)
  VALUES (p_team_id, p_location_id, p_scanned_by, v_location.points);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Treasure claimed!',
    'points_awarded', v_location.points,
    'quota_remaining', CASE WHEN v_location.quota IS NULL THEN NULL ELSE v_quota_remaining - 1 END
  );
END;
$ LANGUAGE plpgsql;
