"use client"

import { Transaction } from "@/lib/types"
import { format } from "date-fns"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { TRANSACTION_CATEGORIES } from "@/lib/constants"

interface TransactionListProps {
  transactions: Transaction[]
  onTransactionClick: (transaction: Transaction) => void
}

interface GroupedTransactions {
  [date: string]: {
    transactions: Transaction[]
    total: number
  }
}

export function TransactionList({ transactions, onTransactionClick }: TransactionListProps) {
  // Group transactions by date
  const groupedTransactions: GroupedTransactions = transactions.reduce((acc, transaction) => {
    const dateKey = format(transaction.date, "MMMM dd, yyyy")
    
    if (!acc[dateKey]) {
      acc[dateKey] = {
        transactions: [],
        total: 0,
      }
    }
    
    acc[dateKey].transactions.push(transaction)
    
    // Calculate daily total (credits positive, debits negative)
    const amount = transaction.transaction_type === "credit" 
      ? transaction.amount 
      : -transaction.amount
    acc[dateKey].total += amount
    
    return acc
  }, {} as GroupedTransactions)

  // Get category info
  const getCategoryInfo = (categoryValue: string) => {
    for (const group of TRANSACTION_CATEGORIES) {
      const item = group.items.find(i => i.value === categoryValue)
      if (item) return item
    }
    return null
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-lg mb-2">No transactions found</p>
        <p className="text-sm text-muted-foreground">Add your first transaction to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedTransactions).map(([date, { transactions, total }]) => (
        <div key={date}>
          {/* Date Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-muted/50 rounded-lg mb-2">
            <h3 className="font-semibold text-sm">{date}</h3>
            <span className={cn(
              "font-semibold text-sm",
              total >= 0 ? "text-green-600" : "text-foreground"
            )}>
              {total >= 0 ? "+" : ""}${Math.abs(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Transaction Rows */}
          <div className="space-y-1">
            {transactions.map((transaction) => {
              const categoryInfo = getCategoryInfo(transaction.category)
              
              return (
                <button
                  key={transaction.id}
                  onClick={() => onTransactionClick(transaction)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 rounded-lg transition-colors text-left group"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Merchant */}
                    <div className="min-w-[180px]">
                      <p className="font-medium truncate">{transaction.merchant}</p>
                    </div>

                    {/* Account - placeholder for now */}
                    <div className="flex items-center gap-2 min-w-[150px]">
                      <span className="text-sm">💰</span>
                      <span className="text-sm text-muted-foreground">Account</span>
                    </div>

                    {/* Category */}
                    {categoryInfo && (
                      <div className="flex items-center gap-2 min-w-[150px]">
                        <span className="text-sm">{categoryInfo.emoji}</span>
                        <span className="text-sm text-muted-foreground">{categoryInfo.label}</span>
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-semibold",
                      transaction.transaction_type === "credit" 
                        ? "text-green-600" 
                        : "text-foreground"
                    )}>
                      {transaction.transaction_type === "credit" ? "+" : ""}
                      ${transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
