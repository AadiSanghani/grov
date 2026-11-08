'use server'

import { startOfMonth, endOfMonth, subMonths, format, parseISO, isValid, eachDayOfInterval } from "date-fns"

import { getCategories } from "@/lib/categories"
import { getTransactionsInRange } from "@/lib/transactions"
import { categoryNameToValue, getSpendingAmount, toLocalDateString } from "@/lib/utils"

export type SpendingRangeKey =
  | "this_month_vs_last_month"
  | "this_month_vs_last_year"
  | "this_month_vs_last_3_months"

export interface SpendingPoint {
  label: string
  date: string
  amount: number
}

export interface SpendingCategoryChange {
  category: string
  label: string
  current: number
  comparison: number
  difference: number
}

export interface SpendingSeriesResult {
  rangeKey: SpendingRangeKey
  categoryChanges: SpendingCategoryChange[]
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
}

interface DateRange {
  start: string
  end: string
}

function getMonthDateRange(anchor: Date, throughDay: number): DateRange {
  const start = startOfMonth(anchor)
  const end = new Date(anchor.getFullYear(), anchor.getMonth(), throughDay)
  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  }
}

async function getMonthlySpending(range: DateRange, categoryThroughDay: number): Promise<{
  total: number
  points: SpendingPoint[]
  categories: Map<string, number>
}> {
  const transactions = await getTransactionsInRange(range.start, range.end)
  const byDate = new Map<string, number>()
  const categories = new Map<string, number>()

  for (const transaction of transactions ?? []) {
    if (transaction.transaction_type !== "outgoing") continue
    const dateKey = toLocalDateString(transaction.date)
    if (dateKey < range.start || dateKey > range.end) continue
    const amount = getSpendingAmount(transaction)
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + amount)
    if (parseISO(dateKey).getDate() <= categoryThroughDay) {
      const category = transaction.category || "uncategorized"
      categories.set(category, (categories.get(category) ?? 0) + amount)
    }
  }

  let total = 0
  const points = eachDayOfInterval({ start: parseISO(range.start), end: parseISO(range.end) })
    .map((day) => {
      const date = toLocalDateString(day)
      total += byDate.get(date) ?? 0
      return { date, label: format(day, "MMM d"), amount: total }
    })

  return { total, points, categories }
}

export async function getSpendingSeries(
  rangeKey: SpendingRangeKey,
  localDate: string,
): Promise<SpendingSeriesResult> {
  const today = parseISO(localDate)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(localDate) ||
    !isValid(today) ||
    format(today, "yyyy-MM-dd") !== localDate
  ) {
    throw new Error("Invalid local date")
  }
  if (![
    "this_month_vs_last_month",
    "this_month_vs_last_year",
    "this_month_vs_last_3_months",
  ].includes(rangeKey)) {
    return getSpendingSeries("this_month_vs_last_month", localDate)
  }

  const comparisonMonths = rangeKey === "this_month_vs_last_year"
    ? [subMonths(today, 12)]
    : rangeKey === "this_month_vs_last_3_months"
      ? [1, 2, 3].map((months) => subMonths(today, months))
      : [subMonths(today, 1)]
  const throughDay = Math.min(today.getDate(), ...comparisonMonths.map((month) => endOfMonth(month).getDate()))
  const [current, previousMonths, categories] = await Promise.all([
    getMonthlySpending(getMonthDateRange(today, today.getDate()), throughDay),
    Promise.all(comparisonMonths.map((month) => getMonthlySpending(getMonthDateRange(month, throughDay), throughDay))),
    getCategories(),
  ])

  const comparisonPoints = previousMonths[0].points.map((point, index) => ({
    ...point,
    amount: previousMonths.reduce((sum, month) => sum + month.points[index].amount, 0) / previousMonths.length,
  }))
  const comparisonCategories = new Map<string, number>()
  for (const month of previousMonths) {
    for (const [category, amount] of month.categories) {
      comparisonCategories.set(category, (comparisonCategories.get(category) ?? 0) + amount / previousMonths.length)
    }
  }
  const labels = new Map(categories.map((category) => [categoryNameToValue(category.name), category.name]))
  const categoryChanges = [...new Set([...current.categories.keys(), ...comparisonCategories.keys()])]
    .map((category) => {
      const currentAmount = current.categories.get(category) ?? 0
      const comparisonAmount = comparisonCategories.get(category) ?? 0
      return {
        category,
        label: labels.get(category) ?? (category === "uncategorized" ? "Uncategorized" : category),
        current: currentAmount,
        comparison: comparisonAmount,
        difference: Math.round((currentAmount - comparisonAmount) * 100) / 100,
      }
    })
    .filter((category) => category.difference !== 0)
    .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference) || left.label.localeCompare(right.label))
    .slice(0, 5)

  return {
    rangeKey,
    current: { label: format(today, "MMMM yyyy"), total: current.total, points: current.points },
    comparison: {
      label: previousMonths.length === 1 ? format(comparisonMonths[0], "MMMM yyyy") : "3-month average",
      total: comparisonPoints.at(-1)?.amount ?? 0,
      points: comparisonPoints,
    },
    categoryChanges,
  }
}
