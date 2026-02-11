'use server'

import { startOfMonth, endOfMonth, subMonths, format } from "date-fns"

import { getTransactionsInRange } from "@/lib/transactions"
import { getSpendingAmount, toLocalDateString } from "@/lib/utils"
import type { Transaction } from "@/lib/types"

export type SpendingRangeKey =
  | "this_month_vs_last_month"
  | "this_month_vs_last_year"
  | "this_month_vs_last_3_months"

export interface SpendingPoint {
  /** Label for the x-axis (e.g. 'Jan 5') */
  label: string
  /** ISO date string for the bucket */
  date: string
  /** Total spending in this bucket */
  amount: number
}

export interface SpendingSeriesResult {
  rangeKey: SpendingRangeKey
  current: {
    label: string
    total: number
    points: SpendingPoint[]
  }
  comparison?: {
    label: string
    total: number
    points: SpendingPoint[]
  }
  /** Optional same-month-last-year comparison summary for the current range */
  sameMonthLastYear?: {
    label: string
    total: number
  }
}

interface DateRange {
  start: string
  end: string
}

function getMonthDateRange(anchor: Date): DateRange {
  const start = startOfMonth(anchor)
  const end = endOfMonth(anchor)
  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  }
}

async function getMonthlySpending(range: DateRange): Promise<{
  total: number
  points: SpendingPoint[]
}> {
  const transactions = await getTransactionsInRange(range.start, range.end)

  const outgoing = transactions.filter(
    (t: Transaction) => t.transaction_type === "outgoing",
  )

  const byDate = new Map<string, number>()

  for (const t of outgoing) {
    const dateKey = toLocalDateString(t.date)
    const current = byDate.get(dateKey) ?? 0
    byDate.set(dateKey, current + getSpendingAmount(t))
  }

  const sortedKeys = Array.from(byDate.keys()).sort()

  const points: SpendingPoint[] = sortedKeys.map((date) => ({
    date,
    label: format(new Date(date), "MMM d"),
    amount: byDate.get(date) ?? 0,
  }))

  const total = points.reduce((sum, p) => sum + p.amount, 0)

  return { total, points }
}

export async function getSpendingSeries(
  rangeKey: SpendingRangeKey,
): Promise<SpendingSeriesResult> {
  const today = new Date()
  const thisMonthRange = getMonthDateRange(today)
  const lastMonthAnchor = subMonths(today, 1)
  const lastMonthRange = getMonthDateRange(lastMonthAnchor)
  const sameMonthLastYearAnchor = subMonths(today, 12)
  const sameMonthLastYearRange = getMonthDateRange(sameMonthLastYearAnchor)

  if (rangeKey === "this_month_vs_last_month") {
    const [currentMonth, lastMonth] = await Promise.all([
      getMonthlySpending(thisMonthRange),
      getMonthlySpending(lastMonthRange),
    ])

    return {
      rangeKey,
      current: {
        label: format(today, "MMMM yyyy"),
        total: currentMonth.total,
        points: currentMonth.points,
      },
      comparison: {
        label: format(lastMonthAnchor, "MMMM yyyy"),
        total: lastMonth.total,
        points: lastMonth.points,
      },
    }
  }

  if (rangeKey === "this_month_vs_last_year") {
    const [currentMonth, sameMonthLastYear] = await Promise.all([
      getMonthlySpending(thisMonthRange),
      getMonthlySpending(sameMonthLastYearRange),
    ])

    return {
      rangeKey,
      current: {
        label: format(today, "MMMM yyyy"),
        total: currentMonth.total,
        points: currentMonth.points,
      },
      comparison: {
        label: format(sameMonthLastYearAnchor, "MMMM yyyy"),
        total: sameMonthLastYear.total,
        points: sameMonthLastYear.points,
      },
    }
  }

  if (rangeKey === "this_month_vs_last_3_months") {
    const threeMonthsAgoAnchor = subMonths(today, 3)
    const lastThreeMonthsRange: DateRange = {
      start: getMonthDateRange(threeMonthsAgoAnchor).start,
      end: getMonthDateRange(lastMonthAnchor).end,
    }

    const [currentMonth, lastThreeMonths] = await Promise.all([
      getMonthlySpending(thisMonthRange),
      getMonthlySpending(lastThreeMonthsRange),
    ])

    return {
      rangeKey,
      current: {
        label: format(today, "MMMM yyyy"),
        total: currentMonth.total,
        points: currentMonth.points,
      },
      comparison: {
        label: `Last 3 months`,
        total: lastThreeMonths.total,
        points: lastThreeMonths.points,
      },
    }
  }

  return getSpendingSeries("this_month_vs_last_month")
}

