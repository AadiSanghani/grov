export interface Transaction {
  id?: string
  user_id?: string
  transaction_type: "outgoing" | "incoming" | "transfer"
  amount: number
  merchant: string
  date: Date
  account_type_id: string
  category: string
  notes?: string
  spending_amount?: number | null
  to_account_type_id?: string | null
  created_at?: Date
  updated_at?: Date
}

export interface DailyBalance {
  id?: number
  user_id?: string
  account_id: number
  date: string  // YYYY-MM-DD
  balance_amount: number
  created_at?: Date
  updated_at?: Date
}

export interface NetWorthDataPoint {
  date: string
  total_assets: number
  total_liabilities: number
  net_worth: number
}

export interface TransactionFilters {
  sortBy: "date" | "amount" | "merchant"
  sortOrder: "asc" | "desc"
  search: string
  account_types: string[]
  categories: string[]
  amountMin?: number
  amountMax?: number
  dateStart?: Date
  dateEnd?: Date
  tags: string[]
}

export interface Merchant {
  id?: number
  user_id?: string
  name: string
  created_at?: Date
}

export interface TransactionSummary {
  totalTransactions: number
  largestIncome: number
  largestExpense: number
  averageTransaction: number
  totalIncome: number
  totalSpending: number
  firstTransactionDate: Date | null
  lastTransactionDate: Date | null
}
