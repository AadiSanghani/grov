import { Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { InvestmentTransaction } from '@/lib/investments/types'

interface RecentTransactionsProps {
  transactions: InvestmentTransaction[]
  onAddTrade: () => void
  onEditTrade: (transaction: InvestmentTransaction) => void
  onDeleteTrade: (transaction: InvestmentTransaction) => void
}

const quantityFormatter = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

const priceFormatter = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

export function InvestmentsRecentTransactions({
  transactions,
  onAddTrade,
  onEditTrade,
  onDeleteTrade,
}: RecentTransactionsProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-base font-semibold">Recent transactions</h3>
          <p className="text-sm text-muted-foreground">Trade history is the source of truth for holdings and P/L.</p>
        </div>
        <Button size="sm" onClick={onAddTrade}>Add trade</Button>
      </div>

      {transactions.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No trades yet. Add your first trade to start the ledger.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticker</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fees</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b last:border-0">
                  <td className="px-3 py-3">{transaction.trade_date}</td>
                  <td className="px-3 py-3 font-medium">{transaction.transaction_type}</td>
                  <td className="px-3 py-3">{transaction.security?.ticker ?? '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{quantityFormatter.format(transaction.quantity)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{priceFormatter.format(transaction.unit_price)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{priceFormatter.format(transaction.fees)}</td>
                  <td className="px-3 py-3">{transaction.trade_currency}</td>
                  <td className="px-3 py-3">{transaction.account_name ?? 'Investment Account'}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => onEditTrade(transaction)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => onDeleteTrade(transaction)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
