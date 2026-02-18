CREATE TABLE IF NOT EXISTS investment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'CAD',
  linked_account_type_id BIGINT UNIQUE REFERENCES account_types(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS securities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL UNIQUE,
  name TEXT,
  asset_type TEXT NOT NULL DEFAULT 'stock',
  quote_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES investment_accounts(id) ON DELETE CASCADE,
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  trade_date DATE NOT NULL,
  quantity NUMERIC(20, 8) NOT NULL,
  price NUMERIC(20, 8) NOT NULL,
  currency TEXT NOT NULL,
  fees NUMERIC(20, 8) NOT NULL DEFAULT 0,
  fx_rate_to_base NUMERIC(20, 10),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT investment_transactions_type_check
    CHECK (type IN ('BUY', 'SELL', 'DIVIDEND', 'FEE')),
  CONSTRAINT investment_transactions_quantity_check
    CHECK (quantity >= 0),
  CONSTRAINT investment_transactions_price_check
    CHECK (price >= 0),
  CONSTRAINT investment_transactions_fees_check
    CHECK (fees >= 0),
  CONSTRAINT investment_transactions_fx_rate_check
    CHECK (fx_rate_to_base IS NULL OR fx_rate_to_base > 0)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  id BIGSERIAL PRIMARY KEY,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate NUMERIC(20, 10) NOT NULL CHECK (rate > 0),
  rate_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (base, quote, rate_date)
);

-- Latest quote cache keyed by ticker.
CREATE TABLE IF NOT EXISTS market_quotes_cache (
  ticker TEXT PRIMARY KEY,
  quote_currency TEXT NOT NULL,
  price NUMERIC(20, 8) NOT NULL CHECK (price > 0),
  as_of TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'yahoo',
  payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historical daily close cache keyed by ticker + date.
CREATE TABLE IF NOT EXISTS market_history_cache (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  price_date DATE NOT NULL,
  close_price NUMERIC(20, 8) NOT NULL CHECK (close_price > 0),
  quote_currency TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'yahoo',
  payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticker, price_date)
);

CREATE INDEX IF NOT EXISTS idx_investment_accounts_user
  ON investment_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_user_date
  ON investment_transactions(user_id, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_account_date
  ON investment_transactions(account_id, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_security_date
  ON investment_transactions(security_id, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_securities_asset_type
  ON securities(asset_type);

CREATE INDEX IF NOT EXISTS idx_fx_rates_pair_date
  ON fx_rates(base, quote, rate_date DESC);

CREATE INDEX IF NOT EXISTS idx_market_history_cache_ticker_date
  ON market_history_cache(ticker, price_date DESC);

ALTER TABLE investment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE securities ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_quotes_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_history_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own investment accounts"
ON investment_accounts FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own investment accounts"
ON investment_accounts FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own investment accounts"
ON investment_accounts FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id)
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own investment accounts"
ON investment_accounts FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can view their own investment transactions"
ON investment_transactions FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own investment transactions"
ON investment_transactions FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'sub' = user_id
  AND EXISTS (
    SELECT 1
    FROM investment_accounts ia
    WHERE ia.id = account_id
      AND ia.user_id = auth.jwt() ->> 'sub'
  )
);

CREATE POLICY "Users can update their own investment transactions"
ON investment_transactions FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id)
WITH CHECK (
  auth.jwt() ->> 'sub' = user_id
  AND EXISTS (
    SELECT 1
    FROM investment_accounts ia
    WHERE ia.id = account_id
      AND ia.user_id = auth.jwt() ->> 'sub'
  )
);

CREATE POLICY "Users can delete their own investment transactions"
ON investment_transactions FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Authenticated users can read securities"
ON securities FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can insert securities"
ON securities FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update securities"
ON securities FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can read fx rates"
ON fx_rates FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can insert fx rates"
ON fx_rates FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update fx rates"
ON fx_rates FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can read quote cache"
ON market_quotes_cache FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can upsert quote cache"
ON market_quotes_cache FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update quote cache"
ON market_quotes_cache FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can read history cache"
ON market_history_cache FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can upsert history cache"
ON market_history_cache FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update history cache"
ON market_history_cache FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);
