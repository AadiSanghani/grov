CREATE TABLE IF NOT EXISTS payroll_deductions (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  target_account_id BIGINT REFERENCES account_types(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_deductions_transaction_id ON payroll_deductions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payroll_deductions_user_id ON payroll_deductions(user_id);

ALTER TABLE payroll_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payroll deductions"
ON payroll_deductions FOR SELECT
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own payroll deductions"
ON payroll_deductions FOR INSERT
WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can update their own payroll deductions"
ON payroll_deductions FOR UPDATE
USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own payroll deductions"
ON payroll_deductions FOR DELETE
USING (auth.jwt() ->> 'sub' = user_id);
