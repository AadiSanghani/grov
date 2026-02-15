CREATE TABLE IF NOT EXISTS trip_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trip_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_transactions_user_trip
ON trip_transactions(user_id, trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_transactions_user_transaction
ON trip_transactions(user_id, transaction_id);

ALTER TABLE trip_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trip associations"
ON trip_transactions FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own trip associations"
ON trip_transactions FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own trip associations"
ON trip_transactions FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own trip associations"
ON trip_transactions FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);
