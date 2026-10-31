import type { Transaction, TransactionFilters } from "@/lib/types"
import { toLocalDateString } from "@/lib/utils"
import { parseFilters, serializeFilters } from "./filters"

export const LEDGER_PAGE_SIZE = 50

export interface LedgerSummary {
  totalTransactions: number
  totalIncome: number
  totalSpending: number
  largestIncome: number
  largestExpense: number
  averageTransaction: number
  net: number
}

export interface LedgerPage {
  transactions: Transaction[]
  summary: LedgerSummary
  page: number
  pageSize: number
  totalCount: number
}

export function normalizeLedgerPage(value: unknown) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0
    ? Math.min(page, 1_000_000)
    : 1
}

export function ledgerRequest(filters: TransactionFilters, page: number) {
  const normalized = parseFilters(serializeFilters(filters))
  return {
    p_filters: {
      search: normalized.search,
      sort: normalized.sortBy,
      order: normalized.sortOrder,
      accounts: normalized.account_types,
      categories: normalized.categories,
      from: normalized.dateStart ? toLocalDateString(normalized.dateStart) : null,
      to: normalized.dateEnd ? toLocalDateString(normalized.dateEnd) : null,
      min: normalized.amountMin ?? null,
      max: normalized.amountMax ?? null,
    },
    p_page: normalizeLedgerPage(page),
    p_page_size: LEDGER_PAGE_SIZE,
  }
}
