"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { InvestmentsHoldingsTable } from '@/components/investments/holdings-table'
import { InvestmentsPerformanceChart } from '@/components/investments/performance-chart'
import { InvestmentsRealizedTable } from '@/components/investments/realized-table'
import { InvestmentsRecentTransactions } from '@/components/investments/recent-transactions'
import { InvestmentsStateBlock } from '@/components/investments/state-block'
import { InvestmentsSummaryCards } from '@/components/investments/summary-cards'
import { InvestmentsTradeDialog } from '@/components/investments/trade-dialog'
import { upsertInvestmentHoldingOverrideAction } from '@/lib/investments/actions'
import { deleteInvestmentTransaction } from '@/lib/investments/transactions'
import { getInvestmentDashboardData } from '@/lib/investments/portfolio'
import type { DerivedHolding, InvestmentDashboardData, InvestmentTimeRange, InvestmentTransaction } from '@/lib/investments/types'

function DashboardLoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-[360px]" />
      <Skeleton className="h-[420px]" />
    </div>
  )
}

interface HoldingOverrideFormState {
  account_type_id: string
  ticker: string
  quantity: string
  avg_cost: string
  currency: string
}

function buildHoldingOverrideForm(holding: DerivedHolding): HoldingOverrideFormState {
  return {
    account_type_id: holding.account_type_id,
    ticker: holding.ticker,
    quantity: String(holding.quantity),
    avg_cost: String(holding.avg_cost),
    currency: holding.holding_currency || holding.current_price_currency,
  }
}

export function InvestmentsDashboardShell() {
  const [range, setRange] = useState<InvestmentTimeRange>('1Y')
  const [data, setData] = useState<InvestmentDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<InvestmentTransaction | null>(null)
  const [editingHolding, setEditingHolding] = useState<DerivedHolding | null>(null)
  const [holdingForm, setHoldingForm] = useState<HoldingOverrideFormState | null>(null)
  const [isSavingHolding, setIsSavingHolding] = useState(false)
  const [deletingTransaction, setDeletingTransaction] = useState<InvestmentTransaction | null>(null)

  const loadData = useCallback(async (selectedRange: InvestmentTimeRange) => {
    try {
      setLoading(true)
      setError(null)
      const nextData = await getInvestmentDashboardData({ range: selectedRange })
      setData(nextData)
    } catch (loadError) {
      console.error('Failed to load investments dashboard:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load investment dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData(range)
  }, [range, loadData])

  const hasInvestmentAccount = useMemo(() => (data?.accounts.length ?? 0) > 0, [data])
  const investmentAccountOptions = useMemo(() => data?.accounts ?? [], [data])

  const openAddTrade = () => {
    setEditingTransaction(null)
    setIsTradeDialogOpen(true)
  }

  const openEditTrade = (transaction: InvestmentTransaction) => {
    setEditingTransaction(transaction)
    setIsTradeDialogOpen(true)
  }

  const openEditHolding = (holding: DerivedHolding) => {
    setEditingHolding(holding)
    setHoldingForm(buildHoldingOverrideForm(holding))
  }

  const closeEditHolding = () => {
    if (isSavingHolding) return
    setEditingHolding(null)
    setHoldingForm(null)
  }

  const refreshFromServer = async () => {
    await loadData(range)
  }

  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true)
      const response = await fetch('/api/investments/refresh', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          slot: 'manual',
          force: true,
        }),
      })

      const result = (await response.json()) as {
        status?: string
        symbols_failed?: number
        message?: string
        error?: string
      }

      if (!response.ok) {
        throw new Error(result.error ?? 'Failed to refresh market data')
      }
      await refreshFromServer()

      if (result.status === 'success' || result.status === 'partial') {
        toast.success(
          result.status === 'success'
            ? 'Market data refreshed'
            : `Refresh completed with ${result.symbols_failed ?? 0} symbol failures`,
        )
      } else {
        toast.message(result.message ?? 'Refresh skipped')
      }
    } catch (refreshError) {
      console.error('Manual refresh failed:', refreshError)
      toast.error(refreshError instanceof Error ? refreshError.message : 'Failed to refresh market data')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDeleteTrade = async () => {
    if (!deletingTransaction) return

    try {
      await deleteInvestmentTransaction(deletingTransaction.id)
      toast.success('Trade deleted')
      setDeletingTransaction(null)
      await refreshFromServer()
    } catch (deleteError) {
      console.error('Failed to delete trade:', deleteError)
      toast.error(deleteError instanceof Error ? deleteError.message : 'Failed to delete trade')
    }
  }

  const handleSaveHoldingOverride = async () => {
    if (!editingHolding || !holdingForm) return

    const quantity = Number(holdingForm.quantity)
    const avgCost = Number(holdingForm.avg_cost)
    if (!holdingForm.ticker.trim()) {
      toast.error('Ticker is required')
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Shares held must be greater than zero')
      return
    }
    if (!Number.isFinite(avgCost) || avgCost < 0) {
      toast.error('Average cost must be zero or greater')
      return
    }

    try {
      setIsSavingHolding(true)
      await upsertInvestmentHoldingOverrideAction({
        account_type_id: editingHolding.original_account_type_id,
        security_id: editingHolding.original_security_id,
        override_account_type_id: holdingForm.account_type_id,
        ticker: holdingForm.ticker.trim().toUpperCase(),
        quantity,
        avg_cost: avgCost,
        currency: holdingForm.currency,
      })
      toast.success('Holding updated')
      setEditingHolding(null)
      setHoldingForm(null)
      await refreshFromServer()
    } catch (saveError) {
      console.error('Failed to update holding:', saveError)
      toast.error(saveError instanceof Error ? saveError.message : 'Failed to update holding')
    } finally {
      setIsSavingHolding(false)
    }
  }

  if (loading && !data) {
    return <DashboardLoadingState />
  }

  if (error && !data) {
    return (
      <InvestmentsStateBlock
        title="Unable to load investments"
        description={error}
        actionLabel="Try again"
        onAction={() => void loadData(range)}
      />
    )
  }

  if (!data) {
    return (
      <InvestmentsStateBlock
        title="No dashboard data"
        description="No dashboard data was returned. Try again in a moment."
        actionLabel="Reload"
        onAction={() => void loadData(range)}
      />
    )
  }

  if (!hasInvestmentAccount) {
    return (
      <InvestmentsStateBlock
        title="Create an investment account first"
        description="Investments use your existing account model. Create an account with type Investments in the Accounts section, then add your first trade here."
        actionLabel="Open Accounts"
        onAction={() => {
          window.location.href = '/accounts'
        }}
      />
    )
  }

  if (!data.has_data) {
    return (
      <>
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={handleManualRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh market data
          </Button>
        </div>
        <InvestmentsStateBlock
          title="Track your first investment"
          description="Add a BUY, SELL, or DRIP transaction to start your ledger-driven portfolio dashboard. Holdings, realized P/L, and performance are all derived from this history."
          actionLabel="Add first trade"
          onAction={openAddTrade}
        />
        <InvestmentsTradeDialog
          open={isTradeDialogOpen}
          onOpenChange={setIsTradeDialogOpen}
          accounts={data.accounts}
          transaction={editingTransaction}
          onSaved={refreshFromServer}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {data.as_of ? `Quotes as of ${new Date(data.as_of).toLocaleString()}` : 'Using cached market data'}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleManualRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh market data
          </Button>
          <Button onClick={openAddTrade}>Add trade</Button>
        </div>
      </div>

      <InvestmentsSummaryCards summary={data.summary} />

      <InvestmentsPerformanceChart
        portfolioSeries={data.portfolio_series}
        benchmarkSeries={data.benchmark_series}
        range={range}
        onRangeChange={setRange}
      />

      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Holdings</h2>
        <p className="text-sm text-muted-foreground">Derived from transaction history using average cost basis.</p>
      </div>
      <InvestmentsHoldingsTable holdings={data.holdings} onEditHolding={openEditHolding} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Realized P/L snapshot</CardTitle>
              <p className="text-sm text-muted-foreground">Most recent closed trade outcomes.</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/investments/realized">View full realized P/L</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <InvestmentsRealizedTable
              rows={data.realized_preview}
              emptyMessage="No realized P/L yet. Sell transactions will appear here."
            />
          </CardContent>
        </Card>

        <InvestmentsRecentTransactions
          transactions={data.transactions}
          onAddTrade={openAddTrade}
          onEditTrade={openEditTrade}
          onDeleteTrade={setDeletingTransaction}
        />
      </div>

      <InvestmentsTradeDialog
        open={isTradeDialogOpen}
        onOpenChange={setIsTradeDialogOpen}
        accounts={data.accounts}
        transaction={editingTransaction}
        onSaved={refreshFromServer}
      />

      <Dialog open={Boolean(deletingTransaction)} onOpenChange={(open) => !open && setDeletingTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete trade?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the transaction from the ledger and recalculate holdings and P/L.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTransaction(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDeleteTrade()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingHolding)} onOpenChange={(open) => !open && closeEditHolding()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit holding</DialogTitle>
          </DialogHeader>

          {holdingForm ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="holding-account">Account</Label>
                <Select
                  value={holdingForm.account_type_id}
                  onValueChange={(value) => setHoldingForm((prev) => prev ? { ...prev, account_type_id: value } : prev)}
                >
                  <SelectTrigger id="holding-account">
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {investmentAccountOptions.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holding-ticker">Ticker</Label>
                <Input
                  id="holding-ticker"
                  value={holdingForm.ticker}
                  onChange={(event) => setHoldingForm((prev) => prev ? { ...prev, ticker: event.target.value.toUpperCase() } : prev)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holding-currency">Currency</Label>
                <Select
                  value={holdingForm.currency}
                  onValueChange={(value) => setHoldingForm((prev) => prev ? { ...prev, currency: value } : prev)}
                >
                  <SelectTrigger id="holding-currency">
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holding-quantity">Shares held</Label>
                <Input
                  id="holding-quantity"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={holdingForm.quantity}
                  onChange={(event) => setHoldingForm((prev) => prev ? { ...prev, quantity: event.target.value } : prev)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holding-avg-cost">Average cost per share</Label>
                <Input
                  id="holding-avg-cost"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={holdingForm.avg_cost}
                  onChange={(event) => setHoldingForm((prev) => prev ? { ...prev, avg_cost: event.target.value } : prev)}
                />
              </div>

              {editingHolding?.has_override ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  This holding already has a brokerage override.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={closeEditHolding} disabled={isSavingHolding}>Cancel</Button>
            <Button onClick={() => void handleSaveHoldingOverride()} disabled={isSavingHolding}>
              {isSavingHolding ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </>
  )
}
