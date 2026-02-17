import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { computePortfolio } from "@/lib/investments/portfolio"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function AllocationTable({
  title,
  rows,
}: {
  title: string
  rows: { label: string; value_base: number; pct: number }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No allocation data yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="text-muted-foreground">
                    {row.pct.toFixed(2)}% · {formatCurrency(row.value_base)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default async function AllocationPage() {
  const portfolio = await computePortfolio()
  const totalMarketValue = portfolio.holdings.reduce(
    (sum, holding) => sum + holding.market_value_base,
    0,
  )

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Market Value</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(totalMarketValue)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Holdings</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {portfolio.holdings.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Accounts</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {portfolio.allocationByAccount.length}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AllocationTable title="By Asset Type" rows={portfolio.allocationByAssetType} />
        <AllocationTable title="By Currency" rows={portfolio.allocationByCurrency} />
        <AllocationTable title="By Account" rows={portfolio.allocationByAccount} />
      </div>
    </div>
  )
}
