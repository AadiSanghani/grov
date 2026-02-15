CREATE TABLE IF NOT EXISTS trips (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_trips_user_id
ON trips(user_id);

CREATE INDEX IF NOT EXISTS idx_trips_user_dates
ON trips(user_id, start_date, end_date);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trips"
ON trips FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own trips"
ON trips FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own trips"
ON trips FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own trips"
ON trips FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);

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
