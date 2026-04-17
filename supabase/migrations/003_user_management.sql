-- User Management Migration
-- Makes no_unik nullable, adds partial unique constraint per team, and adds login lookup index

-- 1. Ubah no_unik menjadi nullable
ALTER TABLE public.users
  ALTER COLUMN no_unik DROP NOT NULL;

-- 2. Tambah partial unique constraint: no_unik unik per tim,
--    hanya berlaku jika keduanya NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_team_no_unik
  ON public.users (team_id, no_unik)
  WHERE team_id IS NOT NULL AND no_unik IS NOT NULL;

-- 3. Index untuk login lookup (nama + npk, case-insensitive)
CREATE INDEX IF NOT EXISTS idx_users_nama_npk
  ON public.users (lower(npk), lower(nama));
