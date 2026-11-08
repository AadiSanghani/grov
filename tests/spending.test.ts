import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { getSpendingSeries } from "@/lib/spending"
import { getTransactionsInRange } from "@/lib/transactions"
import { getCategories } from "@/lib/categories"
import type { Transaction } from "@/lib/types"

vi.mock("@/lib/transactions", () => ({
  getTransactionsInRange: vi.fn(),
}))

vi.mock("@/lib/categories", () => ({ getCategories: vi.fn() }))

function transaction(date: string, amount: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    date: new Date(`${date}T12:00:00`),
    amount,
    merchant: "Example",
    category: "groceries",
    transaction_type: "outgoing",
    account_type_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-01T01:00:00Z"))
  vi.mocked(getTransactionsInRange).mockResolvedValue([])
  vi.mocked(getCategories).mockResolvedValue([
    { name: "Groceries", emoji: "", group_name: "Food" },
    { name: "Food Delivery", emoji: "", group_name: "Food" },
  ])
})

afterEach(() => {
  vi.useRealTimers()
})

it("uses the browser's October date even after the server clock reaches November", async () => {
  const series = await getSpendingSeries("this_month_vs_last_month", "2026-10-31")

  expect(series.current.label).toBe("October 2026")
  expect(series.comparison?.label).toBe("September 2026")
  expect(getTransactionsInRange).toHaveBeenCalledWith("2026-10-01", "2026-10-31")
  expect(getTransactionsInRange).toHaveBeenCalledWith("2026-09-01", "2026-09-30")
})

it("moves to November when the browser's date reaches November", async () => {
  const series = await getSpendingSeries("this_month_vs_last_month", "2026-11-01")

  expect(series.current.label).toBe("November 2026")
  expect(getTransactionsInRange).toHaveBeenCalledWith("2026-11-01", "2026-11-01")
  expect(getTransactionsInRange).toHaveBeenCalledWith("2026-10-01", "2026-10-01")
})

it("rejects malformed browser dates", async () => {
  await expect(getSpendingSeries("this_month_vs_last_month", "2026-11-31"))
    .rejects.toThrow("Invalid local date")
  expect(getTransactionsInRange).not.toHaveBeenCalled()
  expect(getCategories).not.toHaveBeenCalled()
})

it("fills every elapsed day with cumulative spending and excludes future spending, transfers, and income", async () => {
  vi.mocked(getTransactionsInRange).mockImplementation(async (start) => start === "2026-11-01" ? [
    transaction("2026-11-01", 100, { spending_amount: 30 }),
    transaction("2026-11-01", 20),
    transaction("2026-11-03", 10),
    transaction("2026-11-04", 900),
    transaction("2026-10-31", 900),
    transaction("2026-11-02", 1000, { transaction_type: "incoming" }),
    transaction("2026-11-02", 1000, { transaction_type: "transfer" }),
    transaction("2026-11-02", 1000, { spending_amount: 0 }),
  ] : [transaction("2026-10-02", 80)])

  const series = await getSpendingSeries("this_month_vs_last_month", "2026-11-03")

  expect(series.current.points.map((point) => point.amount)).toEqual([50, 50, 60])
  expect(series.current.points.map((point) => point.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"])
  expect(series.current.total).toBe(60)
  expect(series.comparison?.points.map((point) => point.amount)).toEqual([0, 80, 80])
  expect(series.comparison?.total).toBe(80)
  expect(series.categoryChanges).toEqual([
    { category: "groceries", label: "Groceries", current: 60, comparison: 80, difference: -20 },
  ])
  expect(getTransactionsInRange).toHaveBeenCalledWith("2026-10-01", "2026-10-03")
})

it("includes new and disappeared categories, orders by absolute change, and limits the breakdown to five", async () => {
  vi.mocked(getTransactionsInRange).mockImplementation(async (start) => start === "2026-11-01" ? [
    transaction("2026-11-01", 220, { category: "food-delivery" }),
    transaction("2026-11-01", 100),
    transaction("2026-11-01", 10, { category: "other" }),
    transaction("2026-11-01", 20, { category: "travel" }),
    transaction("2026-11-01", 30, { category: "insurance" }),
    transaction("2026-11-01", 40, { category: "work" }),
    transaction("2026-11-01", 5, { category: "unchanged" }),
  ] : [
    transaction("2026-10-01", 300, { category: "shopping" }),
    transaction("2026-10-01", 50),
    transaction("2026-10-01", 5, { category: "unchanged" }),
  ])

  const series = await getSpendingSeries("this_month_vs_last_month", "2026-11-07")

  expect(series.categoryChanges.map((category) => [category.category, category.difference])).toEqual([
    ["shopping", -300], ["food-delivery", 220], ["groceries", 50], ["work", 40], ["insurance", 30],
  ])
  expect(series.categoryChanges[0]).toMatchObject({ current: 0, comparison: 300 })
  expect(series.categoryChanges[1].label).toBe("Food Delivery")
})

it("matches shorter months without hiding current-month spending after the comparison cutoff", async () => {
  vi.mocked(getTransactionsInRange).mockImplementation(async (start) => start === "2026-03-01" ? [
    transaction("2026-03-28", 50),
    transaction("2026-03-31", 1000),
  ] : [transaction("2026-02-28", 40)])

  const series = await getSpendingSeries("this_month_vs_last_month", "2026-03-31")

  expect(getTransactionsInRange).toHaveBeenCalledWith("2026-02-01", "2026-02-28")
  expect(series.current.points).toHaveLength(31)
  expect(series.current.total).toBe(1050)
  expect(series.comparison?.points).toHaveLength(28)
  expect(series.categoryChanges[0]).toMatchObject({ current: 50, comparison: 40, difference: 10 })
})

it("compares leap years only through days present in both years", async () => {
  const series = await getSpendingSeries("this_month_vs_last_year", "2024-02-29")

  expect(series.current.points).toHaveLength(29)
  expect(series.comparison?.label).toBe("February 2023")
  expect(series.comparison?.points).toHaveLength(28)
  expect(getTransactionsInRange).toHaveBeenCalledWith("2023-02-01", "2023-02-28")
})

it("averages matching days in each of the last three months, including months with no spending", async () => {
  vi.mocked(getTransactionsInRange).mockImplementation(async (start) => {
    if (start === "2026-11-01") return [transaction("2026-11-02", 90)]
    if (start === "2026-10-01") return [transaction("2026-10-01", 30)]
    if (start === "2026-09-01") return [transaction("2026-09-02", 90)]
    return []
  })

  const series = await getSpendingSeries("this_month_vs_last_3_months", "2026-11-07")

  expect(getTransactionsInRange).toHaveBeenCalledTimes(4)
  for (const month of ["08", "09", "10"]) {
    expect(getTransactionsInRange).toHaveBeenCalledWith(`2026-${month}-01`, `2026-${month}-07`)
  }
  expect(series.comparison?.label).toBe("3-month average")
  expect(series.comparison?.points.map((point) => point.amount)).toEqual([10, 40, 40, 40, 40, 40, 40])
  expect(series.comparison?.total).toBe(40)
  expect(series.categoryChanges[0]).toMatchObject({ current: 90, comparison: 40, difference: 50 })
})

it("uses the common day cutoff across a three-month baseline", async () => {
  const series = await getSpendingSeries("this_month_vs_last_3_months", "2026-05-31")

  expect(series.current.points).toHaveLength(31)
  expect(series.comparison?.points).toHaveLength(28)
  for (const month of ["02", "03", "04"]) {
    expect(getTransactionsInRange).toHaveBeenCalledWith(`2026-${month}-01`, `2026-${month}-28`)
  }
})

it("returns zero cumulative spending and no category changes when there is no spending", async () => {
  const series = await getSpendingSeries("this_month_vs_last_month", "2026-01-07")

  expect(series.current.points.map((point) => point.amount)).toEqual([0, 0, 0, 0, 0, 0, 0])
  expect(series.current.total).toBe(0)
  expect(series.comparison?.label).toBe("December 2025")
  expect(series.comparison?.total).toBe(0)
  expect(series.categoryChanges).toEqual([])
})

it("propagates read failures rather than displaying false zeroes", async () => {
  vi.mocked(getTransactionsInRange).mockRejectedValueOnce(new Error("Read failed"))
  await expect(getSpendingSeries("this_month_vs_last_month", "2026-11-07")).rejects.toThrow("Read failed")
})
