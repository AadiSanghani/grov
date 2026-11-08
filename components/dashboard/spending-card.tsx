"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts"

import { DashboardCard } from "@/components/dashboard-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SpendingRangeKey, SpendingSeriesResult } from "@/lib/spending"

const SPENDING_RANGE_OPTIONS: {
  value: SpendingRangeKey
  label: string
}[] = [
  {
    value: "this_month_vs_last_month",
    label: "vs. last month",
  },
  {
    value: "this_month_vs_last_year",
    label: "vs. same month last year",
  },
  {
    value: "this_month_vs_last_3_months",
    label: "vs. 3-month average",
  },
]

interface SpendingCardProps {
  rangeKey: SpendingRangeKey
  data: SpendingSeriesResult
  loading?: boolean
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function SpendingCard({ rangeKey, data, loading }: SpendingCardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const handleRangeChange = (value: SpendingRangeKey) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("spendingRange", value)

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const isLoading = loading || isPending
  const comparisonLabel = data.comparison?.label ?? "Last month"
  const throughDay = data.comparison?.points.length ?? data.current.points.length
  const currentComparedTotal = data.current.points[throughDay - 1]?.amount ?? 0
  const comparisonTotal = data.comparison?.total ?? 0
  const difference = Math.round((currentComparedTotal - comparisonTotal) * 100) / 100
  const percentage = comparisonTotal > 0
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(difference) / comparisonTotal * 100)
    : null
  const chartData = data.current.points.map((point, index) => ({
    day: index + 1,
    current: point.amount,
    comparison: data.comparison?.points[index]?.amount ?? null,
  }))
  const hasSpending = data.current.total !== 0 || comparisonTotal !== 0

  return (
    <DashboardCard
      title="Spending pace"
      className="min-w-0"
      aria-busy={isLoading}
      actions={
        <Select
          value={rangeKey}
          disabled={isLoading}
          onValueChange={(value) =>
            handleRangeChange(value as SpendingRangeKey)
          }
        >
          <SelectTrigger
            aria-label="Select spending time range"
            className="h-9 w-[220px] px-3 text-sm"
          >
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            {SPENDING_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="mb-4 space-y-1" aria-live="polite">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {isLoading ? "—" : formatCurrency(data.current.total)}
        </p>
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Loading spending data…" : `Spent this month${data.current.points.length ? ` through ${data.current.points.at(-1)?.label}` : ""}`}
        </p>
        {!isLoading && hasSpending && data.comparison ? (
          <p className="pt-1 text-sm">
            {difference === 0
              ? `Same spending as ${comparisonLabel}`
              : `${formatCurrency(Math.abs(difference))} ${difference > 0 ? "more" : "less"}${percentage ? ` (${percentage}%)` : ""} than ${comparisonLabel}`}
            <span className="text-muted-foreground"> · first {throughDay} {throughDay === 1 ? "day" : "days"}</span>
          </p>
        ) : null}
        {!isLoading && data.current.points.length > throughDay ? (
          <p className="text-xs text-muted-foreground">
            Comparison stops at day {throughDay} to match shorter months. Your monthly total includes all {data.current.points.length} days.
          </p>
        ) : null}
      </div>
      <div className="h-[240px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading spending data…
          </div>
        ) : !hasSpending ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No spending data yet. Add some transactions to see your spending
            pace and category changes.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(value) => `Day ${value}`} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} minTickGap={24} />
              <YAxis
                domain={[0, "auto"]}
                tickFormatter={(value) =>
                  `$${Number(value).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}`
                }
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                width={64}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelFormatter={(day) => `Day ${day} · total spent`}
                contentStyle={{ backgroundColor: "var(--popover)", borderColor: "var(--border)", borderRadius: 8 }}
                labelStyle={{ color: "var(--foreground)" }}
              />
              {data.comparison && <Legend />}
              <Line
                type="linear"
                dataKey="current"
                name={data.current.label || "This month"}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={chartData.length === 1}
                isAnimationActive={false}
              />
              {data.comparison && (
                <Line
                  type="linear"
                  dataKey="comparison"
                  name={comparisonLabel}
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={throughDay === 1}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </DashboardCard>
  )
}

export function SpendingChangesCard({ data, loading }: Pick<SpendingCardProps, "data" | "loading">) {
  const comparisonLabel = data.comparison?.label ?? "Last month"
  const throughDay = data.comparison?.points.length ?? data.current.points.length
  const hasSpending = data.current.total !== 0 || (data.comparison?.total ?? 0) !== 0
  const maxCategoryChange = Math.max(...data.categoryChanges.map((category) => Math.abs(category.difference)), 1)
  const periodStart = data.current.points[0]?.date ?? ""
  const periodEnd = data.current.points[throughDay - 1]?.date ?? ""

  return (
    <DashboardCard
      title={<h2>What changed?</h2>}
      className="min-w-0"
      aria-label="Spending category changes"
      aria-busy={loading}
      description={loading ? "Comparing categories…" : `Largest changes vs. ${comparisonLabel} · first ${throughDay} ${throughDay === 1 ? "day" : "days"}`}
    >
        {loading ? (
          <p className="py-6 text-xs text-muted-foreground">Loading category changes…</p>
        ) : data.categoryChanges.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {hasSpending ? "No category spending changes for this period." : "Category changes will appear when you have spending to compare."}
          </p>
        ) : (
          <>
            <div className="space-y-1">
              {data.categoryChanges.map((category) => {
                const params = new URLSearchParams({ category: category.category, from: periodStart, to: periodEnd })
                const increased = category.difference > 0
                const barWidth = Math.abs(category.difference) / maxCategoryChange * 50
                return (
                  <Link
                    key={category.category}
                    href={`/transactions?${params.toString()}`}
                    prefetch={false}
                    aria-label={`${category.label}: ${formatCurrency(Math.abs(category.difference))} ${increased ? "more" : "less"}. View current-period transactions.`}
                    className="block rounded-md px-2 py-2.5 -mx-2 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words font-medium">{category.label}</span>
                      <span className="shrink-0 tabular-nums">{increased ? "+" : "−"}{formatCurrency(Math.abs(category.difference))}</span>
                    </div>
                    <div className="relative mt-2 h-2 rounded-full bg-muted" aria-hidden="true">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/50" />
                      <span
                        className={`absolute inset-y-0 rounded-full ${increased ? "bg-chart-1" : "bg-chart-2"}`}
                        style={{ left: `${increased ? 50 : 50 - barWidth}%`, width: `${barWidth}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(category.current)} vs. {formatCurrency(category.comparison)}
                    </p>
                  </Link>
                )
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground" aria-hidden="true">
              <span>← Less spending</span><span>More spending →</span>
            </div>
          </>
        )}
    </DashboardCard>
  )
}
