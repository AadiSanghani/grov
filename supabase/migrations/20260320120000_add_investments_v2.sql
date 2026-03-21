-- Investments v2: transaction-ledger portfolio tracking, market-data cache, sync observability,
-- and equity compensation skeleton.

CREATE TABLE IF NOT EXISTS investment_securities (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  yahoo_symbol TEXT NOT NULL UNIQUE,
  name TEXT,
  asset_type TEXT NOT NULL DEFAULT 'stock',
  quote_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT investment_securities_asset_type_check
    CHECK (char_length(trim(asset_type)) > 0),
  CONSTRAINT investment_securities_quote_currency_check
    CHECK (char_length(trim(quote_currency)) = 3)
);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_type_id BIGINT NOT NULL REFERENCES account_types(id) ON DELETE CASCADE,
  security_id BIGINT NOT NULL REFERENCES investment_securities(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL,
  trade_date DATE NOT NULL,
  quantity NUMERIC(20, 8) NOT NULL,
  unit_price NUMERIC(20, 8) NOT NULL,
  fees NUMERIC(20, 8) NOT NULL DEFAULT 0,
  trade_currency TEXT NOT NULL,
  fx_rate_to_cad NUMERIC(20, 10),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT investment_transactions_type_check
    CHECK (transaction_type IN ('BUY', 'SELL', 'DRIP')),
  CONSTRAINT investment_transactions_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT investment_transactions_unit_price_check
    CHECK (unit_price >= 0),
  CONSTRAINT investment_transactions_fees_check
    CHECK (fees >= 0),
  CONSTRAINT investment_transactions_trade_currency_check
    CHECK (char_length(trim(trade_currency)) = 3),
  CONSTRAINT investment_transactions_fx_rate_check
    CHECK (fx_rate_to_cad IS NULL OR fx_rate_to_cad > 0)
);

CREATE TABLE IF NOT EXISTS investment_quotes_cache (
  security_id BIGINT PRIMARY KEY REFERENCES investment_securities(id) ON DELETE CASCADE,
  quote_currency TEXT NOT NULL,
  price NUMERIC(20, 8) NOT NULL,
  previous_close NUMERIC(20, 8),
  as_of TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'yahoo',
  payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT investment_quotes_cache_price_check CHECK (price > 0),
  CONSTRAINT investment_quotes_cache_previous_close_check
    CHECK (previous_close IS NULL OR previous_close > 0),
  CONSTRAINT investment_quotes_cache_quote_currency_check
    CHECK (char_length(trim(quote_currency)) = 3)
);

CREATE TABLE IF NOT EXISTS investment_history_cache (
  id BIGSERIAL PRIMARY KEY,
  security_id BIGINT NOT NULL REFERENCES investment_securities(id) ON DELETE CASCADE,
  price_date DATE NOT NULL,
  close_price NUMERIC(20, 8) NOT NULL,
  quote_currency TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'yahoo',
  payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (security_id, price_date),
  CONSTRAINT investment_history_cache_close_price_check CHECK (close_price > 0),
  CONSTRAINT investment_history_cache_quote_currency_check
    CHECK (char_length(trim(quote_currency)) = 3)
);

CREATE TABLE IF NOT EXISTS investment_fx_rates_cache (
  id BIGSERIAL PRIMARY KEY,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate_date DATE NOT NULL,
  rate NUMERIC(20, 10) NOT NULL,
  source TEXT NOT NULL DEFAULT 'yahoo',
  payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (base_currency, quote_currency, rate_date),
  CONSTRAINT investment_fx_rates_cache_rate_check CHECK (rate > 0),
  CONSTRAINT investment_fx_rates_cache_base_currency_check
    CHECK (char_length(trim(base_currency)) = 3),
  CONSTRAINT investment_fx_rates_cache_quote_currency_check
    CHECK (char_length(trim(quote_currency)) = 3)
);

CREATE TABLE IF NOT EXISTS investment_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  run_date DATE NOT NULL,
  slot TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  symbols_total INT NOT NULL DEFAULT 0,
  symbols_succeeded INT NOT NULL DEFAULT 0,
  symbols_failed INT NOT NULL DEFAULT 0,
  error_summary TEXT,
  details JSONB,
  CONSTRAINT investment_sync_runs_slot_check
    CHECK (slot IN ('open', 'midday', 'close', 'manual')),
  CONSTRAINT investment_sync_runs_status_check
    CHECK (status IN ('started', 'success', 'partial', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_investment_sync_runs_daily_slot
  ON investment_sync_runs(run_date, slot)
  WHERE slot IN ('open', 'midday', 'close');

CREATE TABLE IF NOT EXISTS equity_grants (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  grant_name TEXT NOT NULL,
  symbol TEXT,
  total_shares NUMERIC(20, 8) NOT NULL DEFAULT 0,
  vested_shares NUMERIC(20, 8) NOT NULL DEFAULT 0,
  unvested_shares NUMERIC(20, 8) NOT NULL DEFAULT 0,
  grant_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT equity_grants_total_shares_check CHECK (total_shares >= 0),
  CONSTRAINT equity_grants_vested_shares_check CHECK (vested_shares >= 0),
  CONSTRAINT equity_grants_unvested_shares_check CHECK (unvested_shares >= 0)
);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_user_date
  ON investment_transactions(user_id, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_account_date
  ON investment_transactions(account_type_id, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_security_date
  ON investment_transactions(security_id, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_history_cache_security_date
  ON investment_history_cache(security_id, price_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_fx_rates_pair_date
  ON investment_fx_rates_cache(base_currency, quote_currency, rate_date DESC);

CREATE INDEX IF NOT EXISTS idx_equity_grants_user
  ON equity_grants(user_id);

ALTER TABLE investment_securities ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_quotes_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_history_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_fx_rates_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equity_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read investment securities"
ON investment_securities FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can insert investment securities"
ON investment_securities FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update investment securities"
ON investment_securities FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Users can view their own investment transactions"
ON investment_transactions FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own investment transactions"
ON investment_transactions FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'sub' = user_id
  AND EXISTS (
    SELECT 1
    FROM account_types a
    WHERE a.id = account_type_id
      AND a.user_id = auth.jwt() ->> 'sub'
      AND a.account_type = 'Investments'
  )
);

CREATE POLICY "Users can update their own investment transactions"
ON investment_transactions FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id)
WITH CHECK (
  auth.jwt() ->> 'sub' = user_id
  AND EXISTS (
    SELECT 1
    FROM account_types a
    WHERE a.id = account_type_id
      AND a.user_id = auth.jwt() ->> 'sub'
      AND a.account_type = 'Investments'
  )
);

CREATE POLICY "Users can delete their own investment transactions"
ON investment_transactions FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Authenticated users can read investment quotes cache"
ON investment_quotes_cache FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can upsert investment quotes cache"
ON investment_quotes_cache FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update investment quotes cache"
ON investment_quotes_cache FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can read investment history cache"
ON investment_history_cache FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can upsert investment history cache"
ON investment_history_cache FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update investment history cache"
ON investment_history_cache FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can read investment fx cache"
ON investment_fx_rates_cache FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can upsert investment fx cache"
ON investment_fx_rates_cache FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update investment fx cache"
ON investment_fx_rates_cache FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can read investment sync runs"
ON investment_sync_runs FOR SELECT
USING (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can write investment sync runs"
ON investment_sync_runs FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Authenticated users can update investment sync runs"
ON investment_sync_runs FOR UPDATE
USING (auth.jwt() ->> 'sub' IS NOT NULL)
WITH CHECK (auth.jwt() ->> 'sub' IS NOT NULL);

CREATE POLICY "Users can view their own equity grants"
ON equity_grants FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own equity grants"
ON equity_grants FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own equity grants"
ON equity_grants FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id)
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own equity grants"
ON equity_grants FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);
