"use client"

import * as React from "react"
import { Transaction } from "@/lib/types"
import { useMemo } from "react"
import { getSpendingAmount, isIncomeForReporting } from "@/lib/utils"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface TransactionSummaryProps {
  transactions: Transaction[]
  collapsedSecondaryByDefault?: boolean
}

interface SummaryMetrics {
  totalTransactions: number
  largestIncome: number
  largestExpense: number
  averageTransaction: number
  totalIncome: number
  totalSpending: number
  net: number
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrency(amount: number) {
  return currencyFormatter.format(Math.abs(amount))
}

function StatRow({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", valueClassName)}>{value}</span>
    </div>
  )
}

export const TransactionSummary = React.memo(function TransactionSummary({
  transactions,
  collapsedSecondaryByDefault = true,
}: TransactionSummaryProps) {
  const [showSecondary, setShowSecondary] = React.useState(!collapsedSecondaryByDefault)

  React.useEffect(() => {
    setShowSecondary(!collapsedSecondaryByDefault)
  }, [collapsedSecondaryByDefault])

  const summary = useMemo<SummaryMetrics>(() => {
    if (transactions.length === 0) {
      return {
        totalTransactions: 0,
        largestIncome: 0,
        largestExpense: 0,
        averageTransaction: 0,
        totalIncome: 0,
        totalSpending: 0,
        net: 0,
      }
    }

    let totalIncome = 0
    let totalSpending = 0
    let largestIncome = 0
    let largestExpense = 0

    transactions.forEach((transaction) => {
      if (isIncomeForReporting(transaction)) {
        totalIncome += transaction.amount
        if (transaction.amount > largestIncome) {
          largestIncome = transaction.amount
        }
      } else if (transaction.transaction_type === "outgoing") {
        const spending = getSpendingAmount(transaction)
        totalSpending += spending
        if (spending > largestExpense) {
          largestExpense = spending
        }
      }
      // transfers excluded from income and spending
    })

    const averageTransaction = (totalIncome + totalSpending) / transactions.length

    return {
      totalTransactions: transactions.length,
      largestIncome,
      largestExpense,
      averageTransaction,
      totalIncome,
      totalSpending,
      net: totalIncome - totalSpending,
    }
  }, [transactions])

  const netClassName =
    summary.net > 0
      ? "text-primary"
      : summary.net < 0
        ? "text-destructive"
        : "text-foreground"

  return (
    <div className="p-4">
      <div className="space-y-3">
        <StatRow
          label="Total spending"
          value={`-${formatCurrency(summary.totalSpending)}`}
          valueClassName="text-foreground"
        />
        <StatRow
          label="Total income"
          value={`+${formatCurrency(summary.totalIncome)}`}
          valueClassName="text-foreground"
        />
        <StatRow
          label="Net"
          value={`${summary.net >= 0 ? "+" : "-"}${formatCurrency(summary.net)}`}
          valueClassName={netClassName}
        />
      </div>

      <div className="mt-4 border-t pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          onClick={() => setShowSecondary((prev) => !prev)}
          aria-expanded={showSecondary}
        >
          <span>More metrics</span>
          {showSecondary ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showSecondary && (
          <div className="mt-2 space-y-3 px-2 pb-1">
            <StatRow
              label="Transactions"
              value={summary.totalTransactions.toLocaleString("en-US")}
            />
            <StatRow
              label="Largest income"
              value={formatCurrency(summary.largestIncome)}
            />
            <StatRow
              label="Largest expense"
              value={formatCurrency(summary.largestExpense)}
            />
            <StatRow
              label="Average amount"
              value={formatCurrency(summary.averageTransaction)}
            />
          </div>
        )}
      </div>
    </div>
  )
})
