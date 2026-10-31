import { normalizeCalendarDate } from "@/lib/utils"

function addDays(baseDate: Date, days: number): Date {
  const next = normalizeCalendarDate(baseDate)
  next.setDate(next.getDate() + days)
  return normalizeCalendarDate(next)
}

export function formatDateForInput(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

export function parseShortcutDateInput(
  rawValue: string,
  fallbackDate: Date
): Date | null {
  const value = rawValue.trim().toLowerCase()
  if (!value) return fallbackDate

  if (value === "today" || value === "t") {
    return normalizeCalendarDate(new Date())
  }
  if (value === "yesterday" || value === "y") {
    return addDays(new Date(), -1)
  }
  if (value === "tomorrow") {
    return addDays(new Date(), 1)
  }

  if (/^[+-]\d+$/.test(value)) {
    const result = addDays(new Date(), Number(value))
    return Number.isNaN(result.getTime()) ? null : result
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [yearStr, monthStr, dayStr] = value.split("-")
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    const candidate = new Date(year, month - 1, day)
    if (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day
    ) {
      return normalizeCalendarDate(candidate)
    }
    return null
  }

  const dayFirstDateMatch = value.match(
    /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/
  )
  if (dayFirstDateMatch) {
    const day = Number(dayFirstDateMatch[1])
    const month = Number(dayFirstDateMatch[2])
    const yearInput = dayFirstDateMatch[3]
    let year = yearInput ? Number(yearInput) : fallbackDate.getFullYear()

    if (yearInput && yearInput.length === 2) {
      year += 2000
    }

    const candidate = new Date(year, month - 1, day)
    if (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day
    ) {
      return normalizeCalendarDate(candidate)
    }
  }

  return null
}
