export type InvestmentTransactionType = "BUY" | "SELL" | "DIVIDEND" | "FEE"

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
  account_name?: string
  account_base_currency?: string
}
