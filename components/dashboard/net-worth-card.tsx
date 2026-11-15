"use client"

import { useMemo, useTransition } from "react"
import Link from "next/link"
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
import { Button } from "@/components/ui/button"
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
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
  const latestPoint = data.points.at(-1)
  const firstPoint = data.points[0]
  const change = latestPoint && firstPoint ? latestPoint.netWorth - firstPoint.netWorth : 0
  const chartColor =
    chartData.length > 0 && chartData[chartData.length - 1].value < 0
      ? "var(--destructive)"
      : "var(--chart-1)"

  return (
    <DashboardCard
      title={<h2>Net worth</h2>}
      className="min-w-0"
      aria-busy={isLoading}
      actions={
        <Select
          value={rangeKey}
          disabled={isLoading}
          onValueChange={(value) => handleRangeChange(value as NetWorthRangeKey)}
        >
          <SelectTrigger
            aria-label="Select net worth range"
            className="h-9 w-36 px-3 text-sm"
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
      <div className="mb-6 space-y-2" aria-live="polite">
        <p className="text-4xl font-medium tracking-tight tabular-nums">
          {isLoading || !latestPoint ? "—" : formatCurrency(latestPoint.netWorth)}
        </p>
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Loading balance history…" : latestPoint ? `Latest recorded balance · ${latestPoint.label}` : "Your account balances, together"}
        </p>
        {!isLoading && data.points.length > 1 && (
          <p className="text-sm text-muted-foreground">
            <span className={change < 0 ? "text-negative" : change > 0 ? "text-positive" : "text-foreground"}>
              {change > 0 ? "+" : ""}{formatCurrency(change)}
            </span>{" "}since {firstPoint.label}
          </p>
        )}
      </div>
      <div className="h-64">
        {isLoading ? (
          <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading net worth data…
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div>
              <p className="text-sm font-medium">See the bigger picture</p>
              <p className="mt-2 max-w-64 text-sm leading-6 text-muted-foreground">Add an account to start tracking your net worth over time</p>
            </div>
            <Button asChild variant="outline"><Link href="/accounts">Add an account</Link></Button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} minTickGap={32} tickMargin={12} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <YAxis
                domain={yDomain}
                tickFormatter={(value) =>
                  new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(Number(value))
                }
                width={64}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ backgroundColor: "var(--popover)", borderColor: "var(--border)", borderRadius: 8 }}
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Net Worth"
                stroke={chartColor}
                fill={chartColor}
                fillOpacity={0.08}
                strokeWidth={2}
                dot={chartData.length === 1 ? { r: 3, fill: chartColor } : false}
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
