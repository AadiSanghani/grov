"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { InvestmentsAllocationBreakdown } from '@/components/investments/allocation-breakdown'
import { InvestmentsStateBlock } from '@/components/investments/state-block'
import { formatCurrencyCad, formatPercent } from '@/components/investments/format'
import { getInvestmentAllocationData } from '@/lib/investments/portfolio'
import type { AllocationSlice, InvestmentAllocationData, ShareCountSlice } from '@/lib/investments/types'

const PIE_COLORS = [
  '#22577A',
  '#38A3A5',
  '#57CC99',
  '#80ED99',
  '#C7F9CC',
  '#2C7DA0',
  '#61A5C2',
  '#89C2D9',
]

interface PieDatum {
  [key: string]: string | number
  label: string
  pct: number
  valueLabel: string
  rawValue: number
}

interface SecurityAllocationRow {
  ticker: string
  quantity: number
  currentPrice: number
  currentPriceCurrency: string
  marketValueCad: number
  allocationPct: number
  sharePct: number
}

function toAllocationPieData(rows: AllocationSlice[]): PieDatum[] {
  return rows.map((row) => ({
    label: row.label,
    pct: row.pct,
    valueLabel: formatCurrencyCad(row.value_cad),
    rawValue: row.value_cad,
  }))
}

function toSharePieData(rows: ShareCountSlice[]): PieDatum[] {
  return rows.map((row) => ({
    label: row.label,
    pct: row.pct,
    valueLabel: `${row.quantity.toLocaleString('en-CA')} shares`,
    rawValue: row.quantity,
  }))
}

function AllocationLoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[340px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[340px]" />
      </div>
    </div>
  )
}

function AllocationPieCard({ title, subtitle, rows }: { title: string; subtitle: string; rows: PieDatum[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            No data to chart yet.
          </div>
        ) : (
          <>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rows}
                    dataKey="pct"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={45}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {rows.map((row, index) => (
                      <Cell key={`${row.label}:${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(_value: number, _name: string, props: { payload?: PieDatum }) => {
                      const payload = props.payload
                      if (!payload) return ['—', '—']
                      return [`${payload.valueLabel} · ${formatPercent(payload.pct)}`, payload.label]
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-2 space-y-2">
              {rows.slice(0, 6).map((row, index) => (
                <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <span className="truncate text-muted-foreground">{row.label}</span>
                  </div>
                  <span className="tabular-nums">{row.valueLabel} · {formatPercent(row.pct)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function InvestmentsAllocationShell() {
  const [data, setData] = useState<InvestmentAllocationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await getInvestmentAllocationData({ range: '1Y' })
      setData(result)
    } catch (loadError) {
      console.error('Failed to load allocation data:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load allocation data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const accountPie = useMemo(() => toAllocationPieData(data?.allocation_by_account ?? []), [data])
  const currencyPie = useMemo(() => toAllocationPieData(data?.allocation_by_currency ?? []), [data])
  const securityAllocationPie = useMemo(() => toAllocationPieData(data?.allocation_by_security ?? []), [data])
  const shareMixPie = useMemo(() => toSharePieData(data?.share_count_by_security ?? []), [data])
  const securityRows = useMemo<SecurityAllocationRow[]>(() => {
    if (!data) return []

    const allocationByTicker = new Map(
      data.allocation_by_security.map((row) => [row.label, row.pct]),
    )
    const shareByTicker = new Map(
      data.share_count_by_security.map((row) => [row.label, row.pct]),
    )

    const rowsByTicker = new Map<string, SecurityAllocationRow>()
    for (const holding of data.holdings) {
      const existing = rowsByTicker.get(holding.ticker)
      if (existing) {
        existing.quantity += holding.quantity
        existing.marketValueCad += holding.market_value_cad
      } else {
        rowsByTicker.set(holding.ticker, {
          ticker: holding.ticker,
          quantity: holding.quantity,
          currentPrice: holding.current_price,
          currentPriceCurrency: holding.current_price_currency,
          marketValueCad: holding.market_value_cad,
          allocationPct: allocationByTicker.get(holding.ticker) ?? 0,
          sharePct: shareByTicker.get(holding.ticker) ?? 0,
        })
      }
    }

    return Array.from(rowsByTicker.values()).sort((a, b) => b.marketValueCad - a.marketValueCad)
  }, [data])

  if (loading && !data) {
    return <AllocationLoadingState />
  }

  if (error && !data) {
    return (
      <InvestmentsStateBlock
        title="Unable to load allocations"
        description={error}
        actionLabel="Try again"
        onAction={() => void loadData()}
      />
    )
  }

  if (!data) {
    return (
      <InvestmentsStateBlock
        title="No allocation data"
        description="No allocation data is available right now."
      />
    )
  }

  if (data.accounts.length === 0) {
    return (
      <InvestmentsStateBlock
        title="Create an investment account first"
        description="Create an account with type Investments in Accounts before tracking allocations."
        actionLabel="Open Accounts"
        onAction={() => {
          window.location.href = '/accounts'
        }}
      />
    )
  }

  if (!data.has_data) {
    return (
      <InvestmentsStateBlock
        title="No allocation data yet"
        description="Add your first trade to see allocation and share-mix charts."
        actionLabel="Go to Overview"
        onAction={() => {
          window.location.href = '/investments'
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Allocation Analytics</h2>
          <p className="text-sm text-muted-foreground">
            {data.as_of ? `Based on cached quotes as of ${new Date(data.as_of).toLocaleString()}` : 'Based on latest cached prices'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/investments">Back to overview</Link>
        </Button>
      </div>

      <InvestmentsAllocationBreakdown
        byAccount={data.allocation_by_account}
        byCurrency={data.allocation_by_currency}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AllocationPieCard
          title="Allocation by Account"
          subtitle="Portfolio market value split by account (CAD)."
          rows={accountPie}
        />
        <AllocationPieCard
          title="Allocation by Currency"
          subtitle="Portfolio market value split by quote currency."
          rows={currencyPie}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AllocationPieCard
          title="Allocation by Security"
          subtitle="Market value concentration by ticker."
          rows={securityAllocationPie}
        />
        <AllocationPieCard
          title="Share Count Mix"
          subtitle="Percentage of total units held by ticker (not value-weighted)."
          rows={shareMixPie}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security Allocation Table</CardTitle>
          <p className="text-sm text-muted-foreground">Includes current price, value allocation, and share mix by ticker.</p>
        </CardHeader>
        <CardContent>
          {securityRows.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">No security allocation rows yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticker</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shares</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Market Value (CAD)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allocation %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Share Mix %</th>
                  </tr>
                </thead>
                <tbody>
                  {securityRows.map((row) => (
                    <tr key={row.ticker} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{row.ticker}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.quantity.toLocaleString('en-CA', { maximumFractionDigits: 6 })}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {new Intl.NumberFormat('en-CA', {
                          style: 'currency',
                          currency: row.currentPriceCurrency,
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        }).format(row.currentPrice)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCurrencyCad(row.marketValueCad)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatPercent(row.allocationPct)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatPercent(row.sharePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
