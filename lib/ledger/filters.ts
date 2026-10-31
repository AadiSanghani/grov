import type { Transaction, TransactionFilters } from "@/lib/types"
import { categoryNameToValue, toLocalDateString } from "@/lib/utils"
import { parseShortcutDateInput } from "./date-input"

export const defaultFilters: TransactionFilters = {
  sortBy: "date",
  sortOrder: "desc",
  search: "",
  account_types: [],
  categories: [],
  tags: [],
}
const keys = [
  "q",
  "sort",
  "order",
  "account",
  "category",
  "from",
  "to",
  "min",
  "max",
]

export function parseFilters(query: string): TransactionFilters {
  const params = new URLSearchParams(query)
  const sort = params.get("sort")
  const date = (key: string) => {
    const raw = params.get(key)
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? (parseShortcutDateInput(raw, new Date()) ?? undefined)
      : undefined
  }
  const amount = (key: string) => {
    const raw = params.get(key)
    const number = raw?.trim() ? Number(raw) : NaN
    return Number.isFinite(number) && number >= 0 ? number : undefined
  }
  return {
    ...defaultFilters,
    search: (params.get("q") ?? "").slice(0, 500),
    sortBy: sort === "amount" || sort === "merchant" ? sort : "date",
    sortOrder: params.get("order") === "asc" ? "asc" : "desc",
    account_types: [...new Set(params.getAll("account").filter(Boolean))],
    categories: [...new Set(params.getAll("category").filter(Boolean))],
    dateStart: date("from"),
    dateEnd: date("to"),
    amountMin: amount("min"),
    amountMax: amount("max"),
  }
}

export function serializeFilters(filters: TransactionFilters, existing = "") {
  const params = new URLSearchParams(existing)
  keys.forEach((key) => params.delete(key))
  if (filters.search) params.set("q", filters.search)
  if (filters.sortBy !== "date") params.set("sort", filters.sortBy)
  if (filters.sortOrder !== "desc") params.set("order", filters.sortOrder)
  filters.account_types.forEach((value) => params.append("account", value))
  filters.categories.forEach((value) => params.append("category", value))
  if (filters.dateStart)
    params.set("from", toLocalDateString(filters.dateStart))
  if (filters.dateEnd) params.set("to", toLocalDateString(filters.dateEnd))
  if (filters.amountMin !== undefined)
    params.set("min", String(filters.amountMin))
  if (filters.amountMax !== undefined)
    params.set("max", String(filters.amountMax))
  return params.toString()
}

export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilters
) {
  const search = filters.search.toLowerCase()
  const start = filters.dateStart && toLocalDateString(filters.dateStart)
  const end = filters.dateEnd && toLocalDateString(filters.dateEnd)
  return transactions
    .filter((t) => {
      if (
        search &&
        ![t.merchant, t.category, t.notes ?? ""].some((value) =>
          value.toLowerCase().includes(search)
        )
      )
        return false
      if (
        filters.account_types.length &&
        !filters.account_types.includes(t.account_type_id ?? "__unassigned__")
      )
        return false
      if (
        filters.categories.length &&
        !filters.categories.includes(t.category) &&
        !filters.categories.includes(categoryNameToValue(t.category))
      )
        return false
      if (filters.amountMin !== undefined && t.amount < filters.amountMin)
        return false
      if (filters.amountMax !== undefined && t.amount > filters.amountMax)
        return false
      if (start && toLocalDateString(t.date) < start) return false
      if (end && toLocalDateString(t.date) > end) return false
      return true
    })
    .sort((a, b) => {
      const comparison =
        filters.sortBy === "date"
          ? a.date.getTime() - b.date.getTime()
          : filters.sortBy === "amount"
            ? a.amount - b.amount
            : a.merchant.localeCompare(b.merchant)
      return comparison
        ? comparison * (filters.sortOrder === "asc" ? 1 : -1)
        : (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0)
    })
}
