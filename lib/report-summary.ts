import { differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, format, parseISO, subDays } from "date-fns"
import type { AccountMap } from "@/components/mermaid-sankey"
import type { Transaction } from "@/lib/types"
import { getSpendingAmount, isIncomeForReporting, toLocalDateString } from "@/lib/utils"

export const reportCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function toReportAccountMap(accounts: readonly {
  id?: string | number | null
  account_name: string
  category?: "asset" | "liability" | null
  account_type?: string | null
  account_subtype?: string | null
}[]): AccountMap {
  const map: AccountMap = {}
  for (const account of accounts) {
    if (account.id == null) continue
    map[String(account.id)] = {
      name: account.account_name,
      category: account.category ?? "asset",
      accountType: account.account_type ?? "Cash",
      accountSubtype: account.account_subtype ?? "",
    }
  }
  return map
}

export function isReportIncome(transaction: Transaction, accountsMap: AccountMap): boolean {
  if (!isIncomeForReporting(transaction)) return false
  const account = transaction.account_type_id != null ? accountsMap[transaction.account_type_id] : undefined
  return account?.accountType !== "Investments"
}

export function summarizeReport(transactions: Transaction[], accountsMap: AccountMap) {
  let income = 0
  let spending = 0
  let investmentInflows = 0

  for (const transaction of transactions) {
    if (isIncomeForReporting(transaction)) {
      const account = transaction.account_type_id != null ? accountsMap[transaction.account_type_id] : undefined
      if (account?.accountType === "Investments") investmentInflows += Number(transaction.amount) || 0
      else income += Number(transaction.amount) || 0
    } else if (transaction.transaction_type === "outgoing") {
      spending += getSpendingAmount(transaction)
    }
  }

  const remaining = income - spending
  return { income, spending, remaining, savingsRate: income > 0 ? (remaining / income) * 100 : null, investmentInflows }
}

export function reportTrend(transactions: Transaction[], accountsMap: AccountMap, startDate: string, endDate: string) {
  const monthly = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) > 90
  const buckets = new Map<string, { date: string; income: number; spending: number }>()
  const dates = monthly
    ? eachMonthOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
    : eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
  for (const date of dates) {
    const key = format(date, monthly ? "yyyy-MM-01" : "yyyy-MM-dd")
    buckets.set(key, { date: key, income: 0, spending: 0 })
  }
  for (const transaction of transactions) {
    if (!isReportIncome(transaction, accountsMap) && transaction.transaction_type !== "outgoing") continue
    const transactionDate = toLocalDateString(transaction.date)
    const date = monthly ? `${transactionDate.slice(0, 7)}-01` : transactionDate
    const bucket = buckets.get(date)
    if (!bucket) continue
    if (isReportIncome(transaction, accountsMap)) bucket.income += Number(transaction.amount) || 0
    else if (transaction.transaction_type === "outgoing") bucket.spending += getSpendingAmount(transaction)
  }
  return [...buckets.values()].sort((left, right) => left.date.localeCompare(right.date))
}

export function previousReportRange(startDate: string, endDate: string, today = new Date()) {
  const currentEnd = endDate < format(today, "yyyy-MM-dd") ? endDate : format(today, "yyyy-MM-dd")
  if (startDate > currentEnd) return null
  const days = differenceInCalendarDays(parseISO(currentEnd), parseISO(startDate)) + 1
  const previousEnd = subDays(parseISO(startDate), 1)
  return { startDate: format(subDays(previousEnd, days - 1), "yyyy-MM-dd"), endDate: format(previousEnd, "yyyy-MM-dd") }
}
