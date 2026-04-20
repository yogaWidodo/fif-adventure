-- Migration: Add barcode_data to activities table
-- This allows for custom physical QR codes to be mapped to activities.

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS barcode_data VARCHAR;

-- Add unique constraint to ensure no two activities share the same barcode
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_barcode_data_key') THEN
        ALTER TABLE public.activities ADD CONSTRAINT activities_barcode_data_key UNIQUE (barcode_data);
    END IF;
END $$;
