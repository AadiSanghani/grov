ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS affects_balance BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS trip_id BIGINT REFERENCES trips(id) ON DELETE SET NULL;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS trip_entry_id BIGINT;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';

-- Legacy transactions can be unassigned after account deletion. They should continue to
-- appear in reports, but they cannot update a real account balance anymore.
UPDATE transactions
SET affects_balance = FALSE
WHERE account_type_id IS NULL
  AND transaction_type IN ('outgoing', 'incoming');

ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_affects_balance_account_check;

ALTER TABLE transactions
ADD CONSTRAINT transactions_affects_balance_account_check
CHECK (
  affects_balance = FALSE
  OR transaction_type = 'transfer'
  OR account_type_id IS NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_import_batches (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  self_participant TEXT NOT NULL,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'imported',
  row_count INTEGER NOT NULL DEFAULT 0,
  expense_count INTEGER NOT NULL DEFAULT 0,
  payment_count INTEGER NOT NULL DEFAULT 0,
  ignored_count INTEGER NOT NULL DEFAULT 0,
  total_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_self_share NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_self_net NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT trip_import_batches_status_check
    CHECK (status IN ('imported', 'settled', 'needs_review'))
);

CREATE INDEX IF NOT EXISTS idx_trip_import_batches_user_trip
ON trip_import_batches(user_id, trip_id);

ALTER TABLE trip_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trip import batches"
ON trip_import_batches FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own trip import batches"
ON trip_import_batches FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own trip import batches"
ON trip_import_batches FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own trip import batches"
ON trip_import_batches FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE TABLE IF NOT EXISTS trip_shared_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  import_batch_id BIGINT REFERENCES trip_import_batches(id) ON DELETE SET NULL,
  transaction_id BIGINT REFERENCES transactions(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'import',
  entry_kind TEXT NOT NULL,
  payment_direction TEXT,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  splitwise_category TEXT NOT NULL,
  grov_category TEXT NOT NULL,
  total_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CAD',
  self_net NUMERIC(15, 2) NOT NULL DEFAULT 0,
  self_share NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payer_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  participant_amounts JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_row JSONB,
  posting_status TEXT NOT NULL DEFAULT 'posted',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT trip_shared_entries_source_check
    CHECK (source IN ('import', 'manual')),
  CONSTRAINT trip_shared_entries_kind_check
    CHECK (entry_kind IN ('expense', 'payment')),
  CONSTRAINT trip_shared_entries_payment_direction_check
    CHECK (payment_direction IS NULL OR payment_direction IN ('received', 'sent')),
  CONSTRAINT trip_shared_entries_posting_status_check
    CHECK (posting_status IN ('posted', 'ignored', 'needs_review'))
);

CREATE INDEX IF NOT EXISTS idx_trip_shared_entries_user_trip
ON trip_shared_entries(user_id, trip_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_trip_shared_entries_transaction
ON trip_shared_entries(transaction_id);

ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_trip_entry_id_fkey;

ALTER TABLE transactions
ADD CONSTRAINT transactions_trip_entry_id_fkey
FOREIGN KEY (trip_entry_id) REFERENCES trip_shared_entries(id) ON DELETE SET NULL;

ALTER TABLE trip_shared_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trip shared entries"
ON trip_shared_entries FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own trip shared entries"
ON trip_shared_entries FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own trip shared entries"
ON trip_shared_entries FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own trip shared entries"
ON trip_shared_entries FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);
