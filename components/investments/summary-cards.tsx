import { MetricStrip } from '@/components/metric-strip'
import { formatCurrencyCad, formatPercent, formatSignedCad } from '@/components/investments/format'
import type { PortfolioSummary } from '@/lib/investments/types'

interface SummaryCardsProps {
  summary: PortfolioSummary
}

export function InvestmentsSummaryCards({ summary }: SummaryCardsProps) {
  return (
    <MetricStrip metrics={[
      { label: 'Portfolio value', value: formatCurrencyCad(summary.total_value_cad), detail: 'CAD' },
      { label: 'Total gain/loss', value: formatSignedCad(summary.total_unrealized_pnl_cad), detail: formatPercent(summary.total_unrealized_pnl_pct), tone: summary.total_unrealized_pnl_cad < 0 ? 'negative' : 'positive' },
      { label: 'Day change', value: formatSignedCad(summary.day_change_cad), detail: formatPercent(summary.day_change_pct), tone: summary.day_change_cad < 0 ? 'negative' : 'positive' },
      { label: 'Realized gain/loss', value: formatSignedCad(summary.total_realized_pnl_cad), tone: summary.total_realized_pnl_cad < 0 ? 'negative' : 'positive' },
    ]} />
  )
}
