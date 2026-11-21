import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { TransactionList } from "@/components/transaction-list"
import { RecentTransactionsCard } from "@/components/dashboard/recent-transactions-card"
import type { Category } from "@/lib/categories"
import type { Transaction } from "@/lib/types"

const categories: Category[] = [{ name: "Dining Out", emoji: "🍽️", group_name: "Food" }]
const transaction: Transaction = {
  id: "emoji-transaction",
  merchant: "Lunch",
  category: "dining-out",
  transaction_type: "outgoing",
  amount: 25,
  account_type_id: null,
  date: new Date(2026, 10, 21),
}

it.each(["ledger", "dashboard"])("shows category emojis with readable labels in the %s", (view) => {
  render(view === "ledger"
    ? <TransactionList transactions={[transaction]} categories={categories} onTransactionClick={vi.fn()} onDuplicateTransaction={vi.fn()} />
    : <RecentTransactionsCard transactions={[transaction]} categories={categories} accounts={[]} />)

  expect(screen.getByText("Dining Out")).toBeInTheDocument()
  expect(screen.getByText("🍽️")).toHaveAttribute("aria-hidden", "true")
})
