import { render, screen, within } from "@testing-library/react"
import { expect, it } from "vitest"
import { TransactionSummary } from "@/components/transaction-summary"
import type { Transaction } from "@/lib/types"
it("uses my share for spending, excludes transfers and reimbursements from income", () => {
  const base = {
    merchant: "Example",
    category: "food",
    date: new Date(),
    account_type_id: "1",
  }
  const transactions: Transaction[] = [
    { ...base, transaction_type: "outgoing", amount: 100, spending_amount: 25 },
    {
      ...base,
      transaction_type: "incoming",
      incoming_subtype: "income",
      amount: 200,
    },
    {
      ...base,
      transaction_type: "incoming",
      incoming_subtype: "reimbursement",
      amount: 75,
    },
    { ...base, transaction_type: "transfer", amount: 500 },
  ]
  render(<TransactionSummary transactions={transactions} strip />)
  expect(
    within(screen.getByText("Spending").parentElement!).getByText("-$25.00")
  ).toBeVisible()
  expect(
    within(screen.getByText("Income").parentElement!).getByText("+$200.00")
  ).toBeVisible()
  expect(
    within(screen.getByText("Net").parentElement!).getByText("+$175.00")
  ).toBeVisible()
})
