ALTER TABLE account_types
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_account_types_user_active
ON account_types(user_id)
WHERE archived_at IS NULL;
