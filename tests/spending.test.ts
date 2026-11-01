import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { getSpendingSeries } from "@/lib/spending"
import { getTransactionsInRange } from "@/lib/transactions"

vi.mock("@/lib/transactions", () => ({
  getTransactionsInRange: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-01T01:00:00Z"))
  vi.mocked(getTransactionsInRange).mockResolvedValue([])
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
  expect(getTransactionsInRange).toHaveBeenCalledWith("2026-11-01", "2026-11-30")
})

it("rejects malformed browser dates", async () => {
  await expect(getSpendingSeries("this_month_vs_last_month", "2026-11-31"))
    .rejects.toThrow("Invalid local date")
  expect(getTransactionsInRange).not.toHaveBeenCalled()
})
