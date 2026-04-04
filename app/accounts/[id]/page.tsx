"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { format, startOfMonth, startOfYear, subMonths } from "date-fns"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageLayout } from "@/components/page-layout"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getAccountGrowthHistory } from "@/lib/balances"
import { getAccountById, getAccounts } from "@/lib/accounts"
import { getRecentTransactionsForAccount } from "@/lib/transactions"
import type { AccountGrowthDataPoint, Transaction } from "@/lib/types"

const TIMELINE_OPTIONS = [
  { value: "month-to-date", label: "Month to Date" },
  { value: "last-6-months", label: "Last 6 Months" },
  { value: "year-to-date", label: "Year to Date" },
  { value: "all-time", label: "All Time" },
] as const

interface AccountDetail {
  id: string
  account_name: string
  account_type: string
  account_subtype: string
  account_balance: string
}

function getDateRange(timeline: string): { startDate: string; endDate: string; granularity: "daily" | "monthly" } {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const endDate = format(tomorrow, "yyyy-MM-dd")

  switch (timeline) {
    case "month-to-date":
      return { startDate: format(startOfMonth(today), "yyyy-MM-dd"), endDate, granularity: "daily" }
    case "last-6-months":
      return { startDate: format(subMonths(today, 6), "yyyy-MM-dd"), endDate, granularity: "monthly" }
    case "year-to-date":
      return { startDate: format(startOfYear(today), "yyyy-MM-dd"), endDate, granularity: "monthly" }
    case "all-time":
      return { startDate: "2020-01-01", endDate, granularity: "monthly" }
    default:
      return { startDate: format(startOfMonth(today), "yyyy-MM-dd"), endDate, granularity: "daily" }
  }
}

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>()
  const accountId = params?.id ?? ""

  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [allAccounts, setAllAccounts] = useState<Array<{ id?: number; account_name: string }>>([])
  const [growthTimeline, setGrowthTimeline] = useState<string>("month-to-date")
  const [growthData, setGrowthData] = useState<AccountGrowthDataPoint[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingGrowth, setLoadingGrowth] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadStaticData = async () => {
      if (!accountId) return

      try {
        setLoading(true)
        setError(null)

        const [accountData, transactions, accountsData] = await Promise.all([
          getAccountById(accountId),
          getRecentTransactionsForAccount(accountId, 10),
          getAccounts(),
        ])

        setAccount({
          id: String(accountData.id),
          account_name: accountData.account_name,
          account_type: accountData.account_type,
          account_subtype: accountData.account_subtype ?? "",
          account_balance: accountData.account_balance,
        })
        setRecentTransactions(transactions ?? [])
        setAllAccounts(accountsData ?? [])
      } catch (loadError) {
        console.error("Failed to load account detail:", loadError)
        setError("Account not found or unavailable.")
      } finally {
        setLoading(false)
      }
    }

    loadStaticData()
  }, [accountId])

  useEffect(() => {
    const loadGrowthData = async () => {
      if (!accountId) return

      try {
        setLoadingGrowth(true)
        const numericAccountId = Number(accountId)
        if (!Number.isFinite(numericAccountId)) {
          setGrowthData([])
          return
        }

        const { startDate, endDate, granularity } = getDateRange(growthTimeline)
        const rows = await getAccountGrowthHistory(numericAccountId, startDate, endDate, granularity)
        setGrowthData(rows)
      } catch (growthError) {
        console.error("Failed to load account growth:", growthError)
        setGrowthData([])
      } finally {
        setLoadingGrowth(false)
      }
    }

    loadGrowthData()
  }, [accountId, growthTimeline])

  const isMonthOnlyTimeline = ["last-6-months", "year-to-date", "all-time"].includes(growthTimeline)

  const growthChartData = useMemo(() => {
    return growthData.map((point) => {
      const dateStr = point.date.length === 7 ? `${point.date}-01` : point.date
      const label = isMonthOnlyTimeline ? format(new Date(dateStr), "MMM yyyy") : format(new Date(dateStr), "MMM dd")
      return {
        label,
        growthAmount: point.growth_amount,
        growthPct: point.growth_pct,
        balance: point.balance,
      }
    })
  }, [growthData, isMonthOnlyTimeline])

  const growthSummary = useMemo(() => {
    if (growthData.length === 0) return null
    const first = growthData[0]
    const latest = growthData[growthData.length - 1]
    return {
      startBalance: first.balance,
      currentBalance: latest.balance,
      netGrowthAmount: latest.growth_amount,
      netGrowthPct: latest.growth_pct,
    }
  }, [growthData])

  const growthYDomain = useMemo<[number, number]>(() => {
    if (growthChartData.length === 0) return [0, 0]
    const values = growthChartData.map((point) => point.growthAmount)
    const min = Math.min(...values, 0)
    const max = Math.max(...values, 0)
    const span = max - min
    const padding = span === 0 ? Math.max(Math.abs(max) * 0.05, 50) : Math.max(span * 0.12, 50)
    return [min - padding, max + padding]
  }, [growthChartData])

  const growthChartColor = (growthSummary?.netGrowthAmount ?? 0) < 0 ? "var(--destructive)" : "var(--primary)"

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount)

  const formatSignedCurrency = (amount: number) => `${amount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`
  const formatSignedPercent = (amount: number) => `${amount >= 0 ? "+" : ""}${amount.toFixed(2)}%`

  const accountNameById = (id: string | null | undefined): string => {
    if (!id) return "Unassigned"
    const found = allAccounts.find((entry) => String(entry.id) === id)
    return found?.account_name ?? "Unassigned"
  }

  if (loading) {
    return (
      <PageLayout title="Account Detail" description="Loading account details...">
        <Card>
          <CardContent className="p-6 text-muted-foreground">Loading account details...</CardContent>
        </Card>
      </PageLayout>
    )
  }

  if (error || !account) {
    return (
      <PageLayout title="Account Detail" description="Unable to load this account.">
        <Card>
          <CardContent className="p-6 text-muted-foreground">
            <p>{error ?? "This account could not be found."}</p>
            <Link href="/accounts" className="mt-3 inline-block text-sm text-primary hover:underline">
              Back to Accounts
            </Link>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout title={account.account_name} description={`${account.account_type} • ${account.account_subtype || "No subtype"}`}>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/accounts" className="hover:text-foreground hover:underline">
          Accounts
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{account.account_name}</span>
      </nav>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Current Balance</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{formatCurrency(Number(account.account_balance) || 0)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Growth</CardTitle>
            <CardDescription>Growth from baseline for the selected timeline.</CardDescription>
          </div>
          <Select value={growthTimeline} onValueChange={setGrowthTimeline}>
            <SelectTrigger className="w-full sm:w-[180px]" aria-label="Select timeline range">
              <SelectValue placeholder="Select timeline" />
            </SelectTrigger>
            <SelectContent>
              {TIMELINE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-6">
          {loadingGrowth ? (
            <div className="flex h-[240px] items-center justify-center text-muted-foreground">Loading account growth...</div>
          ) : growthChartData.length === 0 || !growthSummary ? (
            <div className="flex h-[240px] items-center justify-center text-muted-foreground">
              No balance history in this range for this account.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Start balance</p>
                  <p className="text-base font-semibold">{formatCurrency(growthSummary.startBalance)}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Current balance</p>
                  <p className="text-base font-semibold">{formatCurrency(growthSummary.currentBalance)}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className={`text-xs ${growthSummary.netGrowthAmount >= 0 ? "text-muted-foreground" : "text-destructive"}`}>Net growth</p>
                  <p className={`text-base font-semibold ${growthSummary.netGrowthAmount >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatSignedCurrency(growthSummary.netGrowthAmount)}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className={`text-xs ${growthSummary.netGrowthPct >= 0 ? "text-muted-foreground" : "text-destructive"}`}>Growth %</p>
                  <p className={`text-base font-semibold ${growthSummary.netGrowthPct >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatSignedPercent(growthSummary.netGrowthPct)}
                  </p>
                </div>
              </div>

              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthChartData} margin={{ top: 24, right: 24, left: 24, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="2 2" horizontal={true} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      domain={growthYDomain}
                      tickFormatter={(value) => {
                        if (value < 0) return `-${formatCurrency(Math.abs(value))}`
                        if (value > 0) return `+${formatCurrency(value)}`
                        return formatCurrency(0)
                      }}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value: number, _name: string, payload) => {
                        const point = payload?.payload as { growthPct: number; balance: number } | undefined
                        return [
                          `${formatSignedCurrency(value)} (${formatSignedPercent(point?.growthPct ?? 0)})`,
                          `Growth · Balance ${formatCurrency(point?.balance ?? 0)}`,
                        ]
                      }}
                      labelStyle={{ color: "var(--foreground)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="growthAmount"
                      name="Growth"
                      stroke={growthChartColor}
                      fill={growthChartColor}
                      fillOpacity={0.2}
                      strokeWidth={2}
                      dot={{
                        r: 3,
                        stroke: growthChartColor,
                        strokeWidth: 2,
                        fill: "var(--background)",
                      }}
                      activeDot={{
                        r: 5,
                        stroke: growthChartColor,
                        strokeWidth: 2,
                        fill: "var(--background)",
                      }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Latest transactions associated with this account.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions found for this account yet.</p>
          ) : (
            <div className="space-y-2">
              {recentTransactions.map((transaction) => {
                const isFrom = transaction.account_type_id === account.id
                const isTo = transaction.to_account_type_id === account.id
                const transferLabel =
                  transaction.transaction_type === "transfer"
                    ? `${accountNameById(transaction.account_type_id)} → ${accountNameById(transaction.to_account_type_id)}`
                    : transaction.merchant
                const signedAmount =
                  transaction.transaction_type === "outgoing"
                    ? -transaction.amount
                    : transaction.transaction_type === "incoming"
                      ? transaction.amount
                      : isFrom
                        ? -transaction.amount
                        : isTo
                          ? transaction.amount
                          : 0

                return (
                  <div key={transaction.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{transferLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(transaction.date, "MMM d, yyyy")} • {transaction.transaction_type}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold ${signedAmount >= 0 ? "text-primary" : "text-destructive"}`}>
                      {formatSignedCurrency(signedAmount)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}
