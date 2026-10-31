"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { ArrowRight, GitBranch } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AnalysisPanel } from "@/components/analysis-panel"
import { MetricStrip } from "@/components/metric-strip"
import { ReportStatus } from "@/components/reports/report-status"
import { useReportsContext } from "@/app/reports/context"
import { getAccounts } from "@/lib/accounts"
import { getCategories, type Category } from "@/lib/categories"
import { getTransactionsInRange } from "@/lib/transactions"
import type { Transaction } from "@/lib/types"
import type { AccountMap } from "@/components/mermaid-sankey"
import { findCategoryByValue, getSpendingAmount } from "@/lib/utils"
import { isReportIncome, previousReportRange, reportCurrency, reportTrend, summarizeReport, toReportAccountMap } from "@/lib/report-summary"

interface OverviewData {
  period: { startDate: string; endDate: string }
  transactions: Transaction[]
  accountsMap: AccountMap
  categories: Category[]
  previousTransactions: Transaction[] | null
}

function categoryRows(transactions: Transaction[], categories: Category[], predicate: (transaction: Transaction) => boolean, amountOf: (transaction: Transaction) => number) {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    if (!predicate(transaction)) continue
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + amountOf(transaction))
  }
  return [...totals.entries()]
    .map(([value, amount]) => ({ value, amount, name: findCategoryByValue(categories, value)?.label ?? value }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5)
}

function Breakdown({ title, rows, total, href }: {
  title: string
  rows: ReturnType<typeof categoryRows>
  total: number
  href: string
}) {
  return (
    <AnalysisPanel title={title} action={<Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">View all <ArrowRight aria-hidden="true" className="size-4" /></Link>}>
      {rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No activity in this period.</p> : (
        <div className="space-y-1">
          {rows.map((row) => (
            <Link key={row.value} href={`${href}?category=${encodeURIComponent(row.value)}`} className="group block rounded-lg px-2 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium group-hover:text-primary">{row.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{reportCurrency.format(row.amount)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${total > 0 ? Math.max(1, Math.min(100, row.amount / total * 100)) : 0}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AnalysisPanel>
  )
}

export function ReportsOverview() {
  const { startDate, endDate, timeline } = useReportsContext()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const previous = timeline === "all-time" ? null : previousReportRange(startDate, endDate)
        const [transactions, accounts, categories, previousTransactions] = await Promise.all([
          getTransactionsInRange(startDate, endDate),
          getAccounts({ includeArchived: true }),
          getCategories(),
          previous ? getTransactionsInRange(previous.startDate, previous.endDate) : Promise.resolve(null),
        ])
        if (!active) return
        const accountsMap = toReportAccountMap(accounts ?? [])
        setData({ period: { startDate, endDate }, transactions: transactions ?? [], accountsMap, categories: (categories ?? []) as Category[], previousTransactions })
        setLoadedPeriod(`${startDate} to ${endDate}`)
      } catch (fetchError) {
        console.error("Failed to load reports overview:", fetchError)
        if (active) setError("Unable to load this period. Please try again.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void fetchData()
    return () => { active = false }
  }, [startDate, endDate, timeline, retry])

  const report = useMemo(() => {
    if (!data) return null
    const summary = summarizeReport(data.transactions, data.accountsMap)
    const previous = data.previousTransactions ? summarizeReport(data.previousTransactions, data.accountsMap) : null
    const spending = categoryRows(data.transactions, data.categories, (transaction) => transaction.transaction_type === "outgoing", getSpendingAmount)
    const income = categoryRows(data.transactions, data.categories, (transaction) => isReportIncome(transaction, data.accountsMap), (transaction) => Number(transaction.amount) || 0)
    return { summary, previous, spending, income, trend: reportTrend(data.transactions, data.accountsMap, data.period.startDate, data.period.endDate) }
  }, [data])

  if (!report || !data) {
    return <div aria-busy={loading}><ReportStatus loading={loading} error={error} loadedPeriod={loadedPeriod} onRetry={() => setRetry((value) => value + 1)} /></div>
  }

  const { summary, previous, spending, income, trend } = report
  const monthlyTrend = differenceInCalendarDays(parseISO(data.period.endDate), parseISO(data.period.startDate)) > 90
  const hasActivity = summary.income !== 0 || summary.spending !== 0
  const spendingChange = previous && previous.spending > 0 ? (summary.spending - previous.spending) / previous.spending * 100 : null
  const takeaway = !hasActivity
    ? "No reportable activity in this period yet."
    : spendingChange !== null
      ? Math.abs(spendingChange) < 0.5
        ? "Spending stayed level with the previous comparable period."
        : `Spending ${spendingChange < 0 ? "fell" : "rose"} ${Math.abs(spendingChange).toFixed(0)}% from the previous comparable period.`
      : summary.remaining >= 0
        ? `You kept ${reportCurrency.format(summary.remaining)} after spending this period.`
        : `Spending exceeded income by ${reportCurrency.format(Math.abs(summary.remaining))} this period.`

  return (
    <div className="flex min-w-0 flex-col gap-6" aria-busy={loading}>
      <ReportStatus loading={loading} error={error} loadedPeriod={loadedPeriod} onRetry={() => setRetry((value) => value + 1)} />
      <div className="rounded-xl border border-primary/20 bg-secondary/50 px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary-foreground">Your period at a glance</p>
        <h2 className="mt-2 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{takeaway}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{format(parseISO(data.period.startDate), "MMMM d, yyyy")} – {format(parseISO(data.period.endDate), "MMMM d, yyyy")}</p>
      </div>

      <MetricStrip metrics={[
        { label: "Income", value: reportCurrency.format(summary.income), detail: "Excludes transfers, reimbursements, and investment account inflows" },
        { label: "Spending", value: reportCurrency.format(summary.spending), detail: "Outgoing transactions in this period" },
        { label: "Remaining", value: reportCurrency.format(summary.remaining), tone: summary.remaining < 0 ? "negative" : "positive", detail: "Income minus spending" },
        { label: "Savings rate", value: summary.savingsRate === null ? "—" : `${summary.savingsRate.toFixed(1)}%`, detail: summary.savingsRate === null ? "No reportable income" : "Remaining as a share of income" },
      ]} />

      <AnalysisPanel title="Income and spending" description={monthlyTrend ? "Monthly activity for the selected period." : "Daily activity for the selected period."} action={<Link href="/reports/cash-flow" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Explore cash flow <ArrowRight aria-hidden="true" className="size-4" /></Link>}>
        {!hasActivity ? <p className="py-12 text-center text-sm text-muted-foreground">No income or spending to chart.</p> : (
          <div role="img" aria-label={`Income ${reportCurrency.format(summary.income)} and spending ${reportCurrency.format(summary.spending)} over the selected period`} className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value: string) => format(parseISO(value), monthlyTrend ? "MMM yy" : "MMM d")} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={32} />
                <YAxis tickFormatter={(value: number) => `$${Math.round(value).toLocaleString()}`} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip labelFormatter={(value) => format(parseISO(String(value)), monthlyTrend ? "MMMM yyyy" : "MMM d, yyyy")} formatter={(value, name) => [reportCurrency.format(Number(value)), name === "income" ? "Income" : "Spending"]} contentStyle={{ borderColor: "var(--border)", borderRadius: 10, backgroundColor: "var(--card)", color: "var(--foreground)" }} />
                <Area name="income" type="monotone" dataKey="income" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.1} strokeWidth={2} />
                <Area name="spending" type="monotone" dataKey="spending" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.08} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span><span className="mr-1.5 inline-block size-2 rounded-full bg-chart-1" />Income</span>
          <span><span className="mr-1.5 inline-block size-2 rounded-full bg-chart-2" />Spending</span>
        </div>
      </AnalysisPanel>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Breakdown title="Where you spent" rows={spending} total={summary.spending} href="/reports/spending" />
        <Breakdown title="Where income came from" rows={income} total={summary.income} href="/reports/income" />
      </div>

      <Link href="/reports/cash-flow" className="group flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-5 transition-colors hover:border-primary/40 hover:bg-secondary/30 focus-visible:outline-2 focus-visible:outline-ring sm:px-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><GitBranch aria-hidden="true" className="size-5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">Follow your money</span><span className="mt-1 block text-sm text-muted-foreground">Explore the full flow from income through deductions, spending, and savings.</span></span>
        <ArrowRight aria-hidden="true" className="size-5 text-primary transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  )
}
