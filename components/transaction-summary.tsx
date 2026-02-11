"use client"

import * as React from "react"
import { Transaction } from "@/lib/types"
import { useMemo } from "react"
import { getSpendingAmount } from "@/lib/utils"
import { format } from "date-fns"
import { Separator } from "@/components/ui/separator"

interface TransactionSummaryProps {
  transactions: Transaction[]
}

export const TransactionSummary = React.memo(function TransactionSummary({ transactions }: TransactionSummaryProps) {
  const summary = useMemo(() => {
    if (transactions.length === 0) {
      return {
        totalTransactions: 0,
        largestIncome: 0,
        largestExpense: 0,
        averageTransaction: 0,
        totalIncome: 0,
        totalSpending: 0,
        firstTransactionDate: null,
        lastTransactionDate: null,
      }
    }

    let totalIncome = 0
    let totalSpending = 0
    let largestIncome = 0
    let largestExpense = 0
    let dates: Date[] = []

    transactions.forEach((transaction) => {
      dates.push(transaction.date)
      
      if (transaction.transaction_type === "incoming") {
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

    // Sort dates to find first and last
    dates.sort((a, b) => a.getTime() - b.getTime())

    const averageTransaction = (totalIncome + totalSpending) / transactions.length

    return {
      totalTransactions: transactions.length,
      largestIncome,
      largestExpense,
      averageTransaction,
      totalIncome,
      totalSpending,
      firstTransactionDate: dates[0],
      lastTransactionDate: dates[dates.length - 1],
    }
  }, [transactions])

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A"
    return format(date, "MMMM dd, yyyy")
  }

  return (
    <div className="p-4">
      <div className="space-y-4">
        {/* Total transactions */}
        <div className="flex justify-between items-center">
          <span className="text-base text-muted-foreground">Total transactions</span>
          <span className="font-semibold text-base">{summary.totalTransactions}</span>
        </div>

        {/* Largest transaction */}
        <div className="flex justify-between items-center">
          <span className="text-base text-muted-foreground">Largest Income</span>
          <span className="font-semibold text-base text-primary">
            {formatCurrency(summary.largestIncome)}
          </span>
        </div>

        {/* Largest expense */}
        <div className="flex justify-between items-center">
          <span className="text-base text-muted-foreground">Largest Expense</span>
          <span className="font-semibold text-base">
            {formatCurrency(summary.largestExpense)}
          </span>
        </div>

        {/* Average transaction */}
        <div className="flex justify-between items-center">
          <span className="text-base text-muted-foreground">Average Transaction</span>
          <span className="font-semibold text-base text-primary">
            +{formatCurrency(summary.averageTransaction)}
          </span>
        </div>

        <Separator />

        {/* Total income */}
        <div className="flex justify-between items-center">
          <span className="text-base text-muted-foreground">Total Income</span>
          <span className="font-semibold text-base text-primary">
            +{formatCurrency(summary.totalIncome)}
          </span>
        </div>

        {/* Total spending */}
        <div className="flex justify-between items-center">
          <span className="text-base text-muted-foreground">Total Spending</span>
          <span className="font-semibold text-base">
            {formatCurrency(summary.totalSpending)}
          </span>
        </div>

        <Separator />

        {/* First transaction */}
        <div className="flex justify-between items-center">
          <span className="text-base text-muted-foreground">First Transaction</span>
          <span className="font-medium text-sm">
            {formatDate(summary.firstTransactionDate)}
          </span>
        </div>

        {/* Last transaction */}
        <div className="flex justify-between items-center">
          <span className="text-base text-muted-foreground">Last Transaction</span>
          <span className="font-medium text-sm">
            {formatDate(summary.lastTransactionDate)}
          </span>
        </div>
      </div>
    </div>
  )
})
