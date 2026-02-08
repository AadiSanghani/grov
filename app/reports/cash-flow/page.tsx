"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useReportsContext } from "../context"
import { getTransactionsInRange } from "@/lib/transactions"
import { Transaction } from "@/lib/types"
import { MermaidSankey } from "@/components/mermaid-sankey"
import { getSpendingAmount } from "@/lib/utils"

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const data = await getTransactionsInRange(startDate, endDate)
        setTransactions(data ?? [])
      } catch (err) {
        console.error("Failed to fetch transactions:", err)
        setTransactions([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [startDate, endDate])

  const summary = useMemo(() => {
    let totalIncome = 0
    let totalExpenses = 0
    transactions.forEach((t) => {
      if (t.transaction_type === "incoming") totalIncome += Number(t.amount) || 0
      else totalExpenses += getSpendingAmount(t)
    })
    const netIncome = totalIncome - totalExpenses
    const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0
    return { totalIncome, totalExpenses, netIncome, savingsRate }
  }, [transactions])

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading...</p>
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
            <span className="text-2xl font-semibold text-green-600">
              +{formatCurrency(summary.totalIncome)}
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
                summary.netIncome >= 0 ? "text-green-600" : "text-red-600"
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

      <Card>
        <CardHeader>
          <CardTitle>Cash Flow</CardTitle>
          <p className="text-sm text-muted-foreground">
            Income and expenses by category for the selected period.
          </p>
        </CardHeader>
        <CardContent>
          <MermaidSankey transactions={transactions} className="w-full overflow-x-auto" />
        </CardContent>
      </Card>
    </div>
  )
}
