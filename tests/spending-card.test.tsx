import { cloneElement, type ReactElement, type ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import Home from "@/app/page"
import { SpendingCard, SpendingChangesCard } from "@/components/dashboard/spending-card"
import type { SpendingSeriesResult } from "@/lib/spending"

const navigation = vi.hoisted(() => ({ replace: vi.fn() }))
const actions = vi.hoisted(() => ({ spending: vi.fn() }))
vi.mock("@/lib/spending", () => ({ getSpendingSeries: actions.spending }))
vi.mock("@/components/page-layout", () => ({ PageLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("@/components/dashboard/net-worth-section", () => ({ DashboardNetWorthSection: () => <div data-testid="net-worth">Net worth</div> }))
vi.mock("@/components/dashboard/recent-transactions-section", () => ({ DashboardRecentTransactionsSection: () => <div>Recent activity</div> }))
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("netWorthRange=last_year"),
}))
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 480, height: 240 }),
  }
})

function spendingData(): SpendingSeriesResult {
  return {
    rangeKey: "this_month_vs_last_month",
    current: {
      label: "November 2026", total: 120,
      points: [50, 50, 120].map((amount, index) => ({ date: `2026-11-0${index + 1}`, label: `Nov ${index + 1}`, amount })),
    },
    comparison: {
      label: "October 2026", total: 100,
      points: [20, 60, 100].map((amount, index) => ({ date: `2026-10-0${index + 1}`, label: `Oct ${index + 1}`, amount })),
    },
    categoryChanges: [
      { category: "food-delivery", label: "Food Delivery", current: 100, comparison: 50, difference: 50 },
      { category: "groceries", label: "Groceries", current: 20, comparison: 50, difference: -30 },
    ],
  }
}

function SpendingCards({ data, loading }: { data: SpendingSeriesResult; loading?: boolean }) {
  return (
    <>
      <SpendingChangesCard data={data} loading={loading} />
      <SpendingCard rangeKey="this_month_vs_last_month" data={data} loading={loading} />
    </>
  )
}

beforeEach(() => {
  navigation.replace.mockClear()
  actions.spending.mockResolvedValue(spendingData())
})

it("shows a cumulative day-aligned chart, matched spending summary, and linked category changes", () => {
  const { container } = render(<SpendingCards data={spendingData()} />)

  expect(screen.getByText("Spending pace")).toBeInTheDocument()
  expect(screen.getByText("$120", { selector: "p" })).toBeInTheDocument()
  expect(screen.getByText(/\$20 more \(20%\) than October 2026/)).toBeInTheDocument()
  expect(screen.getByText("Day 1")).toBeInTheDocument()
  expect(screen.getByText("Day 3")).toBeInTheDocument()
  expect(screen.queryByText("Day 4")).not.toBeInTheDocument()
  expect(container.querySelectorAll(".recharts-line")).toHaveLength(2)
  expect(screen.getByRole("heading", { name: "What changed?" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /Food Delivery: \$50 more/ })).toHaveAttribute("href", "/transactions?category=food-delivery&from=2026-11-01&to=2026-11-03")
  expect(screen.getByRole("link", { name: /Groceries: \$30 less/ })).toBeInTheDocument()
})

it("uses the matched cutoff for the delta and drill-down when the previous month is shorter", () => {
  const data = spendingData()
  data.comparison!.points = data.comparison!.points.slice(0, 2)
  data.comparison!.total = 60
  render(<SpendingCards data={data} />)

  expect(screen.getByText(/\$10 less \(16.7%\) than October 2026/)).toBeInTheDocument()
  expect(screen.getByText(/Comparison stops at day 2/)).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /Food Delivery/ })).toHaveAttribute("href", "/transactions?category=food-delivery&from=2026-11-01&to=2026-11-02")
})

it("does not invent a percentage when the comparison has no spending", () => {
  const data = spendingData()
  data.comparison!.total = 0
  data.comparison!.points.forEach((point) => { point.amount = 0 })
  render(<SpendingCard rangeKey="this_month_vs_last_month" data={data} />)

  expect(screen.getByText(/\$120 more than October 2026/)).toBeInTheDocument()
  expect(screen.queryByText(/Infinity|NaN/)).not.toBeInTheDocument()
})

it("shows loading and empty states for both views", () => {
  const data = spendingData()
  const { rerender } = render(<SpendingCards data={data} loading />)
  expect(screen.queryByRole("link", { name: /Food Delivery/ })).not.toBeInTheDocument()
  expect(screen.getByLabelText("Select spending time range")).toBeDisabled()
  data.current.total = 0
  data.current.points = []
  data.comparison = undefined
  data.categoryChanges = []
  rerender(<SpendingCards data={data} />)
  expect(screen.getByText(/No spending data yet/)).toBeInTheDocument()
  expect(screen.getByText(/Category changes will appear/)).toBeInTheDocument()
})

it("distinguishes unchanged categories from having no spending", () => {
  const data = spendingData()
  data.categoryChanges = []
  render(<SpendingChangesCard data={data} />)
  expect(screen.getByText("No category spending changes for this period.")).toBeInTheDocument()
})

it("preserves other dashboard filters when changing the spending comparison", () => {
  render(<SpendingCard rangeKey="this_month_vs_last_month" data={spendingData()} />)
  fireEvent.click(screen.getByLabelText("Select spending time range"))
  fireEvent.click(screen.getByRole("option", { name: "vs. 3-month average" }))
  expect(navigation.replace).toHaveBeenCalledWith("/?netWorthRange=last_year&spendingRange=this_month_vs_last_3_months", { scroll: false })
})

it("keeps category changes outside the pace card", () => {
  const { container, rerender } = render(<SpendingCard rangeKey="this_month_vs_last_month" data={spendingData()} />)
  expect(screen.queryByText("What changed?")).not.toBeInTheDocument()
  expect(screen.queryByRole("link")).not.toBeInTheDocument()
  rerender(<SpendingChangesCard data={spendingData()} />)
  expect(screen.queryByText("Spending pace")).not.toBeInTheDocument()
  expect(container.querySelector(".recharts-wrapper")).not.toBeInTheDocument()
})

it("places net worth and category changes above a full-width pace card while sharing one request", async () => {
  render(await Home({}))
  await screen.findByRole("link", { name: /Food Delivery/ })

  const netWorth = screen.getByTestId("net-worth")
  const grid = netWorth.parentElement!
  expect(grid).toHaveClass("grid-cols-1", "lg:grid-cols-2", "items-stretch")
  expect(grid.children).toHaveLength(3)
  expect(grid.children[0]).toBe(netWorth)
  expect(grid.children[1]).toContainElement(screen.getByRole("heading", { name: "What changed?" }))
  expect(grid.children[2]).toContainElement(screen.getByText("Spending pace"))
  expect(grid.children[2]).toHaveClass("lg:col-span-2")
  expect(actions.spending).toHaveBeenCalledTimes(1)
})

it("preserves the three-card layout during loading", async () => {
  actions.spending.mockReturnValue(new Promise(() => {}))
  render(await Home({}))

  const grid = screen.getByTestId("net-worth").parentElement!
  expect(grid.children).toHaveLength(3)
  expect(grid.children[1]).toHaveAttribute("aria-busy", "true")
  expect(grid.children[2]).toHaveClass("lg:col-span-2")
  expect(screen.getByLabelText("Select spending time range")).toBeDisabled()
})

it("keeps both spending error cards in place and retries their shared request", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
  actions.spending.mockRejectedValueOnce(new Error("Read failed"))
  try {
    render(await Home({}))
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2))
    const grid = screen.getByTestId("net-worth").parentElement!
    expect(grid.children).toHaveLength(3)
    expect(grid.children[1]).toContainElement(screen.getByText("What changed?"))
    expect(grid.children[2]).toContainElement(screen.getByText("Spending pace"))
    expect(grid.children[2]).toHaveClass("lg:col-span-2")
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0])
    await screen.findByRole("link", { name: /Food Delivery/ })
    expect(actions.spending).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  } finally {
    consoleError.mockRestore()
  }
})
