"use client"

import { Transaction } from "@/lib/types"
import { useMemo } from "react"
import { format } from "date-fns"
import { Separator } from "@/components/ui/separator"

interface TransactionSummaryProps {
  transactions: Transaction[]
}

export function TransactionSummary({ transactions }: TransactionSummaryProps) {
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
      
      if (transaction.transaction_type === "credit") {
        totalIncome += transaction.amount
        if (transaction.amount > largestIncome) {
          largestIncome = transaction.amount
        }
      } else {
        totalSpending += transaction.amount
        if (transaction.amount > largestExpense) {
          largestExpense = transaction.amount
        }
      }
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
    <div className="space-y-4 p-6 bg-background border-l">
      <h2 className="text-lg font-semibold">Summary</h2>

      <Separator />

      <div className="space-y-4">
        {/* Total transactions */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total transactions</span>
          <span className="font-semibold">{summary.totalTransactions}</span>
        </div>

        {/* Largest transaction */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Largest transaction</span>
          <span className="font-semibold text-green-600">
            {formatCurrency(summary.largestIncome)}
          </span>
        </div>

        {/* Largest expense */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Largest expense</span>
          <span className="font-semibold">
            {formatCurrency(summary.largestExpense)}
          </span>
        </div>

        {/* Average transaction */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Average transaction</span>
          <span className="font-semibold text-green-600">
            +{formatCurrency(summary.averageTransaction)}
          </span>
        </div>

        <Separator />

        {/* Total income */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total income</span>
          <span className="font-semibold text-green-600">
            +{formatCurrency(summary.totalIncome)}
          </span>
        </div>

        {/* Total spending */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total spending</span>
          <span className="font-semibold">
            {formatCurrency(summary.totalSpending)}
          </span>
        </div>

        <Separator />

        {/* First transaction */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">First transaction</span>
          <span className="font-medium text-sm">
            {formatDate(summary.firstTransactionDate)}
          </span>
        </div>

        {/* Last transaction */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Last transaction</span>
          <span className="font-medium text-sm">
            {formatDate(summary.lastTransactionDate)}
          </span>
        </div>
      </div>
    </div>
  )
}
