import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import Transactions from "@/app/transactions/page"
import type { Transaction } from "@/lib/types"

const actions = vi.hoisted(() => ({
  get: vi.fn(),
  accounts: vi.fn(),
  categories: vi.fn(),
  remove: vi.fn(),
  duplicate: vi.fn(),
}))
vi.mock("@/lib/transactions", () => ({
  getTransactions: actions.get,
  deleteTransaction: actions.remove,
  duplicateTransaction: actions.duplicate,
}))
vi.mock("@/lib/accounts", () => ({ getAccounts: actions.accounts }))
vi.mock("@/lib/categories", () => ({ getCategories: actions.categories }))
vi.mock("@/lib/telemetry", () => ({ trackEvent: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/page-layout", () => ({
  PageLayout: ({
    children,
    action,
  }: {
    children: ReactNode
    action: ReactNode
  }) => (
    <main>
      {action}
      {children}
    </main>
  ),
}))
vi.mock("@/components/add-transaction-dialog", () => ({
  AddTransactionDialog: () => null,
}))
vi.mock("@/components/edit-transaction-dialog", () => ({
  EditTransactionDialog: () => null,
}))
const transaction: Transaction = {
  id: "1",
  merchant: "Coffee",
  amount: 100,
  spending_amount: 25,
  account_type_id: "1",
  category: "food",
  transaction_type: "outgoing",
  date: new Date(2026, 9, 31),
}
beforeEach(() => {
  actions.get.mockReset()
  actions.accounts.mockReset().mockResolvedValue([])
  actions.categories.mockReset().mockResolvedValue([])
  actions.remove.mockReset()
  window.history.replaceState(null, "", "/transactions")
})

describe("ledger loading and mutations", () => {
  it("shows an initial skeleton, an actual error and a working retry", async () => {
    let reject!: (error: Error) => void
    actions.get
      .mockReturnValueOnce(
        new Promise((_, no) => {
          reject = no
        })
      )
      .mockResolvedValueOnce([transaction])
    render(<Transactions />)
    expect(
      screen.getByRole("status", { name: "Loading transactions" })
    ).toBeVisible()
    await act(async () => reject(new Error("offline")))
    expect(screen.getByRole("alert")).toHaveTextContent("couldn’t load")
    expect(screen.queryByText("No transactions found")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await screen.findByText("Coffee")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
  it("keeps rows visible during refresh and failure without reloading reference data", async () => {
    let reject!: (error: Error) => void
    actions.get.mockResolvedValueOnce([transaction]).mockReturnValueOnce(
      new Promise((_, no) => {
        reject = no
      })
    )
    render(<Transactions />)
    await screen.findByText("Coffee")
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search transactions" }),
      { target: { value: "Coffee" } }
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh transactions" })
    )
    expect(screen.getByText("Coffee")).toBeVisible()
    expect(
      screen.getByRole("region", { name: "Transaction ledger" })
    ).toHaveAttribute("aria-busy", "true")
    await act(async () => reject(new Error("offline")))
    expect(screen.getByRole("alert")).toHaveTextContent(
      "previous results are still visible"
    )
    expect(screen.getByText("Coffee")).toBeVisible()
    expect(window.location.search).toContain("q=Coffee")
    expect(actions.accounts).toHaveBeenCalledTimes(1)
    expect(actions.categories).toHaveBeenCalledTimes(1)
  })
  it("retains a row after a failed delete", async () => {
    actions.get.mockResolvedValue([transaction])
    actions.remove.mockRejectedValue(new Error("offline"))
    render(<Transactions />)
    await screen.findByText("Coffee")
    fireEvent.click(screen.getByRole("button", { name: "Transaction actions" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    fireEvent.click(
      screen.getByRole("button", { name: "Delete", hidden: false })
    )
    await waitFor(() => expect(actions.remove).toHaveBeenCalledTimes(1))
    expect(screen.getByText("Coffee")).toBeVisible()
  })
})
