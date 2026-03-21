import type { AllocationSlice, BenchmarkSeriesPoint, PortfolioSeriesPoint } from "@/lib/investments/types"

export const CAD_CURRENCY = "CAD"
export const USD_CURRENCY = "USD"
export const SP500_SYMBOL = "^GSPC"

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function toIsoDate(input: Date | string): string {
  if (input instanceof Date) {
    return input.toISOString().slice(0, 10)
  }
  return input.slice(0, 10)
}

export function normalizeCurrency(value: string | null | undefined): string {
  return (value ?? CAD_CURRENCY).trim().toUpperCase()
}

export function normalizeTicker(value: string): string {
  return value.trim().toUpperCase()
}

export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function formatDateForEt(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function getEtHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date)

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  return { hour, minute }
}

export function toAllocationSlices(source: Map<string, number>): AllocationSlice[] {
  const total = Array.from(source.values()).reduce((sum, value) => sum + value, 0)
  if (total <= 0) return []

  return Array.from(source.entries())
    .map(([label, value]) => ({
      label,
      value_cad: round2(value),
      pct: round2((value / total) * 100),
    }))
    .sort((a, b) => b.value_cad - a.value_cad)
}

export function normalizeToBase100(values: { date: string; value: number }[]): { date: string; normalized: number }[] {
  const firstPositive = values.find((row) => row.value > 0)
  const base = firstPositive?.value ?? values[0]?.value ?? 0

  if (base <= 0) {
    return values.map((row) => ({ date: row.date, normalized: 0 }))
  }

  return values.map((row) => ({
    date: row.date,
    normalized: round2((row.value / base) * 100),
  }))
}

export function mergeNormalizedSeries(
  portfolio: PortfolioSeriesPoint[],
  benchmark: BenchmarkSeriesPoint[],
): Array<{ date: string; portfolio: number; benchmark: number }> {
  const byDate = new Map<string, { portfolio?: number; benchmark?: number }>()

  for (const row of portfolio) {
    const existing = byDate.get(row.date) ?? {}
    existing.portfolio = row.normalized
    byDate.set(row.date, existing)
  }

  for (const row of benchmark) {
    const existing = byDate.get(row.date) ?? {}
    existing.benchmark = row.normalized
    byDate.set(row.date, existing)
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({
      date,
      portfolio: value.portfolio ?? 0,
      benchmark: value.benchmark ?? 0,
    }))
}
