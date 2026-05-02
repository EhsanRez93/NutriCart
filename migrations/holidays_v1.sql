-- Add holiday_mode column to profiles table
-- Values: festive | normal | skip
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS holiday_mode TEXT
    NOT NULL DEFAULT 'festive'
    CHECK (holiday_mode IN ('festive', 'normal', 'skip'));

-- Backfill any existing NULLs to 'festive' (safety net)
UPDATE profiles
  SET holiday_mode = 'festive'
  WHERE holiday_mode IS NULL;
