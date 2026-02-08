ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS to_account_type_id BIGINT REFERENCES account_types(id) ON DELETE SET NULL;

ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE transactions
ADD CONSTRAINT transactions_transaction_type_check
CHECK (transaction_type IN ('outgoing', 'incoming', 'transfer'));

ALTER TABLE transactions
ADD CONSTRAINT transactions_transfer_to_account_check
CHECK (
  (transaction_type = 'transfer' AND to_account_type_id IS NOT NULL AND to_account_type_id <> account_type_id)
  OR
  (transaction_type IN ('outgoing', 'incoming') AND to_account_type_id IS NULL)
);
