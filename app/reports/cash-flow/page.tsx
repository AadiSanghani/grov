"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useReportsContext } from "../context"
import { getTransactionsInRange } from "@/lib/transactions"
import { Transaction } from "@/lib/types"
import { MermaidSankey, buildSankeyData, type AccountMap, type DeductionsMap } from "@/components/mermaid-sankey"
import { getSpendingAmount, isIncomeForReporting } from "@/lib/utils"
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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [txData, accData] = await Promise.all([
          getTransactionsInRange(startDate, endDate),
          getAccounts(),
        ])
        const txs = txData ?? []
        setTransactions(txs)
        setAccounts(accData ?? [])

        // Fetch deductions for all incoming transactions
        const incomingIds = txs
          .filter((t) => t.transaction_type === "incoming" && t.id)
          .map((t) => t.id as string)
        if (incomingIds.length > 0) {
          const dedMap = await getDeductionsForTransactions(incomingIds)
          setDeductionsMap(dedMap)
        } else {
          setDeductionsMap({})
        }
      } catch (err) {
        console.error("Failed to fetch data:", err)
        setTransactions([])
        setAccounts([])
        setDeductionsMap({})
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [startDate, endDate])

  const accountsMap: AccountMap = useMemo(() => {
    const map: AccountMap = {}
    for (const acc of accounts) {
      if (acc.id != null) {
        map[String(acc.id)] = {
          name: acc.account_name,
          category: acc.category ?? "asset",
          accountType: acc.account_type ?? "Cash",
          accountSubtype: acc.account_subtype ?? "",
        }
      }
    }
    return map
  }, [accounts])

  const summary = useMemo(() => {
    let totalNetIncome = 0
    let totalExpenses = 0
    let totalInvestmentContributions = 0
    transactions.forEach((t) => {
      if (t.transaction_type === "incoming") {
        if (!isIncomeForReporting(t)) {
          return
        }
        const amount = Number(t.amount) || 0
        const account = t.account_type_id != null ? accountsMap[t.account_type_id] : undefined
        if (account?.accountType === "Investments") {
          totalInvestmentContributions += amount
        } else {
          totalNetIncome += amount
        }
      } else if (t.transaction_type === "outgoing") {
        totalExpenses += getSpendingAmount(t)
      }
      // transfers excluded from both
    })
    const netIncome = totalNetIncome - totalExpenses
    const savingsRate = totalNetIncome > 0 ? (netIncome / totalNetIncome) * 100 : 0
    return { totalNetIncome, totalExpenses, netIncome, savingsRate, totalInvestmentContributions }
  }, [transactions, accountsMap])

  const sankeyData = useMemo(
    () => buildSankeyData(transactions, accountsMap, deductionsMap),
    [transactions, accountsMap, deductionsMap]
  )

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold text-accent">
              +{formatCurrency(summary.totalNetIncome)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">
              {formatCurrency(summary.totalExpenses)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={`text-2xl font-semibold ${
                summary.netIncome >= 0 ? "text-accent" : "text-destructive"
              }`}
            >
              {summary.netIncome >= 0 ? "+" : ""}
              {formatCurrency(summary.netIncome)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Savings Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">
              {summary.savingsRate.toFixed(1)}%
            </span>
          </CardContent>
        </Card>
      </div>

      {(summary.totalInvestmentContributions > 0 || sankeyData.excludedInternalTransfers.count > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.totalInvestmentContributions > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Investment Contributions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-semibold text-accent">
                  {formatCurrency(summary.totalInvestmentContributions)}
                </span>
              </CardContent>
            </Card>
          )}
          {sankeyData.excludedInternalTransfers.count > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Internal Transfers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <span className="text-2xl font-semibold">
                  {formatCurrency(sankeyData.excludedInternalTransfers.totalAmount)}
                </span>
                <p className="text-xs text-muted-foreground">
                  {sankeyData.excludedInternalTransfers.count} excluded cash-to-cash transfer
                  {sankeyData.excludedInternalTransfers.count === 1 ? "" : "s"} in this period
                </p>
                {sankeyData.excludedInternalTransfers.topDestinations[0] && (
                  <p className="text-xs text-muted-foreground">
                    Top destination: {sankeyData.excludedInternalTransfers.topDestinations[0].destination}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="overflow-auto">
        <CardHeader>
          <CardTitle>Cash Flow</CardTitle>
          <p className="text-sm text-muted-foreground">
            Income and expenses by category for the selected period.
          </p>
          {sankeyData.isGrouped && (
            <p className="text-xs text-muted-foreground">
              Showing top flows; smaller flows are grouped.
            </p>
          )}
        </CardHeader>
        <CardContent className="min-h-[70vh] w-full p-4">
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
