import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AddTransactionDialog } from "@/components/add-transaction-dialog"
import { EditTransactionDialog } from "@/components/edit-transaction-dialog"
import type { Account } from "@/lib/accounts"
import type { Transaction } from "@/lib/types"

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  deductions: vi.fn(),
  addMerchant: vi.fn(),
}))
vi.mock("@/lib/transactions", () => ({
  createTransaction: actions.create,
  updateTransaction: actions.update,
}))
vi.mock("@/lib/deductions", () => ({
  getDeductionsByTransactionId: actions.deductions,
}))
vi.mock("@/app/data-context", () => ({
  useDataContext: () => ({
    merchants: [{ name: "Coffee" }, { name: "Costco" }],
    addMerchant: actions.addMerchant,
  }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const accounts: Account[] = [1, 2].map((id) => ({
  id,
  account_name: id === 1 ? "Checking" : "Savings",
  account_type: "Bank",
  account_balance: "100",
  account_subtype: "Checking",
  category: "asset",
}))
const categories = [
  { id: 1, name: "Dining Out", emoji: "", group_name: "Food" },
]
const transaction: Transaction = {
  id: "10",
  transaction_type: "outgoing",
  amount: 100,
  spending_amount: 40,
  merchant: "Coffee",
  category: "dining-out",
  account_type_id: "1",
  date: new Date(2026, 9, 31),
  notes: "shared lunch",
  affects_balance: true,
  trip_id: "trip-1",
  source_type: "trip_shared_expense",
}
const props = { accounts, categories, open: true, onOpenChange: vi.fn() }
beforeEach(() => {
  actions.create.mockReset()
  actions.update.mockReset()
  actions.deductions.mockReset().mockResolvedValue([])
  actions.addMerchant.mockResolvedValue({ name: "new" })
})
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: Error) => void
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe("transaction editor", () => {
  it("keeps edits local until success, rejects repeated shortcuts, and retains the draft after failure", async () => {
    const pending = deferred()
    actions.update
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({})
    const updated = vi.fn()
    render(
      <EditTransactionDialog
        {...props}
        transaction={transaction}
        onTransactionUpdated={updated}
      />
    )
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "new draft" },
    })
    const date = screen.getByLabelText("Date")
    fireEvent.change(date, { target: { value: "25/12/2026" } })
    fireEvent.keyDown(date, { key: "Enter", ctrlKey: true })
    fireEvent.keyDown(date, { key: "Enter", ctrlKey: true })
    fireEvent.keyDown(date, { key: "Enter", ctrlKey: true, repeat: true })
    expect(actions.update).toHaveBeenCalledTimes(1)
    expect(updated).not.toHaveBeenCalled()
    expect(actions.update).toHaveBeenCalledWith(
      "10",
      expect.objectContaining({
        date: "2026-12-25",
        spending_amount: 40,
        notes: "new draft",
        trip_id: "trip-1",
        affects_balance: true,
      })
    )
    await act(async () => pending.reject(new Error("offline")))
    expect(screen.getByRole("alert")).toHaveTextContent("Your draft is intact")
    expect(screen.getByLabelText("Notes")).toHaveValue("new draft")
    expect(updated).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() =>
      expect(updated).toHaveBeenCalledWith(
        "10",
        expect.objectContaining({
          notes: "new draft",
          spending_amount: 40,
          to_account_type_id: null,
        })
      )
    )
  })

  it("preserves typed combobox prefixes, arrows/Enter, nested Escape, and focus restoration", async () => {
    const user = userEvent.setup()
    render(<AddTransactionDialog {...props} />)
    const merchant = screen.getByRole("combobox", { name: "Merchant" })
    merchant.focus()
    await user.keyboard("Co")
    const input = screen.getByPlaceholderText("Search merchants…")
    expect(input).toHaveValue("Co")
    expect(input).toHaveFocus()
    await user.keyboard("{ArrowDown}{Enter}")
    expect(merchant).toHaveFocus()
    const account = screen.getByRole("combobox", { name: "Account" })
    account.focus()
    await user.keyboard("Ch")
    expect(screen.getByPlaceholderText("Search accounts…")).toHaveValue("Ch")
    await user.keyboard("{Enter}")
    expect(account).toHaveTextContent("Checking")
    expect(account).toHaveFocus()
    await user.tab()
    const category = screen.getByRole("combobox", { name: "Category" })
    expect(category).toHaveFocus()
    await user.keyboard("Di")
    expect(screen.getByPlaceholderText("Search categories…")).toHaveValue("Di")
    await user.keyboard("{Escape}")
    expect(category).toHaveFocus()
    expect(
      screen.getByRole("dialog", { name: "Add transaction" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "TRANSFER" }))
    const to = screen.getByRole("combobox", { name: "To account" })
    to.focus()
    await user.keyboard("Sa")
    expect(screen.getByPlaceholderText("Search accounts…")).toHaveValue("Sa")
    await user.keyboard("{Enter}")
    expect(to).toHaveTextContent("Savings")
  })

  it("creates once with the entered date and share, then clears financial details for add another", async () => {
    const user = userEvent.setup()
    const pending = deferred()
    actions.create.mockReturnValue(pending.promise)
    const created = vi.fn()
    render(<AddTransactionDialog {...props} onTransactionCreated={created} />)
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "100" },
    })
    fireEvent.change(screen.getByLabelText("My share"), {
      target: { value: "40" },
    })
    screen.getByRole("combobox", { name: "Account" }).focus()
    await user.keyboard("Ch{Enter}")
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "25/12/2026" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Save and add another" })
    )
    expect(actions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        spending_amount: 40,
        date: "2026-12-25",
        account_type_id: "1",
      })
    )
    fireEvent.keyDown(screen.getByLabelText("Date"), {
      key: "Enter",
      ctrlKey: true,
    })
    expect(actions.create).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve({ id: "created-1" }))
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({ id: "created-1", spending_amount: 40 })
    )
    expect(screen.getByLabelText("Amount")).toHaveValue("$")
    expect(screen.getByLabelText("My share")).toHaveValue("$")
    expect(screen.getByLabelText("Date")).toHaveValue("25/12/2026")
    expect(screen.getByRole("combobox", { name: "Account" })).toHaveTextContent(
      "Checking"
    )
    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveFocus())
  })

  it("blocks saves when payroll deductions fail to load, and preserves reimbursement subtype", async () => {
    const user = userEvent.setup()
    actions.deductions
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([])
    actions.update.mockResolvedValue({})
    render(
      <EditTransactionDialog
        {...props}
        transaction={{
          ...transaction,
          transaction_type: "incoming",
          incoming_subtype: "reimbursement",
        }}
        onTransactionUpdated={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Retry before saving")
    )
    fireEvent.keyDown(screen.getByLabelText("Date"), {
      key: "Enter",
      ctrlKey: true,
    })
    expect(actions.update).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Retry deductions" }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()
    )
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(actions.update).toHaveBeenCalledWith(
      "10",
      expect.objectContaining({
        incoming_subtype: "reimbursement",
        spending_amount: null,
      })
    )
  })
})
