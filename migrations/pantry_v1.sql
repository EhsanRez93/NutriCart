-- NutriCart v15.0 — Pantry-aware meal planning
-- Run this in Supabase SQL editor before deploying.

-- pantry_items: what the user has in their fridge / cupboard.
-- AI uses this when generating meal plans to prefer recipes that use what's already on hand.
CREATE TABLE IF NOT EXISTS pantry_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  quantity    numeric,
  unit        text,                  -- e.g. 'g', 'kg', 'pcs', 'ml', 'tsp'
  category    text        DEFAULT 'pantry', -- pantry | fridge | freezer | spices
  expiry_date date,                  -- optional — used for expiry alerts
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups when generating plans / showing pantry tab
CREATE INDEX IF NOT EXISTS pantry_items_user_idx        ON pantry_items (user_id);
CREATE INDEX IF NOT EXISTS pantry_items_user_expiry_idx ON pantry_items (user_id, expiry_date) WHERE expiry_date IS NOT NULL;

-- Row-level security so users can only access their own items
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pantry_select_own" ON pantry_items;
CREATE POLICY "pantry_select_own" ON pantry_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pantry_insert_own" ON pantry_items;
CREATE POLICY "pantry_insert_own" ON pantry_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pantry_update_own" ON pantry_items;
CREATE POLICY "pantry_update_own" ON pantry_items
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pantry_delete_own" ON pantry_items;
CREATE POLICY "pantry_delete_own" ON pantry_items
  FOR DELETE USING (auth.uid() = user_id);
