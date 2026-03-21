"use client"

import { format } from 'date-fns'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BenchmarkSeriesPoint, InvestmentTimeRange, PortfolioSeriesPoint } from '@/lib/investments/types'

const RANGE_OPTIONS: Array<{ label: string; value: InvestmentTimeRange }> = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '1Y', value: '1Y' },
  { label: 'All', value: 'ALL' },
]

interface InvestmentsPerformanceChartProps {
  portfolioSeries: PortfolioSeriesPoint[]
  benchmarkSeries: BenchmarkSeriesPoint[]
  range: InvestmentTimeRange
  onRangeChange: (range: InvestmentTimeRange) => void
}

function formatDateLabel(value: string): string {
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return format(parsed, 'MMM d')
}

export function InvestmentsPerformanceChart({
  portfolioSeries,
  benchmarkSeries,
  range,
  onRangeChange,
}: InvestmentsPerformanceChartProps) {
  const benchmarkByDate = new Map(benchmarkSeries.map((row) => [row.date, row]))

  const data = portfolioSeries.map((portfolioPoint) => ({
    date: portfolioPoint.date,
    portfolio: portfolioPoint.normalized,
    benchmark: benchmarkByDate.get(portfolioPoint.date)?.normalized ?? null,
  }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Portfolio vs S&amp;P 500</CardTitle>
          <p className="text-sm text-muted-foreground">
            Normalized to 100 at the start of the selected range.
          </p>
        </div>
        <Select value={range} onValueChange={(value) => onRangeChange(value as InvestmentTimeRange)}>
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No historical data yet. Add a transaction to start tracking performance.
          </div>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} minTickGap={28} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip
                  labelFormatter={(label) => formatDateLabel(String(label))}
                  formatter={(value: number, name: string) => {
                    const label = name === 'portfolio' ? 'Portfolio' : 'S&P 500'
                    return [`${Number(value).toFixed(2)}`, label]
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  name="Portfolio"
                  stroke="var(--primary)"
                  strokeWidth={2.25}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name="S&P 500"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
