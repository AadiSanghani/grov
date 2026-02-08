"use client"

import * as React from "react"
import { Transaction } from "@/lib/types"
import { format } from "date-fns"
import { ChevronRight } from "lucide-react"
import { cn, findCategoryByValue, getSpendingAmount } from "@/lib/utils"
import { Category } from "@/lib/categories"
import { type Account } from "@/lib/accounts"

interface TransactionListProps {
  transactions: Transaction[]
  categories: Category[]
  accounts?: Account[]
  onTransactionClick: (transaction: Transaction) => void
}

interface GroupedTransactions {
  [date: string]: {
    transactions: Transaction[]
    total: number
  }
}

export const TransactionList = React.memo(function TransactionList({ transactions, categories, accounts = [], onTransactionClick }: TransactionListProps) {
  const accountName = (id: string) => accounts.find((a) => a.id?.toString() === id)?.account_name ?? id

  const groupedTransactions: GroupedTransactions = transactions.reduce((acc, transaction) => {
    const dateKey = format(transaction.date, "MMMM dd, yyyy")
    
    if (!acc[dateKey]) {
      acc[dateKey] = {
        transactions: [],
        total: 0,
      }
    }
    
    acc[dateKey].transactions.push(transaction)
    
    if (transaction.transaction_type === "transfer") {
      // Transfers don't affect income/expense total
    } else if (transaction.transaction_type === "incoming") {
      acc[dateKey].total += transaction.amount
    } else {
      acc[dateKey].total -= getSpendingAmount(transaction)
    }
    
    return acc
  }, {} as GroupedTransactions)

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
              const isTransfer = transaction.transaction_type === "transfer"
              const categoryInfo = findCategoryByValue(categories, transaction.category)
              const transferLabel = isTransfer && transaction.to_account_type_id
                ? `${accountName(transaction.account_type_id)} \u2192 ${accountName(transaction.to_account_type_id)}`
                : null
              
              return (
                <button
                  key={transaction.id}
                  onClick={() => onTransactionClick(transaction)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 rounded-lg transition-colors text-left group"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="min-w-[180px]">
                      <p className="font-medium truncate">
                        {isTransfer ? (transferLabel ?? transaction.merchant) : transaction.merchant}
                      </p>
                    </div>

                    {!isTransfer && categoryInfo && (
                      <div className="flex items-center gap-2 min-w-[150px]">
                        <span className="text-sm">{categoryInfo.emoji}</span>
                        <span className="text-sm text-muted-foreground">{categoryInfo.label}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className={cn(
                        "font-semibold",
                        transaction.transaction_type === "incoming" 
                          ? "text-green-600" 
                          : "text-foreground"
                      )}>
                        {transaction.transaction_type === "incoming" ? "+" : ""}
                        ${transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {transaction.transaction_type === "outgoing" && transaction.spending_amount != null && transaction.spending_amount !== transaction.amount && (
                        <p className="text-xs text-muted-foreground">
                          your share: ${transaction.spending_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
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
})
