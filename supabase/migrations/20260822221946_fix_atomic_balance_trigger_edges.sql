-- Correct INSERT/DELETE handling for deductions that do not affect balances.
CREATE OR REPLACE FUNCTION public.sync_payroll_deduction_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.affects_balance THEN
      PERFORM public.apply_account_transaction_delta(
        NEW.target_account_id, NEW.user_id, NEW.transaction_date, 'incoming', NEW.amount, 1
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.affects_balance THEN
      PERFORM public.apply_account_transaction_delta(
        OLD.target_account_id, OLD.user_id, OLD.transaction_date, 'incoming', OLD.amount, -1
      );
    END IF;
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

-- Parent balance-policy changes must propagate to deduction rows as well.
DROP TRIGGER IF EXISTS transactions_sync_payroll_deduction_dates ON public.transactions;
CREATE TRIGGER transactions_sync_payroll_deduction_dates
AFTER UPDATE OF date, affects_balance ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_payroll_deduction_dates();
