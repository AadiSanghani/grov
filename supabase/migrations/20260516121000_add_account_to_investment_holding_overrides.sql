ALTER TABLE investment_holding_overrides
ADD COLUMN IF NOT EXISTS override_account_type_id BIGINT REFERENCES account_types(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Users can insert their own investment holding overrides"
ON investment_holding_overrides;

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
  AND (
    investment_holding_overrides.override_account_type_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM account_types oa
      WHERE oa.id = investment_holding_overrides.override_account_type_id
        AND oa.user_id = investment_holding_overrides.user_id
        AND oa.account_type = 'Investments'
        AND oa.archived_at IS NULL
    )
  )
);

DROP POLICY IF EXISTS "Users can update their own investment holding overrides"
ON investment_holding_overrides;

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
  AND (
    investment_holding_overrides.override_account_type_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM account_types oa
      WHERE oa.id = investment_holding_overrides.override_account_type_id
        AND oa.user_id = investment_holding_overrides.user_id
        AND oa.account_type = 'Investments'
        AND oa.archived_at IS NULL
    )
  )
);
