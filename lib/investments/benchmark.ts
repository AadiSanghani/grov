'use server'

import { ensureBenchmarkSecurity } from '@/lib/investments/securities'
import { getHistoricalSeriesForSecurity } from '@/lib/investments/market-data'
import type { BenchmarkSeriesPoint } from '@/lib/investments/types'
import { normalizeToBase100, round2 } from '@/lib/investments/utils'

export async function getBenchmarkSeriesCad(input: {
  startDate: string
  endDate: string
  fxToCadResolver: (currency: string, date: string) => Promise<number>
}): Promise<BenchmarkSeriesPoint[]> {
  const security = await ensureBenchmarkSecurity()
  const history = await getHistoricalSeriesForSecurity(security, {
    startDate: input.startDate,
    endDate: input.endDate,
    allowFetch: false,
  })

  if (history.length === 0) return []

  const values: { date: string; value: number }[] = []
  for (const point of history) {
    const fx = await input.fxToCadResolver(point.currency, point.date)
    values.push({
      date: point.date,
      value: round2(point.close * fx),
    })
  }

  const normalized = normalizeToBase100(values)
  const normByDate = new Map(normalized.map((row) => [row.date, row.normalized]))

  return values.map((row) => ({
    date: row.date,
    value_cad: row.value,
    normalized: normByDate.get(row.date) ?? 0,
  }))
}
