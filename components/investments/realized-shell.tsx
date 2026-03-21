"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { InvestmentsRealizedTable } from '@/components/investments/realized-table'
import { InvestmentsStateBlock } from '@/components/investments/state-block'
import { formatCurrencyCad, formatSignedCad } from '@/components/investments/format'
import { getInvestmentAccounts } from '@/lib/investments/accounts'
import { getInvestmentRealizedData } from '@/lib/investments/portfolio'
import type { InvestmentAccount, InvestmentRealizedData } from '@/lib/investments/types'

function RealizedLoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-[420px]" />
    </div>
  )
}

export function InvestmentsRealizedShell() {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([])
  const [data, setData] = useState<InvestmentRealizedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [accountTypeId, setAccountTypeId] = useState<string>('all')
  const [ticker, setTicker] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [accountsResult, realizedResult] = await Promise.all([
        getInvestmentAccounts(),
        getInvestmentRealizedData({
          accountTypeId: accountTypeId === 'all' ? undefined : accountTypeId,
          ticker: ticker.trim() ? ticker.trim().toUpperCase() : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      ])

      setAccounts(accountsResult)
      setData(realizedResult)
    } catch (loadError) {
      console.error('Failed to load realized data:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load realized data')
    } finally {
      setLoading(false)
    }
  }, [accountTypeId, ticker, startDate, endDate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const totals = useMemo(() => data?.totals, [data])

  if (loading && !data) {
    return <RealizedLoadingState />
  }

  if (error && !data) {
    return (
      <InvestmentsStateBlock
        title="Unable to load realized P/L"
        description={error}
        actionLabel="Try again"
        onAction={() => void loadData()}
      />
    )
  }

  if (!data) {
    return (
      <InvestmentsStateBlock
        title="No realized data"
        description="No realized data is available right now."
      />
    )
  }

  const realizedClass = data.totals.realized_pnl_cad >= 0 ? 'text-primary' : 'text-destructive'

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="realized-account-filter">Account</Label>
              <Select value={accountTypeId} onValueChange={setAccountTypeId}>
                <SelectTrigger id="realized-account-filter">
                  <SelectValue placeholder="All accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="realized-ticker-filter">Ticker</Label>
              <Input
                id="realized-ticker-filter"
                value={ticker}
                onChange={(event) => setTicker(event.target.value.toUpperCase())}
                placeholder="AAPL"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="realized-start-date">Start date</Label>
              <Input
                id="realized-start-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="realized-end-date">End date</Label>
              <Input
                id="realized-end-date"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total proceeds</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCurrencyCad(totals?.proceeds_cad ?? 0)}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total cost basis</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCurrencyCad(totals?.cost_basis_cad ?? 0)}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Realized gain/loss</CardTitle>
          </CardHeader>
          <CardContent className={`text-2xl font-semibold ${realizedClass}`}>
            {formatSignedCad(totals?.realized_pnl_cad ?? 0)}
          </CardContent>
        </Card>
      </div>

      <InvestmentsRealizedTable rows={data.rows} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
