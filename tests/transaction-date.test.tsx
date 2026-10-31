import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parseShortcutDateInput } from "@/lib/ledger/date-input"
import { toLocalDateString } from "@/lib/utils"
import {
  TransactionDateField,
  useTransactionDate,
} from "@/components/transaction-editor/date-field"
import { submitOnShortcut } from "@/components/transaction-editor/editor-controls"

const base = new Date(2026, 9, 31)
afterEach(() => vi.useRealTimers())
describe("transaction date", () => {
  it.each([
    ["t", "2026-10-31"],
    ["today", "2026-10-31"],
    ["y", "2026-10-30"],
    ["yesterday", "2026-10-30"],
    ["tomorrow", "2026-11-01"],
    ["+1", "2026-11-01"],
    ["-7", "2026-10-24"],
    ["2024-02-29", "2024-02-29"],
    ["29/02/2024", "2024-02-29"],
    ["1/2", "2026-02-01"],
    ["1-2", "2026-02-01"],
    ["1-2-26", "2026-02-01"],
  ])("parses %s", (input, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(base)
    expect(toLocalDateString(parseShortcutDateInput(input, base)!)).toBe(
      expected
    )
  })
  it.each([
    "31/02/2026",
    "2025-02-29",
    "1/13",
    "nonsense",
    "+9999999999999999",
  ])("rejects %s", (input) =>
    expect(parseShortcutDateInput(input, base)).toBeNull()
  )
  it("commits the current draft before Ctrl+Enter, and keeps an invalid draft", () => {
    const saved = vi.fn()
    function Form() {
      const value = useTransactionDate(base)
      return (
        <form
          onKeyDown={submitOnShortcut}
          onSubmit={(e) => {
            e.preventDefault()
            const date = value.commit()
            if (date) saved(toLocalDateString(date))
          }}
        >
          <TransactionDateField value={value} />
          <button>Save</button>
        </form>
      )
    }
    render(<Form />)
    const input = screen.getByLabelText("Date")
    fireEvent.change(input, { target: { value: "25/12/2026" } })
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true })
    expect(saved).toHaveBeenLastCalledWith("2026-12-25")
    fireEvent.change(input, { target: { value: "31/02/2026" } })
    fireEvent.keyDown(input, { key: "Enter", metaKey: true })
    expect(saved).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue("31/02/2026")
    expect(screen.getByRole("alert")).toBeVisible()
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true, repeat: true })
    expect(saved).toHaveBeenCalledTimes(1)
  })
})
