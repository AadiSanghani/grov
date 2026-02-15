"use client"

import * as React from "react"
import { Transaction } from "@/lib/types"
import { format } from "date-fns"
import { Copy, EllipsisVertical } from "lucide-react"
import { cn, findCategoryByValue, getSpendingAmount } from "@/lib/utils"
import { Category } from "@/lib/categories"
import { type Account } from "@/lib/accounts"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface TransactionListProps {
  transactions: Transaction[]
  categories: Category[]
  accounts?: Account[]
  onTransactionClick: (transaction: Transaction) => void
  onDuplicateTransaction: (transaction: Transaction) => void
}

interface GroupedTransactions {
  [date: string]: {
    transactions: Transaction[]
    total: number
  }
}

export const TransactionList = React.memo(function TransactionList({
  transactions,
  categories,
  accounts = [],
  onTransactionClick,
  onDuplicateTransaction,
}: TransactionListProps) {
  const [activeMenuId, setActiveMenuId] = React.useState<string | undefined>(undefined)

  const accountName = (id: string | null | undefined) => {
    if (id == null || id === '') return 'Unassigned'
    const name = accounts.find((a) => a.id?.toString() === id)?.account_name
    return name ?? 'Unassigned'
  }

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
              total >= 0 ? "text-accent" : "text-foreground"
            )}>
              {total >= 0 ? "+" : ""}${Math.abs(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Transaction Rows */}
          <div className="space-y-1">
            {transactions.map((transaction) => {
              const isTransfer = transaction.transaction_type === "transfer"
              const categoryInfo = findCategoryByValue(categories, transaction.category)
              const transferLabel = isTransfer && (transaction.to_account_type_id != null && transaction.to_account_type_id !== '')
                ? `${accountName(transaction.account_type_id)} \u2192 ${accountName(transaction.to_account_type_id)}`
                : null
              
              return (
                <div
                  key={transaction.id}
                  className="w-full flex items-center gap-1 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <button
                    onClick={() => onTransactionClick(transaction)}
                    className="flex-1 flex items-center justify-between px-4 py-3 text-left"
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
                            ? "text-accent"
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
                    </div>
                  </button>

                  <Popover
                    open={activeMenuId === transaction.id}
                    onOpenChange={(isOpen) => {
                      setActiveMenuId(isOpen ? transaction.id : undefined)
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mr-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Transaction actions"
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-40 p-1">
                      <button
                        type="button"
                        className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveMenuId(undefined)
                          onDuplicateTransaction(transaction)
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Duplicate
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
})
