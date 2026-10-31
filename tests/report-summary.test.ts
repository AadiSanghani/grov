import { describe, expect, it } from "vitest"
import { isReportIncome, previousReportRange, reportTrend, summarizeReport } from "@/lib/report-summary"
import type { AccountMap } from "@/components/mermaid-sankey"
import type { Transaction } from "@/lib/types"

const accountsMap: AccountMap = {
  cash: { name: "Checking", category: "asset", accountType: "Cash", accountSubtype: "Checking" },
  investments: { name: "Portfolio", category: "asset", accountType: "Investments", accountSubtype: "Brokerage" },
}

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    merchant: "Example",
    category: "other",
    date: new Date("2026-10-20T12:00:00Z"),
    account_type_id: "cash",
    transaction_type: "outgoing",
    amount: 0,
    ...overrides,
  }
}

describe("report totals", () => {
  const transactions = [
    transaction({ transaction_type: "incoming", incoming_subtype: "income", amount: 1000, category: "salary" }),
    transaction({ transaction_type: "incoming", incoming_subtype: "income", amount: 200, account_type_id: "investments", category: "dividends" }),
    transaction({ transaction_type: "incoming", incoming_subtype: "reimbursement", amount: 50 }),
    transaction({ transaction_type: "transfer", amount: 500 }),
    transaction({ transaction_type: "outgoing", amount: 400, spending_amount: 120, category: "food" }),
  ]

  it("uses the same reportable income and personal spending in totals and trends", () => {
    expect(isReportIncome(transactions[0], accountsMap)).toBe(true)
    expect(isReportIncome(transactions[1], accountsMap)).toBe(false)
    expect(isReportIncome(transactions[2], accountsMap)).toBe(false)
    expect(summarizeReport(transactions, accountsMap)).toEqual({
      income: 1000,
      spending: 120,
      remaining: 880,
      savingsRate: 88,
      investmentInflows: 200,
    })
    expect(reportTrend(transactions, accountsMap, "2026-10-20", "2026-10-20")).toEqual([{ date: "2026-10-20", income: 1000, spending: 120 }])
  })

  it("shows no savings rate when the period has no reportable income", () => {
    expect(summarizeReport([transaction({ amount: 25 })], accountsMap).savingsRate).toBeNull()
  })
})

it("compares month to date with the same number of completed days", () => {
  expect(previousReportRange("2026-10-01", "2026-10-31", new Date("2026-10-20T12:00:00Z")))
    .toEqual({ startDate: "2026-09-11", endDate: "2026-09-30" })
})

it("fills empty dates and switches long ranges to monthly buckets", () => {
  const expense = transaction({ amount: 30, date: new Date("2026-10-20T12:00:00Z") })
  expect(reportTrend([expense], accountsMap, "2026-10-19", "2026-10-21")).toEqual([
    { date: "2026-10-19", income: 0, spending: 0 },
    { date: "2026-10-20", income: 0, spending: 30 },
    { date: "2026-10-21", income: 0, spending: 0 },
  ])
  expect(reportTrend([expense], accountsMap, "2026-08-01", "2026-11-01")).toEqual([
    { date: "2026-08-01", income: 0, spending: 0 },
    { date: "2026-09-01", income: 0, spending: 0 },
    { date: "2026-10-01", income: 0, spending: 30 },
    { date: "2026-11-01", income: 0, spending: 0 },
  ])
})
