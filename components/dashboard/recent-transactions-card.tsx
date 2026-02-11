"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ChevronRight } from "lucide-react"

import { DashboardCard } from "@/components/dashboard-card"
import { cn, findCategoryByValue, getSpendingAmount } from "@/lib/utils"
import type { Transaction } from "@/lib/types"
import type { Category } from "@/lib/categories"
import type { Account } from "@/lib/accounts"

interface RecentTransactionsCardProps {
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  loading?: boolean
}

function accountName(accounts: Account[], id: string): string {
  const a = accounts.find((acc) => acc.id?.toString() === id)
  return a?.account_name ?? id
}

export function RecentTransactionsCard({
  transactions,
  categories,
  accounts,
  loading,
}: RecentTransactionsCardProps) {
  if (loading) {
    return (
      <DashboardCard
        title="Recent Transactions"
        actions={
          <Link
            href="/transactions"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        }
      >
        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
          Loading...
        </div>
      </DashboardCard>
    )
  }

  return (
    <DashboardCard
      title="Recent Transactions"
      actions={
        <Link
          href="/transactions"
          className="text-sm font-medium text-primary hover:underline"
        >
          View all
        </Link>
      }
    >
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-xs text-muted-foreground">No transactions yet.</p>
          <Link
            href="/transactions"
            className="mt-1 text-xs font-medium text-primary hover:underline"
          >
            Add your first transaction
          </Link>
        </div>
      ) : (
        <ul className="space-y-1">
          {transactions.map((transaction) => {
            const isTransfer = transaction.transaction_type === "transfer"
            const categoryInfo = findCategoryByValue(categories, transaction.category)
            const transferLabel =
              isTransfer && transaction.to_account_type_id
                ? `${accountName(accounts, transaction.account_type_id)} → ${accountName(accounts, transaction.to_account_type_id)}`
                : null
            const date =
              transaction.date instanceof Date
                ? transaction.date
                : new Date(transaction.date as unknown as string)

            return (
              <li key={transaction.id}>
                <Link
                  href="/transactions"
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {isTransfer
                        ? transferLabel ?? transaction.merchant
                        : transaction.merchant}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {!isTransfer && categoryInfo && (
                        <>
                          <span>{categoryInfo.emoji}</span>
                          <span>{categoryInfo.label}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>{format(date, "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        transaction.transaction_type === "incoming"
                          ? "text-green-600 dark:text-green-400"
                          : "text-foreground",
                      )}
                    >
                      {transaction.transaction_type === "incoming" ? "+" : ""}$
                      {(transaction.transaction_type === "outgoing"
                        ? getSpendingAmount(transaction)
                        : transaction.amount
                      ).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardCard>
  )
}
