"use client"

import { useMemo, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { DashboardCard } from "@/components/dashboard-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  NetWorthRangeKey,
  NetWorthSeriesResult,
} from "@/components/dashboard/net-worth-section"

const NET_WORTH_OPTIONS: { value: NetWorthRangeKey; label: string }[] = [
  { value: "one_month", label: "1 Month" },
  { value: "three_months", label: "3 Months" },
  { value: "six_months", label: "6 Months" },
  { value: "ytd", label: "YTD" },
  { value: "all_time", label: "All Time" },
]

interface NetWorthCardProps {
  rangeKey: NetWorthRangeKey
  data: NetWorthSeriesResult
  loading?: boolean
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function NetWorthCard({ rangeKey, data, loading }: NetWorthCardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const handleRangeChange = (value: NetWorthRangeKey) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("netWorthRange", value)

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const chartData = useMemo(
    () =>
      data.points.map((point) => ({
        name: point.label,
        value: point.netWorth,
      })),
    [data.points],
  )
  const yDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 0]

    const values = chartData.map((point) => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min
    const padding = span === 0 ? Math.max(Math.abs(max) * 0.05, 100) : Math.max(span * 0.12, 100)

    return [min - padding, max + padding]
  }, [chartData])

  const isLoading = loading || isPending
  const chartColor =
    chartData.length > 0 && chartData[chartData.length - 1].value < 0
      ? "var(--destructive)"
      : "var(--accent)"

  return (
    <DashboardCard
      title="Net Worth"
      actions={
        <Select
          value={rangeKey}
          onValueChange={(value) => handleRangeChange(value as NetWorthRangeKey)}
        >
          <SelectTrigger
            aria-label="Select net worth range"
            className="h-9 w-[180px] px-3 text-sm"
          >
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            {NET_WORTH_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="h-[300px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading net worth data…
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No net worth data yet. Add accounts and transactions to see your
            trend.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis
                domain={yDomain}
                tickFormatter={(value) =>
                  `$${Number(value).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}`
                }
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Net Worth"
                stroke={chartColor}
                fill={chartColor}
                fillOpacity={0.2}
                strokeWidth={2}
                dot={{
                  r: 3,
                  stroke: chartColor,
                  strokeWidth: 2,
                  fill: "var(--background)",
                }}
                activeDot={{
                  r: 5,
                  stroke: chartColor,
                  strokeWidth: 2,
                  fill: "var(--background)",
                }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </DashboardCard>
  )
}
