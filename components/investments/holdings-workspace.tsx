"use client"

import * as React from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type {
  InvestmentAccount,
  InvestmentRangeKey,
  InvestmentTransaction,
  InvestmentTransactionType,
} from "@/lib/investments/types"
import { getInvestmentAccounts } from "@/lib/investments/accounts"
import { computePortfolio, computePortfolioPerformanceSeries } from "@/lib/investments/portfolio"
import { createInvestmentTransaction, getInvestmentTransactions } from "@/lib/investments/transactions"

const TRANSACTION_TYPE_OPTIONS: InvestmentTransactionType[] = ["BUY", "SELL", "DIVIDEND", "FEE"]
const GROUP_BY_OPTIONS = [
  { value: "asset_type", label: "Group by type" },
  { value: "account", label: "Group by account" },
  { value: "currency", label: "Group by currency" },
] as const
const RANGE_OPTIONS: { value: InvestmentRangeKey; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "YTD", label: "YTD" },
  { value: "1Y", label: "1Y" },
  { value: "5Y", label: "5Y" },
]
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
})

type GroupByValue = (typeof GROUP_BY_OPTIONS)[number]["value"]
type PortfolioData = Awaited<ReturnType<typeof computePortfolio>>
type PortfolioPerformanceData = Awaited<ReturnType<typeof computePortfolioPerformanceSeries>>

function getLocalDateString(date: Date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatDateLabel(dateStr: string, formatter: Intl.DateTimeFormat) {
  const parsed = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateStr
  return formatter.format(parsed)
}

function formatCompactCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    notation: "compact",
    compactDisplay: "short",
  }).format(amount)
}

export function HoldingsWorkspace() {
  const [loading, setLoading] = React.useState(true)
  const [accounts, setAccounts] = React.useState<InvestmentAccount[]>([])
  const [transactions, setTransactions] = React.useState<InvestmentTransaction[]>([])
  const [portfolio, setPortfolio] = React.useState<PortfolioData | null>(null)
  const [performance, setPerformance] = React.useState<PortfolioPerformanceData | null>(null)

  const [addTxOpen, setAddTxOpen] = React.useState(false)
  const [accountFilter, setAccountFilter] = React.useState("all")
  const [groupBy, setGroupBy] = React.useState<GroupByValue>("asset_type")
  const [range, setRange] = React.useState<InvestmentRangeKey>("3M")

  const [txAccountId, setTxAccountId] = React.useState("")
  const [txTicker, setTxTicker] = React.useState("")
  const [txType, setTxType] = React.useState<InvestmentTransactionType>("BUY")
  const [txDate, setTxDate] = React.useState(() => getLocalDateString())
  const [txQuantity, setTxQuantity] = React.useState("1")
  const [txPrice, setTxPrice] = React.useState("")
  const [txCurrency, setTxCurrency] = React.useState("USD")
  const [txFees, setTxFees] = React.useState("0")
  const [txNotes, setTxNotes] = React.useState("")

  const [submittingTx, setSubmittingTx] = React.useState(false)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const [accountsResult, txResult, portfolioResult, performanceResult] = await Promise.allSettled([
        getInvestmentAccounts(),
        getInvestmentTransactions({
          limit: 25,
          accountId: accountFilter === "all" ? undefined : accountFilter,
        }),
        computePortfolio({
          accountId: accountFilter === "all" ? undefined : accountFilter,
        }),
        computePortfolioPerformanceSeries({
          accountId: accountFilter === "all" ? undefined : accountFilter,
          range,
        }),
      ])

      if (
        accountsResult.status !== "fulfilled" ||
        txResult.status !== "fulfilled" ||
        portfolioResult.status !== "fulfilled"
      ) {
        const error =
          accountsResult.status === "rejected"
            ? accountsResult.reason
            : txResult.status === "rejected"
              ? txResult.reason
              : portfolioResult.status === "rejected"
                ? portfolioResult.reason
                : new Error("Unknown load error")
        throw error
      }

      setAccounts(accountsResult.value)
      setTransactions(txResult.value)
      setPortfolio(portfolioResult.value)

      if (performanceResult.status === "fulfilled") {
        setPerformance(performanceResult.value)
      } else {
        console.error("Failed to load investments performance:", performanceResult.reason)
        toast.error("Performance chart data unavailable")
        setPerformance(null)
      }
    } catch (error) {
      console.error("Failed to load investments data:", error)
      toast.error("Failed to load investments data")
      setAccounts([])
      setTransactions([])
      setPortfolio(null)
      setPerformance(null)
    } finally {
      setLoading(false)
    }
  }, [accountFilter, range])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  React.useEffect(() => {
    if (!txAccountId && accounts.length > 0) {
      setTxAccountId(accounts[0].id)
    }
  }, [accounts, txAccountId])

  const isTrade = txType === "BUY" || txType === "SELL"
  const todayLocalDate = React.useMemo(() => getLocalDateString(), [])
  const holdings = React.useMemo(() => portfolio?.holdings ?? [], [portfolio])
  const accountStatus = React.useMemo(() => portfolio?.accountStatus ?? [], [portfolio])
  const realizedRows = React.useMemo(() => portfolio?.realizedRows ?? [], [portfolio])
  const displayBaseCurrency = React.useMemo(
    () => holdings[0]?.base_currency ?? accountStatus[0]?.base_currency ?? "CAD",
    [accountStatus, holdings],
  )
  const performancePoints = React.useMemo(() => performance?.points ?? [], [performance])
  const fallbackCount = holdings.filter((holding) => holding.price_source === "fallback").length
  const rangeLabel = React.useMemo(
    () => RANGE_OPTIONS.find((option) => option.value === range)?.label ?? range,
    [range],
  )
  const performanceDomain = React.useMemo<[number, number]>(() => {
    if (performancePoints.length === 0) return [0, 0]
    const values = performancePoints.map((point) => point.value_base)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min
    const padding = span === 0 ? Math.max(Math.abs(max) * 0.06, 50) : Math.max(span * 0.15, 50)
    return [min - padding, max + padding]
  }, [performancePoints])

  const summary = React.useMemo(() => {
    const totalMarketValue = holdings.reduce((sum, holding) => sum + holding.market_value_base, 0)
    const totalCostBasis = holdings.reduce((sum, holding) => sum + holding.cost_basis_base, 0)
    const totalUnrealized = holdings.reduce((sum, holding) => sum + holding.unrealized_pl_base, 0)
    const totalRealized = realizedRows.reduce(
      (sum, row) => sum + row.realized_pl_base,
      0,
    )
    const totalReturnPct = totalCostBasis > 0
      ? ((totalUnrealized + totalRealized) / totalCostBasis) * 100
      : 0

    return {
      totalMarketValue,
      totalCostBasis,
      totalUnrealized,
      totalRealized,
      totalReturnPct,
    }
  }, [holdings, realizedRows])
  const rangeReturnPct = performance?.total_return_pct ?? 0

  const groupedHoldings = React.useMemo(() => {
    const groups = new Map<string, typeof holdings>()
    for (const holding of holdings) {
      const key =
        groupBy === "asset_type"
          ? holding.asset_type
          : groupBy === "account"
            ? holding.account_name
            : holding.quote_currency
      const current = groups.get(key) ?? []
      current.push(holding)
      groups.set(key, current)
    }
    return Array.from(groups.entries())
      .map(([label, rows]) => ({
        label,
        rows: rows.sort((a, b) => b.market_value_base - a.market_value_base),
      }))
      .sort(
        (a, b) =>
          b.rows.reduce((sum, row) => sum + row.market_value_base, 0) -
          a.rows.reduce((sum, row) => sum + row.market_value_base, 0),
      )
  }, [groupBy, holdings])

  const resetTxForm = () => {
    setTxTicker("")
    setTxType("BUY")
    setTxDate(getLocalDateString())
    setTxQuantity("1")
    setTxPrice("")
    setTxCurrency("USD")
    setTxFees("0")
    setTxNotes("")
  }

  const handleCreateTransaction = async (event: React.FormEvent) => {
    event.preventDefault()

    if (accounts.length === 0) {
      toast.error("Create an investment account first")
      return
    }
    if (!txAccountId) {
      toast.error("Please select an account")
      return
    }
    if (!txTicker.trim()) {
      toast.error("Ticker is required")
      return
    }
    if (txDate > todayLocalDate) {
      toast.error("Trade date cannot be in the future")
      return
    }

    const quantity = isTrade ? Number(txQuantity) : 0
    const price = Number(txPrice)
    const fees = Number(txFees || 0)

    if (isTrade && quantity <= 0) {
      toast.error("Quantity must be greater than zero")
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error(isTrade ? "Price must be greater than zero" : "Amount must be greater than zero")
      return
    }
    if (!Number.isFinite(fees) || fees < 0) {
      toast.error("Fees cannot be negative")
      return
    }

    const normalizedTxCurrency = txCurrency.trim().toUpperCase()
    setSubmittingTx(true)
    try {
      await createInvestmentTransaction({
        account_id: txAccountId,
        ticker: txTicker.trim().toUpperCase(),
        type: txType,
        trade_date: txDate,
        quantity,
        price,
        currency: normalizedTxCurrency,
        fees,
        notes: txNotes || null,
      })
      toast.success("Transaction saved")
      setAddTxOpen(false)
      resetTxForm()
      await loadData()
    } catch (error) {
      console.error("Failed to create transaction:", error)
      toast.error(error instanceof Error ? error.message : "Failed to create transaction")
    } finally {
      setSubmittingTx(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Holdings</h2>
          <p className="text-sm text-muted-foreground">
            Investment accounts are auto-detected from Accounts where type is Investments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-9 w-[220px] px-3 text-sm">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupByValue)}>
            <SelectTrigger className="h-9 w-[180px] px-3 text-sm">
              <SelectValue placeholder="Group by type" />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setAddTxOpen(true)} disabled={accounts.length === 0}>
            <Plus className="h-4 w-4" />
            Add transaction
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Your Portfolio</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(summary.totalMarketValue, displayBaseCurrency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Return ({rangeLabel})</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-semibold ${
              rangeReturnPct >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {formatPercent(rangeReturnPct)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Unrealized P/L</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-semibold ${
              summary.totalUnrealized >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {formatCurrency(summary.totalUnrealized, displayBaseCurrency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Realized P/L</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-semibold ${
              summary.totalRealized >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {formatCurrency(summary.totalRealized, displayBaseCurrency)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Performance</CardTitle>
            <div className="inline-flex items-center rounded-md border bg-muted/40 p-1">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={range === option.value ? "default" : "ghost"}
                  className="h-7 px-2.5"
                  disabled={loading}
                  onClick={() => setRange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {performance?.data_state === "fallback" && (
            <div className="rounded-md border border-amber-400/50 bg-amber-100/20 px-3 py-2 text-xs text-muted-foreground">
              Performance is partially using fallback prices due to unavailable live data.
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              Loading performance…
            </div>
          ) : performancePoints.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              No holdings history yet. Add transactions to populate your performance trend.
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performancePoints} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    minTickGap={32}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => formatDateLabel(String(value), SHORT_DATE_FORMATTER)}
                  />
                  <YAxis
                    domain={performanceDomain}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => formatCompactCurrency(Number(value), displayBaseCurrency)}
                  />
                  <Tooltip
                    formatter={(value: number, _name, payload) => {
                      const point = payload?.payload as { return_pct?: number } | undefined
                      const valueLabel = formatCurrency(Number(value), displayBaseCurrency)
                      const returnLabel =
                        point && typeof point.return_pct === "number"
                          ? ` (${formatPercent(point.return_pct)})`
                          : ""
                      return `${valueLabel}${returnLabel}`
                    }}
                    labelFormatter={(label) => formatDateLabel(String(label), LONG_DATE_FORMATTER)}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value_base"
                    name="Portfolio"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "var(--primary)" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading investments…</p>
          ) : holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holdings yet. Add buy transactions to see your portfolio here.
            </p>
          ) : (
            <div className="space-y-3">
              {fallbackCount > 0 && (
                <div className="rounded-md border border-amber-400/50 bg-amber-100/20 px-3 py-2 text-xs text-muted-foreground">
                  {fallbackCount} holding(s) are using fallback market values due to unavailable live data.
                </div>
              )}
              <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Security</th>
                    <th className="py-2 pr-3 font-medium">Price</th>
                    <th className="py-2 pr-3 font-medium">Quantity</th>
                    <th className="py-2 pr-3 font-medium">Avg Cost (Base)</th>
                    <th className="py-2 pr-3 font-medium">Market Value (Base)</th>
                    <th className="py-2 pr-3 font-medium">Unrealized P/L (Base)</th>
                    <th className="py-2 pr-3 font-medium">% Return</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedHoldings.map((group) => {
                    const groupMarket = group.rows.reduce((sum, row) => sum + row.market_value_base, 0)
                    return (
                      <React.Fragment key={group.label}>
                        <tr className="bg-muted/40">
                          <td colSpan={7} className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {group.label} · {formatCurrency(groupMarket, displayBaseCurrency)}
                          </td>
                        </tr>
                        {group.rows.map((holding) => (
                          <tr key={`${holding.account_id}-${holding.security_id}`} className="border-b last:border-0">
                            <td className="py-2 pr-3">
                              <div className="font-medium">{holding.ticker}</div>
                              <div className="text-xs text-muted-foreground">{holding.security_name ?? "Unknown security"}</div>
                            </td>
                            <td className="py-2 pr-3">
                              {formatCurrency(holding.current_price_quote, holding.quote_currency)}
                            </td>
                            <td className="py-2 pr-3">{holding.quantity.toLocaleString("en-US")}</td>
                            <td className="py-2 pr-3">{formatCurrency(holding.avg_cost_base, holding.base_currency)}</td>
                            <td className="py-2 pr-3">{formatCurrency(holding.market_value_base, holding.base_currency)}</td>
                            <td className={`py-2 pr-3 ${holding.unrealized_pl_base >= 0 ? "text-positive" : "text-negative"}`}>
                              {formatCurrency(holding.unrealized_pl_base, holding.base_currency)}
                            </td>
                            <td className={`py-2 pr-3 ${holding.return_pct >= 0 ? "text-positive" : "text-negative"}`}>
                              {formatPercent(holding.return_pct)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })}
                  <tr className="bg-muted/30">
                    <td className="py-2 pr-3 font-semibold">Total</td>
                    <td className="py-2 pr-3" />
                    <td className="py-2 pr-3" />
                    <td className="py-2 pr-3 font-semibold">{formatCurrency(summary.totalCostBasis, displayBaseCurrency)}</td>
                    <td className="py-2 pr-3 font-semibold">{formatCurrency(summary.totalMarketValue, displayBaseCurrency)}</td>
                    <td className={`py-2 pr-3 font-semibold ${summary.totalUnrealized >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatCurrency(summary.totalUnrealized, displayBaseCurrency)}
                    </td>
                    <td className={`py-2 pr-3 font-semibold ${summary.totalReturnPct >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatPercent(summary.totalReturnPct)}
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Status</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading account status…</p>
          ) : accountStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No account status yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Market Value</th>
                    <th className="py-2 pr-3 font-medium">Cost Basis</th>
                    <th className="py-2 pr-3 font-medium">Unrealized P/L</th>
                    <th className="py-2 pr-3 font-medium">Realized P/L (All-Time)</th>
                    <th className="py-2 pr-3 font-medium">Return %</th>
                  </tr>
                </thead>
                <tbody>
                  {accountStatus.map((row) => (
                    <tr key={row.account_id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{row.account_name}</td>
                      <td className="py-2 pr-3">{formatCurrency(row.market_value_base, row.base_currency)}</td>
                      <td className="py-2 pr-3">{formatCurrency(row.cost_basis_base, row.base_currency)}</td>
                      <td className={`py-2 pr-3 ${row.unrealized_pl_base >= 0 ? "text-positive" : "text-negative"}`}>
                        {formatCurrency(row.unrealized_pl_base, row.base_currency)}
                      </td>
                      <td className={`py-2 pr-3 ${row.realized_pl_all_time_base >= 0 ? "text-positive" : "text-negative"}`}>
                        {formatCurrency(row.realized_pl_all_time_base, row.base_currency)}
                      </td>
                      <td className={`py-2 pr-3 ${row.total_return_pct >= 0 ? "text-positive" : "text-negative"}`}>
                        {formatPercent(row.total_return_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Investment Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading transactions…</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions for the selected account.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Ticker</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Quantity</th>
                    <th className="py-2 pr-3 font-medium">Price/Amount</th>
                    <th className="py-2 pr-3 font-medium">Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{tx.trade_date}</td>
                      <td className="py-2 pr-3">{tx.account_name ?? "-"}</td>
                      <td className="py-2 pr-3 font-medium">{tx.ticker ?? "-"}</td>
                      <td className="py-2 pr-3">{tx.type}</td>
                      <td className="py-2 pr-3">{tx.quantity.toLocaleString("en-US")}</td>
                      <td className="py-2 pr-3">{formatCurrency(tx.price, tx.currency)}</td>
                      <td className="py-2 pr-3">{formatCurrency(tx.fees, tx.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addTxOpen} onOpenChange={setAddTxOpen}>
        <DialogContent className="max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Add investment transaction</DialogTitle>
            <DialogDescription>
              Supports BUY, SELL, DIVIDEND, and FEE.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateTransaction}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="investment-tx-account">Account</Label>
                <Select value={txAccountId} onValueChange={setTxAccountId}>
                  <SelectTrigger id="investment-tx-account" className="h-9 px-3 text-sm">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} ({account.base_currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="investment-tx-type">Type</Label>
                <Select value={txType} onValueChange={(value) => setTxType(value as InvestmentTransactionType)}>
                  <SelectTrigger id="investment-tx-type" className="h-9 px-3 text-sm">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="investment-tx-ticker">Ticker</Label>
                <Input
                  id="investment-tx-ticker"
                  value={txTicker}
                  onChange={(e) => setTxTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. NVDA"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="investment-tx-date">Trade date</Label>
                <Input
                  id="investment-tx-date"
                  type="date"
                  value={txDate}
                  max={todayLocalDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="investment-tx-quantity">{isTrade ? "Quantity" : "Quantity (auto 0)"}</Label>
                <Input
                  id="investment-tx-quantity"
                  type="number"
                  min={0}
                  step="0.00000001"
                  value={isTrade ? txQuantity : "0"}
                  onChange={(e) => setTxQuantity(e.target.value)}
                  disabled={!isTrade}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="investment-tx-price">{isTrade ? "Price" : "Amount"}</Label>
                <Input
                  id="investment-tx-price"
                  type="number"
                  min={0}
                  step="0.00000001"
                  value={txPrice}
                  onChange={(e) => setTxPrice(e.target.value)}
                  placeholder={isTrade ? "0.00" : "Amount"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="investment-tx-currency">Currency</Label>
                <Input
                  id="investment-tx-currency"
                  value={txCurrency}
                  onChange={(e) => setTxCurrency(e.target.value.toUpperCase())}
                  placeholder="USD"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="investment-tx-fees">Fees</Label>
                <Input
                  id="investment-tx-fees"
                  type="number"
                  min={0}
                  step="0.00000001"
                  value={txFees}
                  onChange={(e) => setTxFees(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="investment-tx-notes">Notes (optional)</Label>
                <Input
                  id="investment-tx-notes"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddTxOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingTx}>
                {submittingTx ? "Saving…" : "Save transaction"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
