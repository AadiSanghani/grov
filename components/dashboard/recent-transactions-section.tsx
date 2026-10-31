import { Suspense } from "react"
import { DashboardReadError } from "./read-error"

import { RecentTransactionsCard } from "./recent-transactions-card"
import { getRecentTransactions } from "@/lib/transactions"
import { getCategories } from "@/lib/categories"
import { getAccounts } from "@/lib/accounts"

async function RecentTransactionsSectionInner() {
  const result = await Promise.all([
    getRecentTransactions(),
    getCategories(),
    getAccounts(),
  ]).catch((error) => {
    console.error("Failed to load recent transactions for dashboard:", error)
    return null
  })
  if (!result) return <DashboardReadError title="Recent transactions" />
  const [transactions, categories, accounts] = result
  return (
    <RecentTransactionsCard
      transactions={transactions}
      categories={categories ?? []}
      accounts={accounts ?? []}
    />
  )
}

export function DashboardRecentTransactionsSection() {
  return (
    <Suspense
      fallback={
        <RecentTransactionsCard
          transactions={[]}
          categories={[]}
          accounts={[]}
          loading
        />
      }
    >
      <RecentTransactionsSectionInner />
    </Suspense>
  )
}
