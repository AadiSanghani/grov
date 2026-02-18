'use server'

import { getHistorical, getQuote } from './yahoo'

const FX_MEMORY_TTL_MS = 24 * 60 * 60 * 1000

interface FxMemoryEntry {
  rate: number
  expiresAt: number
}

const fxMemoryCache = new Map<string, FxMemoryEntry>()

function normalizeCurrency(input: string) {
  return input.trim().toUpperCase()
}

function localDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateOnly(input: string | Date) {
  if (input instanceof Date) return localDateString(input)
  return input.slice(0, 10)
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function fxKey(base: string, quote: string, rateDate: string) {
  return `${base}:${quote}:${rateDate}`
}

function pickLatestPointOnOrBeforeDate(
  points: { date: string; close: number }[],
  targetDate: string,
): { date: string; close: number } | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].date <= targetDate) return points[i]
  }
  return null
}

async function getNearestPriorHistoricalRate(
  ticker: string,
  targetDate: string,
): Promise<number | null> {
  const lookbackWindows = [7, 30, 90, 365]

  for (const lookbackDays of lookbackWindows) {
    try {
      const startDate = addDays(targetDate, -lookbackDays)
      const endDateInclusive = addDays(targetDate, 1)
      const history = await getHistorical(ticker, { startDate, endDate: endDateInclusive })
      const match = pickLatestPointOnOrBeforeDate(history.points, targetDate)
      if (match && match.close > 0) {
        return match.close
      }
    } catch (error) {
      console.warn(
        `Historical FX lookup failed for ${ticker} in ${lookbackDays}d window:`,
        error,
      )
    }
  }

  return null
}

async function fetchFxFromYahoo(
  base: string,
  quote: string,
  targetDate: string,
): Promise<number> {
  const directTicker = `${base}${quote}=X`
  const inverseTicker = `${quote}${base}=X`

  const directHistoricalRate = await getNearestPriorHistoricalRate(directTicker, targetDate)
  if (directHistoricalRate != null) return directHistoricalRate

  const inverseHistoricalRate = await getNearestPriorHistoricalRate(inverseTicker, targetDate)
  if (inverseHistoricalRate != null && inverseHistoricalRate > 0) {
    return 1 / inverseHistoricalRate
  }

  try {
    const directQuote = await getQuote(directTicker)
    if (directQuote.price > 0) {
      return directQuote.price
    }
  } catch (error) {
    console.warn(`Direct FX quote fetch failed for ${directTicker}:`, error)
  }

  try {
    const inverseQuote = await getQuote(inverseTicker)
    if (inverseQuote.price > 0) {
      return 1 / inverseQuote.price
    }
  } catch (error) {
    console.warn(`Inverse FX quote fetch failed for ${inverseTicker}:`, error)
  }

  throw new Error(`Live FX rate unavailable for ${base}/${quote} on or before ${targetDate}`)
}

export async function getFxRate(
  fromCurrency: string,
  toCurrency: string,
  date?: string | Date,
): Promise<number> {
  const base = normalizeCurrency(fromCurrency)
  const quote = normalizeCurrency(toCurrency)
  const requestedDate = dateOnly(date ?? new Date())
  const todayDate = localDateString(new Date())
  const targetDate = requestedDate > todayDate ? todayDate : requestedDate

  if (!base || !quote) {
    throw new Error('Both fromCurrency and toCurrency are required')
  }
  if (base === quote) return 1

  const memoryKey = fxKey(base, quote, targetDate)
  const memory = fxMemoryCache.get(memoryKey)
  if (memory && memory.expiresAt > Date.now()) {
    return memory.rate
  }

  const fetchedRate = await fetchFxFromYahoo(base, quote, targetDate)
  if (!Number.isFinite(fetchedRate) || fetchedRate <= 0) {
    throw new Error(`Invalid fetched FX rate for ${base}/${quote}: ${fetchedRate}`)
  }

  fxMemoryCache.set(memoryKey, {
    rate: fetchedRate,
    expiresAt: Date.now() + FX_MEMORY_TTL_MS,
  })

  return fetchedRate
}
