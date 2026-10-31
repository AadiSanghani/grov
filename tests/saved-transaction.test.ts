import { expect, it } from "vitest"
import { reconcileSavedTransaction } from "@/lib/ledger/saved-transaction"
import type { Transaction } from "@/lib/types"
it("reconciles canonical server metadata, dates and numeric IDs while keeping deductions", () => {
  const draft: Transaction = {
    merchant: "draft",
    transaction_type: "incoming",
    category: "paychecks",
    amount: 100,
    account_type_id: "1",
    date: new Date(2026, 9, 31),
    deductions: [{ label: "Tax", amount: 10 }],
  }
  const result = reconcileSavedTransaction(draft, {
    id: 12,
    merchant: "Saved",
    amount: "200",
    date: "2026-11-01",
    account_type_id: 2,
    to_account_type_id: null,
    spending_amount: null,
    incoming_subtype: "reimbursement",
    affects_balance: false,
    trip_id: 5,
    trip_entry_id: 6,
    source_type: "trip_settlement",
    notes: null,
  })
  expect(result).toMatchObject({
    id: "12",
    merchant: "Saved",
    amount: 200,
    account_type_id: "2",
    trip_id: "5",
    trip_entry_id: "6",
    notes: "",
    affects_balance: false,
    incoming_subtype: "reimbursement",
    source_type: "trip_settlement",
    deductions: draft.deductions,
  })
  expect(result.date.getDate()).toBe(1)
  expect(draft.merchant).toBe("draft")
})
