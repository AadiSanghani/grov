"use client"

import { useEffect, useState, useMemo } from "react"
import { format } from "date-fns"
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useReportsContext } from "../context"
import { getTransactionsInRange } from "@/lib/transactions"
import { getCategories } from "@/lib/categories"
import { Transaction } from "@/lib/types"
import { Category } from "@/lib/categories"
import { findCategoryByValue, getSpendingAmount } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

const SPENDING_COLORS = [
  "#22577A",
  "#38A3A5",
  "#57CC99",
  "#80ED99",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
]

const RECENT_TRANSACTIONS_LIMIT = 20

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

interface CategorySpend {
  name: string
  value: string
  amount: number
  emoji: string
  color: string
  percentage: number
}

interface GroupedByDate {
  [date: string]: {
    transactions: Transaction[]
    total: number
  }
}

function SpendingTransactionList({
  transactions,
  categories,
}: {
  transactions: Transaction[]
  categories: Category[]
}) {
  const grouped: GroupedByDate = useMemo(() => {
    return transactions.reduce((acc, transaction) => {
      const dateKey = format(transaction.date, "MMMM dd, yyyy")
      if (!acc[dateKey]) {
        acc[dateKey] = { transactions: [], total: 0 }
      }
      acc[dateKey].transactions.push(transaction)
      acc[dateKey].total +=
        transaction.transaction_type === "incoming"
          ? transaction.amount
          : -getSpendingAmount(transaction)
      return acc
    }, {} as GroupedByDate)
  }, [transactions])

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-lg mb-2">No transactions found</p>
        <p className="text-sm text-muted-foreground">
          Change the date range or select a different category.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, { transactions: txs, total }]) => (
        <div key={date}>
          <div className="flex items-center justify-between px-4 py-2 bg-muted/50 rounded-lg mb-2">
            <h3 className="font-semibold text-sm">{date}</h3>
            <span
              className={cn(
                "font-semibold text-sm",
                total >= 0 ? "text-primary" : "text-foreground"
              )}
            >
              {total >= 0 ? "+" : ""}
              {formatCurrency(Math.abs(total))}
            </span>
          </div>
          <div className="space-y-1">
            {txs.map((transaction) => {
              const categoryInfo = findCategoryByValue(
                categories,
                transaction.category
              )
              return (
                <div
                  key={transaction.id}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="min-w-[180px]">
                      <p className="font-medium truncate">{transaction.merchant}</p>
                    </div>
                    {categoryInfo && (
                      <div className="flex items-center gap-2 min-w-[150px]">
                        <span className="text-sm">{categoryInfo.emoji}</span>
                        <span className="text-sm text-muted-foreground">
                          {categoryInfo.label}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "font-semibold",
                      transaction.transaction_type === "incoming"
                        ? "text-primary"
                        : "text-foreground"
                    )}
                  >
                    {transaction.transaction_type === "incoming" ? "+" : ""}
                    {formatCurrency(
                      transaction.transaction_type === "outgoing"
                        ? getSpendingAmount(transaction)
                        : transaction.amount
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SpendingPage() {
  const { startDate, endDate } = useReportsContext()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [txData, catData] = await Promise.all([
          getTransactionsInRange(startDate, endDate),
          getCategories(),
        ])
        setTransactions(txData ?? [])
        setCategories((catData ?? []) as Category[])
      } catch (err) {
        console.error("Failed to fetch data:", err)
        setTransactions([])
        setCategories([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [startDate, endDate])

  const outgoingTransactions = useMemo(
    () =>
      transactions.filter((t) => t.transaction_type === "outgoing"),
    [transactions]
  )

  const categorySpendData = useMemo(() => {
    const byCategory: Record<
      string,
      { amount: number; emoji: string; label: string }
    > = {}
    outgoingTransactions.forEach((t) => {
      const info = findCategoryByValue(categories, t.category)
      const key = t.category
      if (!byCategory[key]) {
        byCategory[key] = {
          amount: 0,
          emoji: info?.emoji ?? "📦",
          label: info?.label ?? t.category,
        }
      }
      byCategory[key].amount += getSpendingAmount(t)
    })
    const total = Object.values(byCategory).reduce((s, x) => s + x.amount, 0)
    return Object.entries(byCategory)
      .map(([value, { amount, emoji, label }], i) => ({
        name: label,
        value,
        amount,
        emoji,
        color: SPENDING_COLORS[i % SPENDING_COLORS.length],
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount) as CategorySpend[]
  }, [outgoingTransactions, categories])

  const summary = useMemo(() => {
    const totalSpending = outgoingTransactions.reduce(
      (s, t) => s + getSpendingAmount(t),
      0
    )
    const categoryCount = categorySpendData.length
    const top = categorySpendData[0]
    return {
      totalSpending,
      categoryCount,
      topCategory: top
        ? { name: top.name, emoji: top.emoji, amount: top.amount }
        : null,
    }
  }, [outgoingTransactions, categorySpendData])

  const displayedTransactions = useMemo(() => {
    if (selectedCategory) {
      return outgoingTransactions.filter(
        (t) => t.category === selectedCategory
      )
    }
    return outgoingTransactions.slice(0, RECENT_TRANSACTIONS_LIMIT)
  }, [outgoingTransactions, selectedCategory])

  const selectedCategoryInfo = useMemo(() => {
    if (!selectedCategory) return null
    const info = findCategoryByValue(categories, selectedCategory)
    const data = categorySpendData.find((d) => d.value === selectedCategory)
    return info && data
      ? { emoji: info.emoji, label: info.label }
      : { emoji: "📦", label: selectedCategory }
  }, [selectedCategory, categories, categorySpendData])

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">
              {formatCurrency(summary.totalSpending)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">
              {summary.categoryCount}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.topCategory ? (
              <span className="text-2xl font-semibold flex items-center gap-2">
                <span>{summary.topCategory.emoji}</span>
                {summary.topCategory.name}
                <span className="text-base font-normal text-muted-foreground">
                  ({formatCurrency(summary.topCategory.amount)})
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pie chart + category breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Spending by Category</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Click a slice to see transactions
              </p>
            </div>
            {selectedCategory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategory(null)}
                className="shrink-0"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {categorySpendData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">No spending in this period</p>
              </div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySpendData as unknown as Record<string, unknown>[]}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={selectedCategory ? 95 : 80}
                      paddingAngle={2}
                      onClick={(data: unknown) => {
                        const sector = data as { value?: number; payload?: CategorySpend }
                        const categoryValue = sector.payload?.value
                        if (categoryValue == null) return
                        setSelectedCategory(
                          selectedCategory === categoryValue ? null : categoryValue
                        )
                      }}
                    >
                      {categorySpendData.map((entry, index) => (
                        <Cell
                          key={entry.value}
                          fill={entry.color}
                          stroke={
                            selectedCategory === entry.value
                              ? "var(--foreground)"
                              : "transparent"
                          }
                          strokeWidth={
                            selectedCategory === entry.value ? 2 : 0
                          }
                          style={{ cursor: "pointer" }}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number, _name: string, props: unknown) => {
                        const p = (props as { payload: CategorySpend }).payload
                        return [formatCurrency(value), `${p.emoji} ${p.name}`]
                      }}
                      content={({ active, payload }: { active?: boolean; payload?: readonly { payload: CategorySpend }[] }) => {
                        if (!active || !payload?.length) return null
                        const p = payload[0].payload
                        return (
                          <div className="rounded-lg border bg-card px-3 py-2 shadow-md">
                            <div className="flex items-center gap-2 font-medium">
                              <span>{p.emoji}</span>
                              {p.name}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {formatCurrency(p.amount)} (
                              {p.percentage.toFixed(1)}%)
                            </div>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click a row to filter transactions below
            </p>
          </CardHeader>
          <CardContent>
            {categorySpendData.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">
                No spending in this period
              </p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {categorySpendData.map((item) => {
                  const total = summary.totalSpending
                  const pct = total > 0 ? (item.amount / total) * 100 : 0
                  const isSelected = selectedCategory === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        setSelectedCategory(
                          isSelected ? null : item.value
                        )
                      }
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 ring-1 ring-primary/20"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm shrink-0">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">
                          {formatCurrency(item.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.name}
                        </p>
                        <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transaction list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>
              {selectedCategoryInfo
                ? `${selectedCategoryInfo.emoji} ${selectedCategoryInfo.label} Transactions`
                : "Recent Transactions"}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedCategory
                ? `In selected date range`
                : `Latest ${RECENT_TRANSACTIONS_LIMIT} outgoing transactions`}
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
            {displayedTransactions.length}
          </span>
        </CardHeader>
        <CardContent>
          <SpendingTransactionList
            transactions={displayedTransactions}
            categories={categories}
          />
        </CardContent>
      </Card>
    </div>
  )
}
