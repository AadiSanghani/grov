CREATE TABLE IF NOT EXISTS investment_holding_overrides (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_type_id BIGINT NOT NULL REFERENCES account_types(id) ON DELETE CASCADE,
  security_id BIGINT NOT NULL REFERENCES investment_securities(id) ON DELETE CASCADE,
  override_security_id BIGINT REFERENCES investment_securities(id) ON DELETE SET NULL,
  quantity NUMERIC(20, 8),
  avg_cost NUMERIC(20, 8),
  currency TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, account_type_id, security_id),
  CONSTRAINT investment_holding_overrides_quantity_check
    CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT investment_holding_overrides_avg_cost_check
    CHECK (avg_cost IS NULL OR avg_cost >= 0),
  CONSTRAINT investment_holding_overrides_currency_check
    CHECK (currency IS NULL OR char_length(trim(currency)) = 3)
);

CREATE INDEX IF NOT EXISTS idx_investment_holding_overrides_user
  ON investment_holding_overrides(user_id);

ALTER TABLE investment_holding_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own investment holding overrides"
ON investment_holding_overrides FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own investment holding overrides"
ON investment_holding_overrides FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'sub' = user_id
  AND EXISTS (
    SELECT 1
    FROM account_types a
    WHERE a.id = investment_holding_overrides.account_type_id
      AND a.user_id = investment_holding_overrides.user_id
      AND a.account_type = 'Investments'
      AND a.archived_at IS NULL
  )
);

CREATE POLICY "Users can update their own investment holding overrides"
ON investment_holding_overrides FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id)
WITH CHECK (
  auth.jwt() ->> 'sub' = user_id
  AND EXISTS (
    SELECT 1
    FROM account_types a
    WHERE a.id = investment_holding_overrides.account_type_id
      AND a.user_id = investment_holding_overrides.user_id
      AND a.account_type = 'Investments'
      AND a.archived_at IS NULL
  )
);

CREATE POLICY "Users can delete their own investment holding overrides"
ON investment_holding_overrides FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);
