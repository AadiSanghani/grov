ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS spending_amount NUMERIC(15, 2);

-- Constraint: when set, must be >= 0 and <= amount, only for outgoing
ALTER TABLE transactions
ADD CONSTRAINT transactions_spending_amount_check
CHECK (
  spending_amount IS NULL
  OR (transaction_type = 'outgoing' AND spending_amount >= 0 AND spending_amount <= amount)
);
