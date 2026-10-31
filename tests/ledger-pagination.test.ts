import { describe, expect, it } from "vitest"
import { defaultFilters } from "@/lib/ledger/filters"
import { ledgerRequest, normalizeLedgerPage } from "@/lib/ledger/pagination"

describe("ledger request boundaries", () => {
  it("caps page sizes and normalizes dates, amounts and search before the RPC", () => {
    const request = ledgerRequest({
      ...defaultFilters,
      search: "a".repeat(1000),
      dateStart: new Date(2026, 9, 1),
      amountMin: -1,
      account_types: ["1", "1", "__unassigned__"],
    }, 2)
    expect(request).toMatchObject({ p_page: 2, p_page_size: 50 })
    expect(request.p_filters).toMatchObject({ from: "2026-10-01", min: null, accounts: ["1", "__unassigned__"] })
    expect(request.p_filters.search).toHaveLength(500)
    expect(request.p_filters).not.toHaveProperty("user_id")
  })

  it("rejects negative, fractional and non-finite page values", () => {
    for (const value of [null, "invalid", -5, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(normalizeLedgerPage(value)).toBe(1)
    }
    expect(normalizeLedgerPage("3")).toBe(3)
    expect(normalizeLedgerPage(2_000_000)).toBe(1_000_000)
  })
})
