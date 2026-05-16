"use client"

import { useMemo, useState } from 'react'
import { ArrowUpDown, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent, formatSignedCurrency } from '@/components/investments/format'
import type { DerivedHolding } from '@/lib/investments/types'

interface HoldingsTableProps {
  holdings: DerivedHolding[]
  onEditHolding?: (holding: DerivedHolding) => void
}

type SortKey =
  | 'ticker'
  | 'quantity'
  | 'avg_cost'
  | 'current_price'
  | 'market_value'
  | 'unrealized_pnl'
  | 'allocation_pct'
  | 'account_name'

type SortDirection = 'asc' | 'desc'

const sharesFormatter = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

function sortRows(rows: DerivedHolding[], key: SortKey, direction: SortDirection): DerivedHolding[] {
  const factor = direction === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    let comparison = 0

    switch (key) {
      case 'ticker':
        comparison = a.ticker.localeCompare(b.ticker)
        break
      case 'quantity':
        comparison = a.quantity - b.quantity
        break
      case 'avg_cost':
        comparison = a.avg_cost - b.avg_cost
        break
      case 'current_price':
        comparison = a.current_price - b.current_price
        break
      case 'market_value':
        comparison = a.market_value - b.market_value
        break
      case 'unrealized_pnl':
        comparison = a.unrealized_pnl - b.unrealized_pnl
        break
      case 'allocation_pct':
        comparison = a.allocation_pct - b.allocation_pct
        break
      case 'account_name':
        comparison = a.account_name.localeCompare(b.account_name)
        break
      default:
        comparison = 0
        break
    }

    if (comparison !== 0) {
      return comparison * factor
    }

    return a.ticker.localeCompare(b.ticker) * factor
  })
}

function HeaderCell({
  title,
  sortKey,
  currentSort,
  direction,
  onSort,
  align = 'left',
}: {
  title: string
  sortKey: SortKey
  currentSort: SortKey
  direction: SortDirection
  onSort: (next: SortKey) => void
  align?: 'left' | 'right'
}) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`h-7 p-0 text-xs font-semibold uppercase tracking-wide ${align === 'right' ? 'ml-auto flex justify-end' : ''}`}
        onClick={() => onSort(sortKey)}
      >
        {title}
        <ArrowUpDown className={`ml-1.5 h-3.5 w-3.5 ${currentSort === sortKey ? 'text-foreground' : 'text-muted-foreground'}`} />
        <span className="sr-only">
          {currentSort === sortKey ? `Sorted ${direction}` : 'Sort'}
        </span>
      </Button>
    </th>
  )
}

export function InvestmentsHoldingsTable({ holdings, onEditHolding }: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('market_value')
  const [direction, setDirection] = useState<SortDirection>('desc')

  const sorted = useMemo(() => sortRows(holdings, sortKey, direction), [holdings, sortKey, direction])

  const onSort = (nextKey: SortKey) => {
    if (nextKey === sortKey) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setDirection(nextKey === 'ticker' || nextKey === 'account_name' ? 'asc' : 'desc')
  }

  if (holdings.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        No holdings yet. Add your first trade to build your portfolio.
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-b bg-muted/40">
              <HeaderCell title="Ticker" sortKey="ticker" currentSort={sortKey} direction={direction} onSort={onSort} />
              <HeaderCell title="Shares" sortKey="quantity" currentSort={sortKey} direction={direction} onSort={onSort} align="right" />
              <HeaderCell title="Avg Cost" sortKey="avg_cost" currentSort={sortKey} direction={direction} onSort={onSort} align="right" />
              <HeaderCell title="Price" sortKey="current_price" currentSort={sortKey} direction={direction} onSort={onSort} align="right" />
              <HeaderCell title="Market Value" sortKey="market_value" currentSort={sortKey} direction={direction} onSort={onSort} align="right" />
              <HeaderCell title="Unrealized" sortKey="unrealized_pnl" currentSort={sortKey} direction={direction} onSort={onSort} align="right" />
              <HeaderCell title="Allocation" sortKey="allocation_pct" currentSort={sortKey} direction={direction} onSort={onSort} align="right" />
              <HeaderCell title="Account" sortKey="account_name" currentSort={sortKey} direction={direction} onSort={onSort} />
              {onEditHolding ? (
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((holding) => {
              const holdingCurrency = holding.holding_currency || holding.current_price_currency
              const unrealizedClass = holding.unrealized_pnl >= 0 ? 'text-primary' : 'text-destructive'

              return (
                <tr key={`${holding.original_account_type_id}:${holding.original_security_id}`} className="border-b last:border-0">
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium">{holding.ticker}</div>
                    <div className="text-xs text-muted-foreground">{holding.security_name ?? 'Unknown security'}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{sharesFormatter.format(holding.quantity)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(holding.avg_cost, holdingCurrency)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatCurrency(holding.current_price, holdingCurrency)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">{formatCurrency(holding.market_value, holdingCurrency)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${unrealizedClass}`}>
                    <div>{formatSignedCurrency(holding.unrealized_pnl, holdingCurrency)}</div>
                    <div className="text-xs">{formatPercent(holding.unrealized_pnl_pct)}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatPercent(holding.allocation_pct)}</td>
                  <td className="px-3 py-3">
                    <span className="text-sm">{holding.account_name}</span>
                  </td>
                  {onEditHolding ? (
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditHolding(holding)}
                        aria-label={`Edit ${holding.ticker} holding`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
