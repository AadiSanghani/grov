-- Migration: Add category column to account_types and create account_daily_balances table
-- Also rename transaction_type values from debit/credit to outgoing/incoming

-- ============================================
-- 1. Add category column to account_types
-- ============================================
ALTER TABLE account_types 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Backfill existing accounts based on account_type
UPDATE account_types SET category = 'asset' 
WHERE account_type IN ('Cash', 'Investments', 'Real Estate', 'Valuables', 'Other Assets')
AND category IS NULL;

UPDATE account_types SET category = 'liability' 
WHERE account_type IN ('Credit Card', 'Mortgage', 'Loans', 'Vehicles', 'Other Liabilities')
AND category IS NULL;

-- Add check constraint
ALTER TABLE account_types 
ADD CONSTRAINT account_types_category_check 
CHECK (category IN ('asset', 'liability'));

-- Make category NOT NULL after backfill
ALTER TABLE account_types ALTER COLUMN category SET NOT NULL;

-- ============================================
-- 2. Rename transaction_type values
-- ============================================
-- Rename debit -> outgoing, credit -> incoming
UPDATE transactions SET transaction_type = 'outgoing' WHERE transaction_type = 'debit';
UPDATE transactions SET transaction_type = 'incoming' WHERE transaction_type = 'credit';

-- Drop existing constraint if any and add new one
ALTER TABLE transactions 
DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE transactions 
ADD CONSTRAINT transactions_transaction_type_check 
CHECK (transaction_type IN ('outgoing', 'incoming'));

-- ============================================
-- 3. Create account_daily_balances table
-- ============================================
CREATE TABLE IF NOT EXISTS account_daily_balances (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id BIGINT NOT NULL REFERENCES account_types(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  balance_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (account_id, date)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_balances_user_date 
ON account_daily_balances(user_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_balances_account_date 
ON account_daily_balances(account_id, date);

-- Enable RLS
ALTER TABLE account_daily_balances ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for account_daily_balances
CREATE POLICY "Users can view their own daily balances"
ON account_daily_balances FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own daily balances"
ON account_daily_balances FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own daily balances"
ON account_daily_balances FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own daily balances"
ON account_daily_balances FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);
