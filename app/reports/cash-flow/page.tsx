"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useReportsContext } from "../context"
import { getTransactionsInRange } from "@/lib/transactions"
import { Transaction } from "@/lib/types"
import { MermaidSankey, buildSankeyData, type AccountMap, type DeductionsMap } from "@/components/mermaid-sankey"
import { MetricStrip } from "@/components/metric-strip"
import { ReportStatus } from "@/components/reports/report-status"
import { summarizeReport, toReportAccountMap } from "@/lib/report-summary"
import { getAccounts } from "@/lib/accounts"
import { getDeductionsForTransactions } from "@/lib/deductions"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function CashFlowPage() {
  const { startDate, endDate } = useReportsContext()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof getAccounts>>>([])
  const [deductionsMap, setDeductionsMap] = useState<DeductionsMap>({})
  const [loading, setLoading] = useState(true)
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [txData, accData] = await Promise.all([
          getTransactionsInRange(startDate, endDate),
          getAccounts({ includeArchived: true }),
        ])
        const txs = txData ?? []
        // Publish transactions and their payroll deductions together.
        const incomingIds = txs
          .filter((t) => t.transaction_type === "incoming" && t.id)
          .map((t) => t.id as string)
        const dedMap = incomingIds.length > 0
          ? await getDeductionsForTransactions(incomingIds)
          : {}
        if (!active) return
        setTransactions(txs)
        setAccounts(accData ?? [])
        setDeductionsMap(dedMap)
        setLoadedPeriod(`${startDate} to ${endDate}`)
      } catch (err) {
        console.error("Failed to fetch report data:", err)
        if (active) setError("Unable to load this period. Please try again.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void fetchData()
    return () => { active = false }
  }, [startDate, endDate, retry])

  const accountsMap: AccountMap = useMemo(() => toReportAccountMap(accounts), [accounts])

  const summary = useMemo(() => summarizeReport(transactions, accountsMap), [transactions, accountsMap])

  const sankeyData = useMemo(
    () => buildSankeyData(transactions, accountsMap, deductionsMap),
    [transactions, accountsMap, deductionsMap]
  )

  const status = <ReportStatus loading={loading} error={error} loadedPeriod={loadedPeriod} onRetry={() => setRetry((value) => value + 1)} />

  if (!loadedPeriod) {
    return <div aria-busy={loading}>{status}</div>
  }

  return (
    <div className="min-w-0 space-y-6" aria-busy={loading}>
      {status}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Follow your money</h2>
        <p className="mt-1 text-sm text-muted-foreground">How income moves through deductions, accounts, and spending.</p>
      </div>
      <MetricStrip metrics={[
        { label: "Income", value: formatCurrency(summary.income) },
        { label: "Spending", value: formatCurrency(summary.spending) },
        { label: "Remaining", value: formatCurrency(summary.remaining), tone: summary.remaining < 0 ? "negative" : "positive" },
        { label: "Savings rate", value: summary.savingsRate === null ? "—" : `${summary.savingsRate.toFixed(1)}%`, detail: summary.savingsRate === null ? "No reportable income" : "Remaining as a share of income" },
      ]} />

      {summary.investmentInflows > 0 && <MetricStrip metrics={[{ label: "Investment account inflows", value: formatCurrency(summary.investmentInflows), detail: "Incoming transactions to investment accounts, shown separately from reportable income" }]} />}

      <Card className="min-w-0 overflow-hidden shadow-none">
        <CardHeader>
          <CardTitle>Cash Flow</CardTitle>
          <p className="text-sm text-muted-foreground">
            Income and expenses by category for the selected period.
          </p>
          <p className="text-xs text-muted-foreground">
            Selected period: {loadedPeriod}
          </p>
          <p className="text-xs text-muted-foreground">
            Cash savings destinations show net deposits after withdrawals and direct spending.
          </p>
          {sankeyData.isGrouped && (
            <p className="text-xs text-muted-foreground">
              Showing top flows; smaller flows are grouped.
            </p>
          )}
          {sankeyData.excludedIncompleteTransfers.count > 0 && (
            <p className="text-xs text-muted-foreground">
              Excluded {sankeyData.excludedIncompleteTransfers.count} transfer
              {sankeyData.excludedIncompleteTransfers.count === 1 ? "" : "s"} missing a source account (
              {formatCurrency(sankeyData.excludedIncompleteTransfers.totalAmount)} total
              {sankeyData.excludedIncompleteTransfers.topDestinations.length > 0
                ? `, including ${sankeyData.excludedIncompleteTransfers.topDestinations
                    .map((item) => `${item.destination} ${formatCurrency(item.amount)}`)
                    .join(", ")}`
                : ""}
              ).
            </p>
          )}
          {sankeyData.excludedNonCashSpending.count > 0 && (
            <p className="text-xs text-muted-foreground">
              Excluded {sankeyData.excludedNonCashSpending.count} expense
              {sankeyData.excludedNonCashSpending.count === 1 ? "" : "s"} marked as not affecting your balance (
              {formatCurrency(sankeyData.excludedNonCashSpending.totalAmount)} total).
            </p>
          )}
        </CardHeader>
        <CardContent className="min-h-[70vh] w-full overflow-x-auto p-4">
          <MermaidSankey
            transactions={transactions}
            accountsMap={accountsMap}
            deductionsMap={deductionsMap}
            buildResult={sankeyData}
            className="h-full min-h-[65vh] w-full"
          />
        </CardContent>
      </Card>
    </div>
  )
}
