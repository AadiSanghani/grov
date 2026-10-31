import type { Transaction } from "@/lib/types"
import { parseLocalDate } from "@/lib/utils"

/** Merge the server's confirmed row without leaking database date/ID representations into the UI. */
export function reconcileSavedTransaction(
  draft: Transaction,
  row: Record<string, unknown>
): Transaction {
  const result = { ...draft }
  for (const key of [
    "merchant",
    "category",
    "source_type",
    "user_id",
  ] as const) {
    if (typeof row[key] === "string") result[key] = row[key]
  }
  if (row.id != null) result.id = String(row.id)
  if (
    row.transaction_type === "incoming" ||
    row.transaction_type === "outgoing" ||
    row.transaction_type === "transfer"
  )
    result.transaction_type = row.transaction_type
  if (
    row.incoming_subtype === "income" ||
    row.incoming_subtype === "reimbursement" ||
    row.incoming_subtype === null
  )
    result.incoming_subtype = row.incoming_subtype
  if (typeof row.affects_balance === "boolean")
    result.affects_balance = row.affects_balance
  if (row.amount != null && Number.isFinite(Number(row.amount)))
    result.amount = Number(row.amount)
  if (row.spending_amount !== undefined)
    result.spending_amount =
      row.spending_amount === null ? null : Number(row.spending_amount)
  if (row.notes !== undefined)
    result.notes = row.notes == null ? "" : String(row.notes)
  for (const key of [
    "account_type_id",
    "to_account_type_id",
    "trip_id",
    "trip_entry_id",
  ] as const) {
    if (row[key] !== undefined)
      result[key] = row[key] == null ? null : String(row[key])
  }
  if (typeof row.date === "string") result.date = parseLocalDate(row.date)
  for (const key of ["created_at", "updated_at"] as const) {
    if (typeof row[key] === "string") result[key] = new Date(row[key])
  }
  // Deductions are written separately by the server and are carried from the validated draft.
  return result
}
