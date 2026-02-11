"use client"

import { useMemo, useTransition } from "react"
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
    label: "This Month Vs. Last Month",
  },
  {
    value: "this_month_vs_last_year",
    label: "This Month Vs. Last Year",
  },
  {
    value: "this_month_vs_last_3_months",
    label: "This Month Vs. Last 3 Months",
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
    maximumFractionDigits: 0,
  }).format(amount)
}

function getPercentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
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

  const {
    chartData,
    comparisonLabel,
    lastMonthTotal,
    sameMonthLastYearLabel,
    sameMonthLastYearTotal,
  } = useMemo(() => {
    const currentPoints = data.current.points
    const comparisonPoints = data.comparison?.points ?? []

    const byDate = new Map<
      string,
      { name: string; current?: number; comparison?: number }
    >()

    for (const p of currentPoints) {
      const existing = byDate.get(p.date) ?? {
        name: p.label,
      }
      existing.current = p.amount
      byDate.set(p.date, existing)
    }

    for (const p of comparisonPoints) {
      const existing = byDate.get(p.date) ?? {
        name: p.label,
      }
      existing.comparison = p.amount
      byDate.set(p.date, existing)
    }

    const merged = Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, value]) => ({
        name: value.name,
        current: value.current ?? 0,
        comparison: value.comparison ?? 0,
      }))

    return {
      chartData: merged,
      comparisonLabel: data.comparison?.label ?? "Last month",
      lastMonthTotal: data.comparison?.total ?? 0,
      sameMonthLastYearLabel: data.sameMonthLastYear?.label,
      sameMonthLastYearTotal: data.sameMonthLastYear?.total ?? 0,
    }
  }, [data])

  const headline = formatCurrency(data.current.total)
  const pctVsLastMonth = getPercentageChange(
    data.current.total,
    lastMonthTotal,
  )
  const pctVsSameMonthLastYear =
    sameMonthLastYearTotal != null
      ? getPercentageChange(data.current.total, sameMonthLastYearTotal)
      : null

  const isLoading = loading || isPending

  return (
    <DashboardCard
      title="Spending"
      actions={
        <Select
          value={rangeKey}
          onValueChange={(value) =>
            handleRangeChange(value as SpendingRangeKey)
          }
        >
          <SelectTrigger
            aria-label="Select spending time range"
            className="h-9 w-[260px] px-3 text-sm"
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
      <div className="h-[260px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center rounded-lg border bg-muted/40">
            <p className="text-sm text-muted-foreground">
              Loading spending data...
            </p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border bg-muted/40">
            <p className="text-sm text-muted-foreground">
              No spending data yet. Add some transactions to see your spending
              over time.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 16, right: 24, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(value) =>
                  `$${Number(value).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}`
                }
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === "current" ? "This month" : comparisonLabel,
                ]}
                labelStyle={{ color: "var(--foreground)" }}
              />
              {data.comparison && <Legend />}
              <Line
                type="monotone"
                dataKey="current"
                name="This month"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {data.comparison && (
                <Line
                  type="monotone"
                  dataKey="comparison"
                  name={comparisonLabel}
                  stroke="#9ca3af"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
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

