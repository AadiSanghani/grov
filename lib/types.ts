export interface PayrollDeduction {
  id?: number
  transaction_id?: number
  user_id?: string
  label: string
  amount: number
  target_account_id?: number | null
  created_at?: Date
}

export type TripStatus = "planned" | "active" | "completed"

export interface Trip {
  id?: string
  user_id?: string
  name: string
  start_date?: Date | null
  end_date?: Date | null
  status: TripStatus
  created_at?: Date
  updated_at?: Date
}

export interface TripSummaryMetrics {
  totalSpend: number
  transactionCount: number
  avgPerDay: number
  largestExpense: number
}

export interface TripSharedLedgerSummary {
  importedRows: number
  expenseRows: number
  paymentRows: number
  ignoredRows: number
  myTripSpend: number
  paidByMe: number
  paidByOthersForMe: number
  reimbursements: number
  netBalance: number
  settled: boolean
  currency: string | null
}

export interface TripImportBatch {
  id?: string
  user_id?: string
  trip_id: string
  file_name: string
  self_participant: string
  currency: string | null
  status: "imported" | "settled" | "needs_review"
  row_count: number
  expense_count: number
  payment_count: number
  ignored_count: number
  total_cost: number
  total_self_share: number
  total_self_net: number
  created_at?: Date
  updated_at?: Date
}

export interface TripSharedEntry {
  id?: string
  user_id?: string
  trip_id: string
  import_batch_id?: string | null
  transaction_id?: string | null
  source: "import" | "manual"
  entry_kind: "expense" | "payment"
  payment_direction?: "received" | "sent" | null
  date: Date
  description: string
  splitwise_category: string
  grov_category: string
  total_cost: number
  currency: string
  self_net: number
  self_share: number
  payer_names: string[]
  participant_amounts: Record<string, number>
  raw_row?: Record<string, string> | null
  posting_status: "posted" | "ignored" | "needs_review"
  created_at?: Date
  updated_at?: Date
}

export interface TripImportDraftTransaction {
  include: boolean
  rowIndex: number
  kind: "you_paid" | "friend_paid" | "payment"
  date: string
  merchant: string
  category: string
  accountId: string | null
  amount: number
  spendingAmount: number | null
  affectsBalance: boolean
  transactionType: "outgoing" | "incoming"
  incomingSubtype?: "income" | "reimbursement" | null
  notes?: string
  sourceRow?: Record<string, string> | null
}

export interface TripCategorySpend {
  category: string
  amount: number
}

export interface TripDailySpendPoint {
  date: string
  amount: number
}

export interface TripMetrics extends TripSummaryMetrics {
  topCategories: TripCategorySpend[]
  dailySpend: TripDailySpendPoint[]
}

export interface TripWithMetrics extends Trip {
  metrics: TripSummaryMetrics
}

export interface Transaction {
  id?: string
  user_id?: string
  transaction_type: "outgoing" | "incoming" | "transfer"
  incoming_subtype?: "income" | "reimbursement" | null
  amount: number
  merchant: string
  date: Date
  account_type_id: string | null
  category: string
  notes?: string
  spending_amount?: number | null
  to_account_type_id?: string | null
  affects_balance?: boolean
  trip_id?: string | null
  trip_entry_id?: string | null
  source_type?: "manual" | "trip_shared_expense" | "trip_settlement" | string | null
  deductions?: PayrollDeduction[]
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

export interface AccountGrowthDataPoint {
  date: string
  balance: number
  growth_amount: number
  growth_pct: number
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
