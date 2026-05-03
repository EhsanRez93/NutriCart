-- NutriCart v13.0 — AI Insights tab
-- Run this in Supabase SQL editor before deploying the new frontend.

-- daily_checkins: optional 1-tap daily mood / energy / brain-fog / sleep tracker
-- Each user has at most one row per day (upsert).
CREATE TABLE IF NOT EXISTS daily_checkins (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date date        NOT NULL,
  energy       integer     CHECK (energy BETWEEN 1 AND 5),
  mood         integer     CHECK (mood   BETWEEN 1 AND 5),
  sleep        integer     CHECK (sleep  BETWEEN 1 AND 5),
  brain_fog    boolean     DEFAULT false,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One row per (user, date)
ALTER TABLE daily_checkins
  DROP CONSTRAINT IF EXISTS daily_checkins_user_date_unique;
ALTER TABLE daily_checkins
  ADD CONSTRAINT daily_checkins_user_date_unique UNIQUE (user_id, checkin_date);

-- Row-level security so users can only see their own check-ins
ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkins_select_own" ON daily_checkins;
CREATE POLICY "checkins_select_own" ON daily_checkins
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "checkins_insert_own" ON daily_checkins;
CREATE POLICY "checkins_insert_own" ON daily_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "checkins_update_own" ON daily_checkins;
CREATE POLICY "checkins_update_own" ON daily_checkins
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "checkins_delete_own" ON daily_checkins;
CREATE POLICY "checkins_delete_own" ON daily_checkins
  FOR DELETE USING (auth.uid() = user_id);

-- Optional: cache the latest insights blob on the profile so users see them
-- immediately on page load (without re-calling Groq)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cached_insights      jsonb,
  ADD COLUMN IF NOT EXISTS insights_generated_at timestamptz;
