import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrencyCad, formatPercent } from '@/components/investments/format'
import type { AllocationSlice } from '@/lib/investments/types'

interface AllocationBreakdownProps {
  byAccount: AllocationSlice[]
  byCurrency: AllocationSlice[]
}

function AllocationList({ rows, emptyLabel }: { rows: AllocationSlice[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 6).map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">{row.label}</span>
            <span className="tabular-nums">
              {formatCurrencyCad(row.value_cad)} · {formatPercent(row.pct)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.pct)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function InvestmentsAllocationBreakdown({ byAccount, byCurrency }: AllocationBreakdownProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Allocation by account</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationList rows={byAccount} emptyLabel="No account allocation yet." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Allocation by currency</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationList rows={byCurrency} emptyLabel="No currency allocation yet." />
        </CardContent>
      </Card>
    </div>
  )
}
