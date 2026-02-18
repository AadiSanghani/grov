import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AllocationDonutGrid, type AllocationDonutRow } from "@/components/investments/allocation-donut-grid"
import { computePortfolio } from "@/lib/investments/portfolio"

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function toSliceRows(map: Map<string, number>): AllocationDonutRow[] {
  const total = Array.from(map.values()).reduce((sum, value) => sum + value, 0)
  if (total <= 0) return []

  return Array.from(map.entries())
    .map(([label, value]) => ({
      label,
      value_base: round2(value),
      pct: round2((value / total) * 100),
    }))
    .sort((a, b) => b.value_base - a.value_base)
}

function collapseSmallRows(rows: AllocationDonutRow[], maxRows: number) {
  if (rows.length <= maxRows) return rows
  const head = rows.slice(0, maxRows - 1)
  const tail = rows.slice(maxRows - 1)
  const otherValue = tail.reduce((sum, row) => sum + row.value_base, 0)
  const otherPct = tail.reduce((sum, row) => sum + row.pct, 0)
  return [...head, { label: "Other", value_base: round2(otherValue), pct: round2(otherPct) }]
}

export default async function AllocationPage() {
  const portfolio = await computePortfolio()

  const totalMarketValue = portfolio.holdings.reduce((sum, holding) => sum + holding.market_value_base, 0)
  const baseCurrency = portfolio.holdings[0]?.base_currency ?? portfolio.accountStatus[0]?.base_currency ?? "CAD"

  const holdingsMap = new Map<string, number>()
  for (const holding of portfolio.holdings) {
    holdingsMap.set(holding.ticker, (holdingsMap.get(holding.ticker) ?? 0) + holding.market_value_base)
  }

  const holdingsRows = collapseSmallRows(toSliceRows(holdingsMap), 12)
  const categoryRows = collapseSmallRows(
    portfolio.allocationByAssetType.map((row) => ({ ...row })),
    10,
  )
  const accountRows = collapseSmallRows(
    portfolio.allocationByAccount.map((row) => ({ ...row })),
    10,
  )
  const currencyRows = collapseSmallRows(
    portfolio.allocationByCurrency.map((row) => ({ ...row })),
    10,
  )

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Market Value</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(totalMarketValue, baseCurrency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Holdings</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{portfolio.holdings.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Accounts</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{portfolio.allocationByAccount.length}</CardContent>
        </Card>
      </div>

      <AllocationDonutGrid
        currency={baseCurrency}
        holdingsRows={holdingsRows}
        categoryRows={categoryRows}
        accountRows={accountRows}
        currencyRows={currencyRows}
      />
    </div>
  )
}
