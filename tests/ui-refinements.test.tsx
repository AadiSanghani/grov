import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import Accounts from "@/app/accounts/page"
import TripsPage from "@/app/trips/page"
import { NetWorthCard } from "@/components/dashboard/net-worth-card"
import type { NetWorthSeriesResult } from "@/components/dashboard/net-worth-section"
import type { TripWithMetrics } from "@/lib/types"

const actions = vi.hoisted(() => ({
  accounts: vi.fn(),
  history: vi.fn(),
  trips: vi.fn(),
  createTrip: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("@/lib/accounts", () => ({ getAccounts: actions.accounts, deleteAccount: vi.fn() }))
vi.mock("@/lib/balances", () => ({ getNetWorthHistory: actions.history }))
vi.mock("@/lib/trips", () => ({ getTripsWithMetrics: actions.trips, createTrip: actions.createTrip }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: actions.replace }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("spendingRange=this_month_vs_last_year"),
}))
vi.mock("@/components/add-account-dialog", () => ({ AddAccountDialog: () => null }))
vi.mock("@/components/edit-account-dialog", () => ({
  EditAccountDialog: ({ open, account }: { open: boolean; account: { name: string } | null }) =>
    open ? <div role="dialog" aria-label={`Edit ${account?.name}`} /> : null,
}))
vi.mock("@/components/trip-dialog", () => ({
  TripDialog: ({ open, onSubmit }: { open: boolean; onSubmit: (values: { name: string; status: "planned" }) => Promise<void> }) =>
    open ? <div role="dialog" aria-label="Create trip"><button onClick={() => void onSubmit({ name: "Weekend away", status: "planned" })}>Save trip</button></div> : null,
}))
vi.mock("recharts", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Container,
    AreaChart: Container,
    Area: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  }
})

beforeEach(() => {
  actions.accounts.mockResolvedValue([])
  actions.history.mockResolvedValue([])
  actions.trips.mockResolvedValue([])
  actions.createTrip.mockResolvedValue(undefined)
})

afterEach(() => vi.restoreAllMocks())

const netWorth: NetWorthSeriesResult = {
  rangeKey: "one_month",
  points: [
    { date: "2026-11-01", label: "Nov 1", netWorth: 1000 },
    { date: "2026-11-15", label: "Nov 15", netWorth: 1450.75 },
  ],
}

it("makes the latest recorded net worth and comparison readable without a chart", () => {
  render(<NetWorthCard rangeKey="one_month" data={netWorth} />)
  expect(screen.getByRole("heading", { name: "Net worth" })).toBeInTheDocument()
  expect(screen.getByText("$1,450.75")).toBeInTheDocument()
  expect(screen.getByText("Latest recorded balance · Nov 15")).toBeInTheDocument()
  expect(screen.getByText("+$450.75").parentElement).toHaveTextContent("+$450.75 since Nov 1")
})

it("distinguishes zero balances, missing history, and loading without inventing totals", () => {
  const { rerender } = render(<NetWorthCard rangeKey="one_month" data={{ ...netWorth, points: [] }} />)
  expect(screen.getByText("—")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Add an account" })).toHaveAttribute("href", "/accounts")

  rerender(<NetWorthCard rangeKey="one_month" data={{ ...netWorth, points: [{ ...netWorth.points[0], netWorth: 0 }] }} />)
  expect(screen.getByText("$0")).toBeInTheDocument()
  expect(screen.queryByText(/since Nov/)).not.toBeInTheDocument()

  rerender(<NetWorthCard rangeKey="one_month" data={netWorth} loading />)
  expect(screen.getByLabelText("Select net worth range")).toBeDisabled()
  expect(screen.getByText("—")).toBeInTheDocument()
  expect(screen.queryByText("$1,450.75")).not.toBeInTheDocument()
})

it("labels negative net worth changes without an invalid percentage", () => {
  render(<NetWorthCard rangeKey="one_month" data={{ ...netWorth, points: netWorth.points.map((point, index) => ({ ...point, netWorth: index === 0 ? -50 : -250 })) }} />)
  expect(screen.getByText("-$250")).toBeInTheDocument()
  expect(screen.getByText("-$200")).toHaveClass("text-negative")
  expect(screen.queryByText(/NaN|Infinity|%/)).not.toBeInTheDocument()
})

it("preserves spending filters when changing the net worth period", () => {
  render(<NetWorthCard rangeKey="one_month" data={netWorth} />)
  fireEvent.click(screen.getByLabelText("Select net worth range"))
  fireEvent.click(screen.getByRole("option", { name: "6 Months" }))
  expect(actions.replace).toHaveBeenCalledWith("/?spendingRange=this_month_vs_last_year&netWorthRange=six_months", { scroll: false })
})

it("does not present unloaded trips as zero or an empty workspace", () => {
  actions.trips.mockReturnValue(new Promise(() => {}))
  const { container } = render(<TripsPage />)
  expect(screen.getByRole("status")).toHaveTextContent("Loading trips…")
  expect(Array.from(container.querySelectorAll("dd"), (element) => element.textContent)).toEqual(["—", "—", "—"])
  expect(screen.queryByRole("button", { name: "Create your first trip" })).not.toBeInTheDocument()
})

it("separates trip load failures from empty results and offers a working retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  actions.trips.mockRejectedValueOnce(new Error("Offline"))
  render(<TripsPage />)
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load your trips")
  expect(screen.queryByRole("button", { name: "Create your first trip" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Try again" }))
  const create = await screen.findByRole("button", { name: "Create your first trip" })
  fireEvent.click(create)
  expect(screen.getByRole("dialog", { name: "Create trip" })).toBeInTheDocument()
})

it("retains previously loaded trip totals when a refresh fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  const trip: TripWithMetrics = {
    id: "weekend",
    name: "Weekend away",
    status: "planned",
    metrics: { totalSpend: 125, transactionCount: 3, avgPerDay: 62.5, largestExpense: 75 },
  }
  actions.trips.mockResolvedValueOnce([trip]).mockRejectedValueOnce(new Error("Offline"))
  const { container } = render(<TripsPage />)
  await screen.findByRole("link", { name: /Weekend away/ })
  fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
  fireEvent.click(screen.getByRole("button", { name: "Save trip" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Your previous trips are still shown below")
  expect(screen.getByRole("link", { name: /Weekend away/ })).toHaveAttribute("href", "/trips/weekend")
  expect(Array.from(container.querySelectorAll("dd"), (element) => element.textContent)).toEqual(["1", "$125.00", "3"])
})

it("supports keyboard account groups and keeps edit actions separate from navigation", async () => {
  const user = userEvent.setup()
  actions.accounts.mockResolvedValue([{ id: 1, account_type: "Cash", account_name: "Everyday checking", account_subtype: "Checking", account_balance: "1234.50" }])
  render(<Accounts />)
  const accountLink = await screen.findByRole("link", { name: /Everyday checking/ })
  expect(accountLink).toHaveAttribute("href", "/accounts/1")
  expect(accountLink.querySelector("button")).toBeNull()
  expect(screen.queryByText("Just now")).not.toBeInTheDocument()

  const group = screen.getByRole("button", { name: "Cash, $1,234.50" })
  group.focus()
  await user.keyboard("{Enter}")
  expect(group).toHaveAttribute("aria-expanded", "false")
  expect(screen.queryByRole("link", { name: /Everyday checking/ })).not.toBeInTheDocument()
  await user.keyboard(" ")
  expect(group).toHaveAttribute("aria-expanded", "true")

  screen.getByRole("button", { name: "Edit Everyday checking" }).focus()
  await user.keyboard("{Enter}")
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Edit Everyday checking" })).toBeInTheDocument())
})
