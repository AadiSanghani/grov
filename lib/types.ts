export interface Transaction {
  id?: string
  user_id?: string
  transaction_type: "debit" | "credit"
  amount: number
  merchant: string
  date: Date
  account_id: string
  category: string
  notes?: string
  created_at?: Date
  updated_at?: Date
}

export interface TransactionFilters {
  sortBy: "date" | "amount" | "merchant"
  sortOrder: "asc" | "desc"
  search: string
  accounts: string[]
  categories: string[]
  amountMin?: number
  amountMax?: number
  dateStart?: Date
  dateEnd?: Date
  tags: string[]
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
