import { act, fireEvent, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  defaultFilters,
  filterTransactions,
  parseFilters,
  serializeFilters,
} from "@/lib/ledger/filters"
import { useLedgerFilters } from "@/hooks/use-ledger-filters"
import type { Transaction } from "@/lib/types"

const row = (
  merchant: string,
  amount: number,
  account_type_id: string | null
): Transaction => ({
  merchant,
  amount,
  account_type_id,
  date: new Date(2026, 9, 31),
  category: "Dining Out",
  transaction_type: "outgoing",
})
describe("ledger filters", () => {
  it("round trips every supported filter, preserving unrelated query parameters", () => {
    const input = {
      ...defaultFilters,
      search: "coffee & cake",
      sortBy: "merchant" as const,
      sortOrder: "asc" as const,
      account_types: ["1", "__unassigned__"],
      categories: ["dining-out"],
      dateStart: new Date(2026, 9, 1),
      dateEnd: new Date(2026, 9, 31),
      amountMin: 0,
      amountMax: 200,
    }
    const query = serializeFilters(input, "view=ledger")
    expect(parseFilters(query)).toEqual(input)
    expect(query).toContain("view=ledger")
  })
  it("rejects invalid dates, amounts and sort values", () => {
    expect(
      parseFilters(
        "from=2026-02-30&to=tomorrow&min=Infinity&max=-10&sort=evil&order=evil"
      )
    ).toMatchObject({
      sortBy: "date",
      sortOrder: "desc",
      dateStart: undefined,
      dateEnd: undefined,
      amountMin: undefined,
      amountMax: undefined,
    })
  })
  it("combines unassigned and assigned accounts and sorts merchants in the requested direction", () => {
    const rows = [
      row("Zebra", 10, null),
      row("Apple", 20, "1"),
      row("Elsewhere", 30, "2"),
    ]
    expect(
      filterTransactions(rows, {
        ...defaultFilters,
        account_types: ["__unassigned__", "1"],
        sortBy: "merchant",
        sortOrder: "asc",
      }).map((r) => r.merchant)
    ).toEqual(["Apple", "Zebra"])
    expect(rows[0].merchant).toBe("Zebra")
  })
  it("restores URL filters on navigation and remount without scrolling", () => {
    window.history.replaceState(null, "", "/transactions?account=1&q=coffee")
    const hook = renderHook(() => useLedgerFilters())
    expect(hook.result.current[0].search).toBe("coffee")
    act(() =>
      hook.result.current[1]({ ...hook.result.current[0], sortBy: "amount" })
    )
    expect(window.location.search).toContain("account=1")
    act(() => {
      window.history.replaceState(
        null,
        "",
        "/transactions?category=food&order=asc"
      )
      fireEvent.popState(window)
    })
    expect(hook.result.current[0]).toMatchObject({
      categories: ["food"],
      sortOrder: "asc",
      search: "",
    })
    hook.unmount()
    const remount = renderHook(() => useLedgerFilters())
    expect(remount.result.current[0].categories).toEqual(["food"])
  })
  it("restores sort and filters with actual browser Back and Forward", async () => {
    window.history.replaceState(null, "", "/transactions?account=1")
    const hook = renderHook(() => useLedgerFilters())
    act(() =>
      hook.result.current[1]({
        ...hook.result.current[0],
        sortBy: "merchant",
        sortOrder: "asc",
        search: "Coffee",
      })
    )
    act(() => window.history.back())
    await waitFor(() =>
      expect(hook.result.current[0]).toMatchObject({
        account_types: ["1"],
        sortBy: "date",
        search: "",
      })
    )
    act(() => window.history.forward())
    await waitFor(() =>
      expect(hook.result.current[0]).toMatchObject({
        account_types: ["1"],
        sortBy: "merchant",
        sortOrder: "asc",
        search: "Coffee",
      })
    )
  })
  it("keeps pagination in history and resets it when filters change", async () => {
    window.history.replaceState(null, "", "/transactions?account=1")
    const hook = renderHook(() => useLedgerFilters())
    act(() => hook.result.current[2].setPage(3))
    expect(hook.result.current[2].page).toBe(3)
    expect(window.location.search).toContain("account=1")
    act(() => hook.result.current[1]({ ...hook.result.current[0], search: "coffee" }))
    expect(hook.result.current[2].page).toBe(1)
    act(() => window.history.back())
    await waitFor(() => expect(hook.result.current[2].page).toBe(3))
    expect(hook.result.current[0].search).toBe("")
  })
})
