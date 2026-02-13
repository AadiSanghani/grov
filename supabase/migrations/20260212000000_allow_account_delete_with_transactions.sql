ALTER TABLE transactions
ALTER COLUMN account_type_id DROP NOT NULL;

ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_account_type_id_fkey;

ALTER TABLE transactions
ADD CONSTRAINT transactions_account_type_id_fkey
FOREIGN KEY (account_type_id) REFERENCES account_types(id) ON DELETE SET NULL;
