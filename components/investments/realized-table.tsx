import { formatCurrencyCad, formatSignedCad } from '@/components/investments/format'
import type { RealizedPnLRow } from '@/lib/investments/types'

interface RealizedTableProps {
  rows: RealizedPnLRow[]
  emptyMessage?: string
}

const quantityFormatter = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

export function InvestmentsRealizedTable({ rows, emptyMessage }: RealizedTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage ?? 'No realized gain/loss entries yet.'}
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticker</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty Sold</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proceeds (CAD)</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cost Basis (CAD)</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Realized P/L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const pnlClass = row.realized_pnl_cad >= 0 ? 'text-primary' : 'text-destructive'

            return (
              <tr key={`${row.trade_date}:${row.account_type_id}:${row.ticker}:${index}`} className="border-b last:border-0">
                <td className="px-3 py-3">{row.trade_date}</td>
                <td className="px-3 py-3 font-medium">{row.ticker}</td>
                <td className="px-3 py-3">{row.account_name}</td>
                <td className="px-3 py-3 text-right tabular-nums">{quantityFormatter.format(row.quantity_sold)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrencyCad(row.proceeds_cad)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrencyCad(row.cost_basis_cad)}</td>
                <td className={`px-3 py-3 text-right tabular-nums font-medium ${pnlClass}`}>
                  {formatSignedCad(row.realized_pnl_cad)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
