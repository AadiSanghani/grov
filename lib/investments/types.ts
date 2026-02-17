export type InvestmentTransactionType = "BUY" | "SELL" | "DIVIDEND" | "FEE"
export type InvestmentRangeKey = "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y"

export interface InvestmentAccount {
  id: string
  user_id?: string
  name: string
  base_currency: string
  linked_account_type_id: number | null
  linked_account_balance?: number
  linked_account_subtype?: string
  created_at?: string
  updated_at?: string
}

export interface Security {
  id: string
  ticker: string
  name: string | null
  asset_type: string
  quote_currency: string
  created_at?: string
}

export interface InvestmentTransaction {
  id: string
  user_id?: string
  account_id: string
  security_id: string
  type: InvestmentTransactionType
  trade_date: string
  quantity: number
  price: number
  currency: string
  fees: number
  fx_rate_to_base?: number | null
  notes?: string | null
  created_at?: string
  updated_at?: string
  ticker?: string
  security_name?: string | null
  security_asset_type?: string
  security_quote_currency?: string
  account_name?: string
  account_base_currency?: string
}

export interface HoldingsSnapshotRow {
  account_id: string
  account_name: string
  base_currency: string
  security_id: string
  ticker: string
  security_name: string | null
  asset_type: string
  quote_currency: string
  quantity: number
  avg_cost_base: number
  cost_basis_base: number
  current_price_quote: number
  market_value_base: number
  unrealized_pl_base: number
  return_pct: number
  price_source: 'live' | 'fallback'
}

export interface AllocationSlice {
  label: string
  value_base: number
  pct: number
}

export interface RealizedGainRow {
  trade_date: string
  account_id: string
  account_name: string
  ticker: string
  quantity_sold: number
  proceeds_base: number
  cost_basis_base: number
  realized_pl_base: number
}

export interface AccountStatusRow {
  account_id: string
  account_name: string
  base_currency: string
  market_value_base: number
  cost_basis_base: number
  unrealized_pl_base: number
  realized_pl_all_time_base: number
  realized_pl_in_range_base: number
  total_return_pct: number
}

export interface PortfolioPerformancePoint {
  date: string
  value_base: number
  return_pct: number
}
