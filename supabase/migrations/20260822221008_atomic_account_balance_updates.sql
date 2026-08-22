-- Keep account balances and daily balance history consistent with the transaction
-- ledger. These mutations run in the same database transaction as the insert,
-- update, or delete that caused them, so concurrent requests cannot overwrite one
-- another with a stale read-modify-write value.

CREATE OR REPLACE FUNCTION public.apply_account_balance_delta(
  p_account_id BIGINT,
  p_user_id TEXT,
  p_date DATE,
  p_delta NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_account_id IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;

  -- This is deliberately an in-database increment. PostgreSQL takes a row lock
  -- for the UPDATE, so simultaneous transaction writes cannot lose a delta.
  UPDATE public.account_types
  SET account_balance = ((COALESCE(NULLIF(account_balance::TEXT, ''), '0')::NUMERIC + p_delta)::TEXT)
  WHERE id = p_account_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account % does not belong to user %', p_account_id, p_user_id;
  END IF;

  IF p_date IS NULL THEN
    RETURN;
  END IF;

  -- Seed a missing date from the prior snapshot, then carry the delta forward.
  INSERT INTO public.account_daily_balances (user_id, account_id, date, balance_amount)
  VALUES (
    p_user_id,
    p_account_id,
    p_date,
    COALESCE(
      (
        SELECT balance_amount
        FROM public.account_daily_balances
        WHERE account_id = p_account_id
          AND user_id = p_user_id
          AND date < p_date
        ORDER BY date DESC
        LIMIT 1
      ),
      0
    )
  )
  ON CONFLICT (account_id, date) DO NOTHING;

  UPDATE public.account_daily_balances
  SET balance_amount = balance_amount + p_delta,
      updated_at = NOW()
  WHERE account_id = p_account_id
    AND user_id = p_user_id
    AND date >= p_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_account_transaction_delta(
  p_account_id BIGINT,
  p_user_id TEXT,
  p_date DATE,
  p_transaction_type TEXT,
  p_amount NUMERIC,
  p_multiplier INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_category TEXT;
  v_delta NUMERIC;
BEGIN
  IF p_account_id IS NULL OR p_amount = 0 OR p_multiplier = 0 THEN
    RETURN;
  END IF;

  SELECT category
  INTO v_category
  FROM public.account_types
  WHERE id = p_account_id
    AND user_id = p_user_id;

  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Account % does not belong to user %', p_account_id, p_user_id;
  END IF;

  IF p_transaction_type NOT IN ('outgoing', 'incoming') THEN
    RAISE EXCEPTION 'Unsupported balance transaction type: %', p_transaction_type;
  END IF;

  IF v_category NOT IN ('asset', 'liability') THEN
    RAISE EXCEPTION 'Unsupported account category: %', v_category;
  END IF;

  v_delta = CASE
    WHEN v_category = 'liability' AND p_transaction_type = 'outgoing' THEN p_amount
    WHEN v_category = 'liability' AND p_transaction_type = 'incoming' THEN -p_amount
    WHEN v_category = 'asset' AND p_transaction_type = 'outgoing' THEN -p_amount
    WHEN v_category = 'asset' AND p_transaction_type = 'incoming' THEN p_amount
  END * p_multiplier;

  PERFORM public.apply_account_balance_delta(p_account_id, p_user_id, p_date, v_delta);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_transaction_balance_change(
  p_user_id TEXT,
  p_date DATE,
  p_transaction_type TEXT,
  p_amount NUMERIC,
  p_account_type_id BIGINT,
  p_to_account_type_id BIGINT,
  p_affects_balance BOOLEAN,
  p_multiplier INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(p_affects_balance, TRUE) THEN
    RETURN;
  END IF;

  IF p_transaction_type = 'transfer' THEN
    PERFORM public.apply_account_transaction_delta(
      p_account_type_id, p_user_id, p_date, 'outgoing', p_amount, p_multiplier
    );
    PERFORM public.apply_account_transaction_delta(
      p_to_account_type_id, p_user_id, p_date, 'incoming', p_amount, p_multiplier
    );
  ELSIF p_transaction_type IN ('outgoing', 'incoming') THEN
    PERFORM public.apply_account_transaction_delta(
      p_account_type_id, p_user_id, p_date, p_transaction_type, p_amount, p_multiplier
    );
  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', p_transaction_type;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_transaction_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_transaction_balance_change(
      NEW.user_id, NEW.date, NEW.transaction_type, NEW.amount,
      NEW.account_type_id, NEW.to_account_type_id, NEW.affects_balance, 1
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.apply_transaction_balance_change(
      OLD.user_id, OLD.date, OLD.transaction_type, OLD.amount,
      OLD.account_type_id, OLD.to_account_type_id, OLD.affects_balance, -1
    );
    RETURN OLD;
  END IF;

  PERFORM public.apply_transaction_balance_change(
    OLD.user_id, OLD.date, OLD.transaction_type, OLD.amount,
    OLD.account_type_id, OLD.to_account_type_id, OLD.affects_balance, -1
  );
  PERFORM public.apply_transaction_balance_change(
    NEW.user_id, NEW.date, NEW.transaction_type, NEW.amount,
    NEW.account_type_id, NEW.to_account_type_id, NEW.affects_balance, 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_sync_account_balance ON public.transactions;
CREATE TRIGGER transactions_sync_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_transaction_balance();

-- Deductions have their own balance effect. Persist the parent transaction date so
-- their delete/update triggers can maintain historical balances even when a parent
-- transaction is removed by ON DELETE CASCADE.
ALTER TABLE public.payroll_deductions
ADD COLUMN IF NOT EXISTS transaction_date DATE;

ALTER TABLE public.payroll_deductions
ADD COLUMN IF NOT EXISTS affects_balance BOOLEAN;

UPDATE public.payroll_deductions AS deduction
SET transaction_date = transaction.date,
    affects_balance = transaction.affects_balance
FROM public.transactions AS transaction
WHERE transaction.id = deduction.transaction_id
  AND (deduction.transaction_date IS NULL OR deduction.affects_balance IS NULL);

ALTER TABLE public.payroll_deductions
ALTER COLUMN transaction_date SET NOT NULL;

ALTER TABLE public.payroll_deductions
ALTER COLUMN affects_balance SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_payroll_deduction_transaction_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT date, affects_balance
  INTO NEW.transaction_date, NEW.affects_balance
  FROM public.transactions
  WHERE id = NEW.transaction_id
    AND user_id = NEW.user_id;

  IF NEW.transaction_date IS NULL THEN
    RAISE EXCEPTION 'Transaction % does not belong to user %', NEW.transaction_id, NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_deductions_set_transaction_date ON public.payroll_deductions;
CREATE TRIGGER payroll_deductions_set_transaction_date
BEFORE INSERT OR UPDATE OF transaction_id, user_id ON public.payroll_deductions
FOR EACH ROW
EXECUTE FUNCTION public.set_payroll_deduction_transaction_date();

CREATE OR REPLACE FUNCTION public.sync_payroll_deduction_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.affects_balance THEN
    PERFORM public.apply_account_transaction_delta(
      NEW.target_account_id, NEW.user_id, NEW.transaction_date, 'incoming', NEW.amount, 1
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.affects_balance THEN
    PERFORM public.apply_account_transaction_delta(
      OLD.target_account_id, OLD.user_id, OLD.transaction_date, 'incoming', OLD.amount, -1
    );
    RETURN OLD;
  END IF;

  IF OLD.affects_balance THEN
    PERFORM public.apply_account_transaction_delta(
      OLD.target_account_id, OLD.user_id, OLD.transaction_date, 'incoming', OLD.amount, -1
    );
  END IF;
  IF NEW.affects_balance THEN
    PERFORM public.apply_account_transaction_delta(
      NEW.target_account_id, NEW.user_id, NEW.transaction_date, 'incoming', NEW.amount, 1
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_deductions_sync_account_balance ON public.payroll_deductions;
CREATE TRIGGER payroll_deductions_sync_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.payroll_deductions
FOR EACH ROW
EXECUTE FUNCTION public.sync_payroll_deduction_balance();

-- Keep deduction history aligned when a parent transaction date changes.
CREATE OR REPLACE FUNCTION public.sync_payroll_deduction_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.date IS DISTINCT FROM OLD.date
    OR NEW.affects_balance IS DISTINCT FROM OLD.affects_balance THEN
    UPDATE public.payroll_deductions
    SET transaction_date = NEW.date,
        affects_balance = NEW.affects_balance
    WHERE transaction_id = NEW.id
      AND user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_sync_payroll_deduction_dates ON public.transactions;
CREATE TRIGGER transactions_sync_payroll_deduction_dates
AFTER UPDATE OF date ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_payroll_deduction_dates();
