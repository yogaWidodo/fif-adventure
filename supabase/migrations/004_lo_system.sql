-- LO System Migration
-- Adds barcode_data to teams and assigned_location_id to users

-- 1. Tambah kolom barcode_data ke tabel teams
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS barcode_data TEXT UNIQUE;

-- 2. Backfill barcode_data untuk tim yang sudah ada
UPDATE public.teams
  SET barcode_data = 'fif-team-' || id
  WHERE barcode_data IS NULL;

-- 3. Tambah kolom assigned_location_id ke tabel users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS assigned_location_id UUID
    REFERENCES public.locations(id) ON DELETE SET NULL;

-- 4. Index untuk lookup LO berdasarkan lokasi
CREATE INDEX IF NOT EXISTS idx_users_assigned_location
  ON public.users(assigned_location_id);

-- 5. Index untuk lookup tim berdasarkan barcode_data
CREATE INDEX IF NOT EXISTS idx_teams_barcode_data
  ON public.teams(barcode_data);

-- 6. RLS policy: LO dapat insert ke tabel scans (untuk check-in tim)
--    Requirement 9.1: hanya LO yang di-assign ke lokasi yang sesuai
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'scans'
      AND policyname = 'scans_insert_lo'
  ) THEN
    CREATE POLICY "scans_insert_lo" ON public.scans
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE auth_id = auth.uid()
            AND role = 'lo'
            AND assigned_location_id IS NOT NULL
        )
      );
  END IF;
END
$$;
