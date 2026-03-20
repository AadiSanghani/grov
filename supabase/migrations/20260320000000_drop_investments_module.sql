-- Remove portfolio investments module (tables from 20260217090000_add_investments_module.sql).
-- Order respects FKs: transactions -> accounts; transactions reference securities.

DROP TABLE IF EXISTS investment_transactions CASCADE;
DROP TABLE IF EXISTS investment_accounts CASCADE;
DROP TABLE IF EXISTS securities CASCADE;
DROP TABLE IF EXISTS fx_rates CASCADE;
DROP TABLE IF EXISTS market_quotes_cache CASCADE;
DROP TABLE IF EXISTS market_history_cache CASCADE;
