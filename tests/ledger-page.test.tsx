import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import Transactions from "@/app/transactions/page"
import type { Transaction } from "@/lib/types"
import type { LedgerPage } from "@/lib/ledger/pagination"

const actions = vi.hoisted(() => ({
  get: vi.fn(),
  accounts: vi.fn(),
  categories: vi.fn(),
  remove: vi.fn(),
  duplicate: vi.fn(),
}))
vi.mock("@/lib/transactions", () => ({
  getTransactionPage: actions.get,
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
  AddTransactionDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Add transaction" /> : null,
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
function pageResult(rows = [transaction], page = 1, totalCount = rows.length): LedgerPage {
  return {
    transactions: rows,
    page,
    pageSize: 50,
    totalCount,
    summary: {
      totalTransactions: totalCount,
      totalIncome: 1000,
      totalSpending: 25,
      largestIncome: 1000,
      largestExpense: 25,
      averageTransaction: 1025 / Math.max(1, totalCount),
      net: 975,
    },
  }
}
beforeEach(() => {
  actions.get.mockReset()
  actions.accounts.mockReset().mockResolvedValue([])
  actions.categories.mockReset().mockResolvedValue([])
  actions.remove.mockReset()
  window.history.replaceState(null, "", "/transactions")
})

describe("ledger loading and mutations", () => {
  it("enables the N shortcut only after the editor reference data loads", async () => {
    let resolve!: (rows: LedgerPage) => void
    actions.get.mockReturnValueOnce(new Promise<LedgerPage>(yes => { resolve = yes }))
    render(<Transactions />)
    fireEvent.keyDown(window, { key: "n" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await act(async () => resolve(pageResult()))
    await screen.findByText("Coffee")
    fireEvent.keyDown(window, { key: "n" })
    expect(screen.getByRole("dialog", { name: "Add transaction" })).toBeInTheDocument()
  })

  it("shows an initial skeleton, an actual error and a working retry", async () => {
    let reject!: (error: Error) => void
    actions.get
      .mockReturnValueOnce(
        new Promise((_, no) => {
          reject = no
        })
      )
      .mockResolvedValueOnce(pageResult())
    render(<Transactions />)
    expect(
      screen.getByRole("status", { name: "Loading transactions" })
    ).toBeVisible()
    await waitFor(() => expect(actions.get).toHaveBeenCalledTimes(1))
    await act(async () => reject(new Error("offline")))
    expect(screen.getByRole("alert")).toHaveTextContent("couldn’t load")
    expect(screen.queryByText("No transactions found")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await screen.findByText("Coffee")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
  it("keeps rows visible during refresh and failure without reloading reference data", async () => {
    let reject!: (error: Error) => void
    actions.get.mockResolvedValueOnce(pageResult()).mockReturnValueOnce(
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
    await waitFor(() => expect(actions.get).toHaveBeenCalledTimes(2))
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
    actions.get.mockResolvedValue(pageResult())
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

  it("loads only the next page, retains rows while pending, and uses totals for every match", async () => {
    let resolve!: (value: LedgerPage) => void
    actions.get.mockResolvedValueOnce(pageResult([transaction], 1, 60)).mockReturnValueOnce(
      new Promise<LedgerPage>(yes => { resolve = yes })
    )
    render(<Transactions />)
    await screen.findByText("Coffee")
    expect(screen.getByText("+$1,000.00")).toBeVisible()
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()
    screen.getByRole("button", { name: "Next page" }).focus()
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    await waitFor(() => expect(actions.get).toHaveBeenCalledWith(expect.anything(), 2))
    expect(screen.getByText("Coffee")).toBeVisible()
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
    await act(async () => resolve(pageResult([{ ...transaction, id: "2", merchant: "Dinner" }], 2, 60)))
    await screen.findByText("Dinner")
    expect(screen.getByText(/Page 2 of 2/)).toHaveFocus()
    expect(screen.queryByText("Coffee")).not.toBeInTheDocument()
    expect(screen.getByText(/Page 2 of 2/)).toBeVisible()
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled()
    expect(actions.accounts).toHaveBeenCalledTimes(1)
    expect(window.location.search).toContain("page=2")
  })

  it("debounces search, resets the page, and ignores obsolete responses", async () => {
    window.history.replaceState(null, "", "/transactions?page=2")
    let resolveOld!: (value: LedgerPage) => void
    actions.get.mockResolvedValueOnce(pageResult([transaction], 2, 60))
      .mockReturnValueOnce(new Promise<LedgerPage>(yes => { resolveOld = yes }))
      .mockResolvedValueOnce(pageResult([{ ...transaction, merchant: "Newest match" }]))
    render(<Transactions />)
    await screen.findByText("Coffee")
    const search = screen.getByRole("searchbox", { name: "Search transactions" })
    fireEvent.change(search, { target: { value: "C" } })
    fireEvent.change(search, { target: { value: "Co" } })
    fireEvent.change(search, { target: { value: "Coffee" } })
    expect(actions.get).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(actions.get).toHaveBeenCalledTimes(2))
    expect(actions.get).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Coffee" }), 1)
    expect(window.location.search).not.toContain("page=")
    fireEvent.change(search, { target: { value: "Newest" } })
    await screen.findByText("Newest match")
    await act(async () => resolveOld(pageResult([{ ...transaction, merchant: "Obsolete match" }])))
    expect(screen.queryByText("Obsolete match")).not.toBeInTheDocument()
    expect(screen.getByText("Newest match")).toBeVisible()
  })

  it("refreshes the current page without clearing rows", async () => {
    actions.get.mockResolvedValue(pageResult([transaction], 2, 60))
    window.history.replaceState(null, "", "/transactions?page=2")
    render(<Transactions />)
    await screen.findByText("Coffee")
    fireEvent.click(screen.getByRole("button", { name: "Refresh transactions" }))
    await waitFor(() => expect(actions.get).toHaveBeenCalledTimes(2))
    expect(actions.get).toHaveBeenLastCalledWith(expect.anything(), 2)
    expect(screen.getByText("Coffee")).toBeVisible()
  })
})
