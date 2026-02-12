import { Suspense } from "react"

import { RecentTransactionsCard } from "./recent-transactions-card"
import { getTransactions } from "@/lib/transactions"
import { getCategories } from "@/lib/categories"
import { getAccounts } from "@/lib/accounts"

const RECENT_LIMIT = 10

async function RecentTransactionsSectionInner() {
  try {
    const [transactions, categories, accounts] = await Promise.all([
      getTransactions(),
      getCategories(),
      getAccounts(),
    ])

    const recent = (transactions ?? []).slice(0, RECENT_LIMIT)

    return (
      <RecentTransactionsCard
        transactions={recent}
        categories={categories ?? []}
        accounts={accounts ?? []}
      />
    )
  } catch (error) {
    console.error("Failed to load recent transactions for dashboard:", error)
    return (
      <RecentTransactionsCard
        transactions={[]}
        categories={[]}
        accounts={[]}
      />
    )
  }
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
