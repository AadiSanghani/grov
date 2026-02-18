"use client"

import * as React from "react"
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface AllocationDonutRow {
  label: string
  value_base: number
  pct: number
}

interface AllocationDonutGridProps {
  currency: string
  holdingsRows: AllocationDonutRow[]
  categoryRows: AllocationDonutRow[]
  accountRows: AllocationDonutRow[]
  currencyRows: AllocationDonutRow[]
}

interface DonutChartCardProps {
  title: string
  currency: string
  rows: AllocationDonutRow[]
}

const BASE_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatWholeNumber(amount: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

function formatPct(pct: number) {
  return `${pct.toFixed(1)}%`
}

function getSliceColor(index: number) {
  return BASE_CHART_COLORS[index % BASE_CHART_COLORS.length]
}

function getSliceOpacity(index: number) {
  const cycle = Math.floor(index / BASE_CHART_COLORS.length)
  return Math.max(0.58, 1 - cycle * 0.18)
}

function renderOuterLabel(props: {
  cx?: number
  cy?: number
  midAngle?: number
  outerRadius?: number
  payload?: AllocationDonutRow
}) {
  const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, payload } = props
  if (!payload || payload.pct < 2) return null

  const radian = Math.PI / 180
  const sin = Math.sin(-radian * midAngle)
  const cos = Math.cos(-radian * midAngle)
  const startX = cx + (outerRadius + 2) * cos
  const startY = cy + (outerRadius + 2) * sin
  const midX = cx + (outerRadius + 16) * cos
  const midY = cy + (outerRadius + 16) * sin
  const endX = midX + (cos >= 0 ? 58 : -58)
  const endY = midY
  const anchor = cos >= 0 ? "start" : "end"
  const textX = endX + (cos >= 0 ? 2 : -2)

  return (
    <g>
      <path
        d={`M${startX},${startY}L${midX},${midY}L${endX},${endY}`}
        stroke="var(--border)"
        fill="none"
        strokeWidth={1}
      />
      <circle cx={startX} cy={startY} r={2} fill="var(--border)" />
      <text
        x={textX}
        y={endY - 3}
        textAnchor={anchor}
        className="fill-foreground text-[12px] font-semibold"
      >
        {payload.label}
      </text>
      <text
        x={textX}
        y={endY + 13}
        textAnchor={anchor}
        className="fill-muted-foreground text-[12px]"
      >
        {formatPct(payload.pct)}
      </text>
    </g>
  )
}

function renderInnerValueLabel(props: {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  payload?: AllocationDonutRow
}) {
  const {
    cx = 0,
    cy = 0,
    midAngle = 0,
    innerRadius = 0,
    outerRadius = 0,
    payload,
  } = props

  if (!payload || payload.pct < 7) return null

  const radian = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.58
  const x = cx + radius * Math.cos(-midAngle * radian)
  const y = cy + radius * Math.sin(-midAngle * radian)

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      className="fill-background text-[12px] font-semibold"
    >
      {formatWholeNumber(payload.value_base)}
    </text>
  )
}

function DonutChartCard({ title, currency, rows }: DonutChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No allocation data yet.
          </div>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 10, right: 70, bottom: 10, left: 70 }}>
                <Pie
                  data={rows}
                  dataKey="value_base"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={72}
                  outerRadius={122}
                  paddingAngle={1.2}
                  labelLine
                  label={renderOuterLabel}
                >
                  {rows.map((row, index) => (
                    <Cell
                      key={`${row.label}-${index}`}
                      fill={getSliceColor(index)}
                      fillOpacity={getSliceOpacity(index)}
                      stroke="var(--background)"
                      strokeWidth={1}
                    />
                  ))}
                </Pie>
                <Pie
                  data={rows}
                  dataKey="value_base"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={72}
                  outerRadius={122}
                  labelLine={false}
                  label={renderInnerValueLabel}
                  isAnimationActive={false}
                  fill="transparent"
                  stroke="transparent"
                />
                <RechartsTooltip
                  formatter={(value: number, _name, payload) => {
                    const row = payload?.payload as AllocationDonutRow | undefined
                    if (!row) return formatCurrency(value, currency)
                    return `${formatCurrency(row.value_base, currency)} (${formatPct(row.pct)})`
                  }}
                  labelFormatter={(value) => String(value)}
                  labelStyle={{ color: "var(--foreground)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function AllocationDonutGrid({
  currency,
  holdingsRows,
  categoryRows,
  accountRows,
  currencyRows,
}: AllocationDonutGridProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DonutChartCard title="Your Portfolio Holdings" currency={currency} rows={holdingsRows} />
      <DonutChartCard title="Your Investment Categories" currency={currency} rows={categoryRows} />
      <DonutChartCard title="Your Investment Accounts" currency={currency} rows={accountRows} />
      <DonutChartCard title="Your Portfolio by Currency" currency={currency} rows={currencyRows} />
    </div>
  )
}
