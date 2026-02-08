-- Migration: Create merchants table for persisting user merchants

-- ============================================
-- 1. Create merchants table
-- ============================================
CREATE TABLE IF NOT EXISTS merchants (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_merchants_user_id
ON merchants(user_id);

-- ============================================
-- 2. Enable RLS
-- ============================================
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for merchants
CREATE POLICY "Users can view their own merchants"
ON merchants FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own merchants"
ON merchants FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own merchants"
ON merchants FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own merchants"
ON merchants FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);
