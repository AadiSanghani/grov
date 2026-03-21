export type InvestmentTransactionType = "BUY" | "SELL" | "DRIP"
export type InvestmentTimeRange = "1M" | "3M" | "1Y" | "ALL"
export type InvestmentSyncSlot = "open" | "midday" | "close" | "manual"

export interface InvestmentAccount {
  id: string
  account_name: string
  account_subtype: string
  base_currency: string
}

export interface InvestmentSecurity {
  id: string
  ticker: string
  yahoo_symbol: string
  name: string | null
  asset_type: string
  quote_currency: string
}

export interface InvestmentTransaction {
  id: string
  user_id: string
  account_type_id: string
  security_id: string
  transaction_type: InvestmentTransactionType
  trade_date: string
  quantity: number
  unit_price: number
  fees: number
  trade_currency: string
  fx_rate_to_cad: number | null
  notes: string | null
  created_at: string
  updated_at: string
  security?: InvestmentSecurity
  account_name?: string
}

export interface InvestmentQuoteSnapshot {
  security_id: string
  price: number
  previous_close: number | null
  quote_currency: string
  as_of: string
  source: string
  stale: boolean
}

export interface InvestmentHistoryPoint {
  date: string
  close: number
  currency: string
}

export interface RealizedPnLRow {
  trade_date: string
  account_type_id: string
  account_name: string
  ticker: string
  quantity_sold: number
  proceeds_cad: number
  cost_basis_cad: number
  realized_pnl_cad: number
}

export interface DerivedHolding {
  account_type_id: string
  account_name: string
  security_id: string
  ticker: string
  security_name: string | null
  asset_type: string
  quantity: number
  avg_cost_cad: number
  cost_basis_cad: number
  current_price: number
  current_price_currency: string
  market_value_cad: number
  previous_close_price: number | null
  previous_close_value_cad: number | null
  day_change_cad: number
  unrealized_pnl_cad: number
  unrealized_pnl_pct: number
  allocation_pct: number
  quote_as_of: string | null
  price_source: "cache" | "live" | "fallback"
}

export interface PortfolioSummary {
  total_value_cad: number
  total_cost_basis_cad: number
  total_unrealized_pnl_cad: number
  total_unrealized_pnl_pct: number
  total_realized_pnl_cad: number
  day_change_cad: number
  day_change_pct: number
}

export interface AllocationSlice {
  label: string
  value_cad: number
  pct: number
}

export interface ShareCountSlice {
  label: string
  quantity: number
  pct: number
}

export interface PortfolioSeriesPoint {
  date: string
  value_cad: number
  normalized: number
}

export interface BenchmarkSeriesPoint {
  date: string
  value_cad: number
  normalized: number
}

export interface InvestmentDashboardData {
  primary_currency: "CAD"
  as_of: string | null
  summary: PortfolioSummary
  holdings: DerivedHolding[]
  realized_preview: RealizedPnLRow[]
  allocation_by_account: AllocationSlice[]
  allocation_by_currency: AllocationSlice[]
  allocation_by_security: AllocationSlice[]
  portfolio_series: PortfolioSeriesPoint[]
  benchmark_series: BenchmarkSeriesPoint[]
  transactions: InvestmentTransaction[]
  accounts: InvestmentAccount[]
  has_data: boolean
}

export interface InvestmentAllocationData {
  primary_currency: "CAD"
  as_of: string | null
  summary: PortfolioSummary
  holdings: DerivedHolding[]
  allocation_by_account: AllocationSlice[]
  allocation_by_currency: AllocationSlice[]
  allocation_by_security: AllocationSlice[]
  share_count_by_security: ShareCountSlice[]
  accounts: InvestmentAccount[]
  has_data: boolean
}

export interface InvestmentRealizedData {
  rows: RealizedPnLRow[]
  totals: {
    proceeds_cad: number
    cost_basis_cad: number
    realized_pnl_cad: number
  }
}

export interface CreateInvestmentTransactionInput {
  account_type_id: string
  ticker: string
  transaction_type: InvestmentTransactionType
  trade_date: string
  quantity: number
  unit_price: number
  fees?: number
  trade_currency: string
  fx_rate_to_cad?: number | null
  notes?: string | null
}

export interface UpdateInvestmentTransactionInput {
  transaction_type?: InvestmentTransactionType
  trade_date?: string
  quantity?: number
  unit_price?: number
  fees?: number
  trade_currency?: string
  fx_rate_to_cad?: number | null
  notes?: string | null
}

export interface SyncRunResult {
  run_date: string
  slot: InvestmentSyncSlot
  status: "success" | "partial" | "failed" | "skipped"
  symbols_total: number
  symbols_succeeded: number
  symbols_failed: number
  message?: string
}

export interface EquityGrant {
  id: string
  user_id: string
  company_name: string
  grant_name: string
  symbol: string | null
  total_shares: number
  vested_shares: number
  unvested_shares: number
  grant_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreateEquityGrantInput {
  company_name: string
  grant_name: string
  symbol?: string | null
  total_shares?: number
  vested_shares?: number
  unvested_shares?: number
  grant_date?: string | null
  notes?: string | null
}

export type UpdateEquityGrantInput = Partial<CreateEquityGrantInput>
