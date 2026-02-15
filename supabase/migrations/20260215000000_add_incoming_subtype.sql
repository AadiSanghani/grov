ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS incoming_subtype TEXT;

UPDATE transactions
SET incoming_subtype = CASE
  WHEN transaction_type = 'incoming' AND category = 'expense-reimbursement' THEN 'reimbursement'
  WHEN transaction_type = 'incoming' THEN 'income'
  ELSE NULL
END;

ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_incoming_subtype_check;

ALTER TABLE transactions
ADD CONSTRAINT transactions_incoming_subtype_check
CHECK (
  (transaction_type = 'incoming' AND incoming_subtype IN ('income', 'reimbursement'))
  OR (transaction_type IN ('outgoing', 'transfer') AND incoming_subtype IS NULL)
);
