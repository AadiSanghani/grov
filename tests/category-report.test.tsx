import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { cloneElement, type ReactElement } from "react"
import { beforeEach, expect, it, vi } from "vitest"
import { CategoryReport } from "@/components/reports/category-report"
import type { Transaction } from "@/lib/types"

const actions = vi.hoisted(() => ({ transactions: vi.fn(), categories: vi.fn(), accounts: vi.fn() }))
vi.mock("@/lib/transactions", () => ({ getTransactionsInRange: actions.transactions }))
vi.mock("@/lib/categories", () => ({ getCategories: actions.categories }))
vi.mock("@/lib/accounts", () => ({ getAccounts: actions.accounts }))
vi.mock("@/app/reports/context", () => ({ useReportsContext: () => ({ startDate: "2026-10-01", endDate: "2026-10-31" }) }))
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 480, height: 320 }),
  }
})

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "1",
    merchant: "Example",
    category: "groceries",
    date: new Date("2026-10-20T12:00:00Z"),
    account_type_id: "cash",
    transaction_type: "outgoing",
    amount: 20,
    ...overrides,
  }
}

beforeEach(() => {
  window.history.replaceState(null, "", "/reports/spending")
  actions.categories.mockResolvedValue([
    { name: "Groceries", emoji: "", group_name: "Food" },
    { name: "Rent", emoji: "", group_name: "Housing" },
    { name: "Paychecks", emoji: "", group_name: "Income" },
    { name: "Dividends", emoji: "", group_name: "Income" },
  ])
  actions.accounts.mockResolvedValue([
    { id: "cash", account_name: "Checking", account_type: "Cash", category: "asset" },
    { id: "investments", account_name: "Portfolio", account_type: "Investments", category: "asset" },
  ])
})

it("opens an overview category link and clears the transaction filter", async () => {
  window.history.replaceState(null, "", "/reports/spending?category=groceries")
  actions.transactions.mockResolvedValue([
    transaction({ id: "1", merchant: "Market", spending_amount: 12 }),
    transaction({ id: "2", merchant: "Landlord", category: "rent", amount: 500 }),
  ])

  render(<CategoryReport kind="spending" />)
  const categoryPanel = await screen.findByRole("region", { name: "Spending by category" })
  const chart = within(categoryPanel).getByRole("group", { name: "Spending distribution pie chart" })
  expect(chart).toBeVisible()
  expect(within(chart).getByText("Rent")).toBeVisible()
  expect(within(chart).getByText("Groceries")).toBeVisible()
  expect(within(categoryPanel).getByRole("heading", { name: "Category breakdown" })).toBeVisible()
  const selected = await screen.findByRole("region", { name: "Groceries transactions" })
  expect(within(selected).getByText("Market")).toBeVisible()
  expect(within(selected).queryByText("Landlord")).not.toBeInTheDocument()
  const slices = document.querySelectorAll(".recharts-pie-sector path")
  expect(slices).toHaveLength(2)
  fireEvent.click(slices[0])
  expect(within(screen.getByRole("region", { name: "Rent transactions" })).getByText("Landlord")).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "Clear filter" }))
  await waitFor(() => expect(screen.getByRole("region", { name: "Recent transactions" })).toBeVisible())
  expect(screen.getByText("Landlord")).toBeVisible()
  expect(window.location.search).toBe("")
})

it("keeps direct investment deposits out of the income breakdown", async () => {
  window.history.replaceState(null, "", "/reports/income")
  actions.transactions.mockResolvedValue([
    transaction({ id: "1", merchant: "Employer", category: "paychecks", transaction_type: "incoming", incoming_subtype: "income", amount: 1000 }),
    transaction({ id: "2", merchant: "Broker", category: "dividends", transaction_type: "incoming", incoming_subtype: "income", account_type_id: "investments", amount: 200 }),
  ])

  render(<CategoryReport kind="income" />)
  const categoryPanel = await screen.findByRole("region", { name: "Income by category" })
  const chart = within(categoryPanel).getByRole("group", { name: "Income distribution pie chart" })
  expect(chart).toBeVisible()
  expect(within(chart).getByText("Paychecks")).toBeVisible()
  expect(within(categoryPanel).getByRole("heading", { name: "Category breakdown" })).toBeVisible()
  await waitFor(() => expect(screen.getByText("Employer")).toBeVisible())
  expect(screen.queryByText("Broker")).not.toBeInTheDocument()
  expect(screen.getByText("Total income").nextElementSibling).toHaveTextContent("$1,000.00")
})
