import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrencyCad, formatPercent, formatSignedCad } from '@/components/investments/format'
import type { PortfolioSummary } from '@/lib/investments/types'

interface SummaryCardsProps {
  summary: PortfolioSummary
}

export function InvestmentsSummaryCards({ summary }: SummaryCardsProps) {
  const unrealizedClass =
    summary.total_unrealized_pnl_cad >= 0 ? 'text-primary' : 'text-destructive'

  const dayChangeClass =
    summary.day_change_cad >= 0 ? 'text-primary' : 'text-destructive'

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Portfolio value</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatCurrencyCad(summary.total_value_cad)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total gain/loss</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-semibold ${unrealizedClass}`}>
            {formatSignedCad(summary.total_unrealized_pnl_cad)}
          </p>
          <p className={`text-sm ${unrealizedClass}`}>
            {formatPercent(summary.total_unrealized_pnl_pct)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Day change</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-semibold ${dayChangeClass}`}>
            {formatSignedCad(summary.day_change_cad)}
          </p>
          <p className={`text-sm ${dayChangeClass}`}>{formatPercent(summary.day_change_pct)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Realized gain/loss</CardTitle>
        </CardHeader>
        <CardContent className={`text-2xl font-semibold ${summary.total_realized_pnl_cad >= 0 ? 'text-primary' : 'text-destructive'}`}>
          {formatSignedCad(summary.total_realized_pnl_cad)}
        </CardContent>
      </Card>
    </div>
  )
}
