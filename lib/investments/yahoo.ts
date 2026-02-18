'use server'

const QUOTE_TTL_MS = 2 * 60 * 1000
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000

interface QuoteCacheEntry {
  value: QuoteResult
  expiresAt: number
}

interface HistoryCacheEntry {
  value: HistoricalResult
  expiresAt: number
}

const quoteMemoryCache = new Map<string, QuoteCacheEntry>()
const historyMemoryCache = new Map<string, HistoryCacheEntry>()

interface YahooQuoteResponse {
  regularMarketPrice?: number | null
  regularMarketPreviousClose?: number | null
  bid?: number | null
  ask?: number | null
  currency?: string | null
  regularMarketTime?: Date | number | null
  longName?: string | null
  shortName?: string | null
}

interface YahooChartQuoteRow {
  date?: Date
  close?: number | null
  adjclose?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  volume?: number | null
}

interface YahooChartResult {
  quotes: YahooChartQuoteRow[]
  meta?: { currency?: string }
}

interface YahooFinanceClient {
  quote: (ticker: string, options?: Record<string, unknown>) => Promise<YahooQuoteResponse>
  chart: (
    ticker: string,
    options: { period1: string; period2: string; interval?: '1d' | '1wk' | '1mo' },
  ) => Promise<YahooChartResult>
}

export interface QuoteResult {
  ticker: string
  price: number
  currency: string
  asOf: string
  stale: boolean
  source: 'live' | 'memory' | 'historical'
  /** Security display name from Yahoo (longName or shortName), when available */
  name?: string | null
}

export interface HistoricalPoint {
  date: string
  close: number
  currency: string
}

export interface HistoricalResult {
  ticker: string
  points: HistoricalPoint[]
  stale: boolean
  source: 'live' | 'memory'
}

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase()
}

function toDateString(input: string | Date) {
  if (input instanceof Date) {
    return input.toISOString().slice(0, 10)
  }
  return input.slice(0, 10)
}

function localDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function pickLatestPointOnOrBeforeDate(points: HistoricalPoint[], targetDate: string) {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].date <= targetDate) return points[i]
  }
  return null
}

function quoteMemoryKey(ticker: string) {
  return `quote:${normalizeTicker(ticker)}`
}

function historyMemoryKey(ticker: string, startDate: string, endDate: string) {
  return `hist:${normalizeTicker(ticker)}:${startDate}:${endDate}`
}

async function loadYahooFinanceClient(): Promise<YahooFinanceClient> {
  try {
    const loadDynamicImport = new Function('m', 'return import(m)') as (
      moduleName: string,
    ) => Promise<unknown>
    const mod = await loadDynamicImport('yahoo-finance2')
    const YahooFinanceClass = (mod as { default?: unknown }).default ?? mod
    if (typeof YahooFinanceClass !== 'function') {
      throw new Error('Invalid yahoo-finance2 module export (expected constructor)')
    }

    const client = new (YahooFinanceClass as new (opts?: { suppressNotices?: string[] }) => YahooFinanceClient)({
      suppressNotices: ['yahooSurvey'],
    })
    if (typeof client.quote !== 'function' || typeof client.chart !== 'function') {
      throw new Error('yahoo-finance2 client missing quote/chart methods')
    }

    return client
  } catch (error) {
    throw new Error(
      `yahoo-finance2 is unavailable. Install it with "npm install yahoo-finance2". Root cause: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
    )
  }
}

export async function getQuote(ticker: string): Promise<QuoteResult> {
  const normalizedTicker = normalizeTicker(ticker)
  if (!normalizedTicker) throw new Error('Ticker is required')

  const memoryKey = quoteMemoryKey(normalizedTicker)
  const memoryEntry = quoteMemoryCache.get(memoryKey)
  if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
    return memoryEntry.value
  }

  try {
    const yahoo = await loadYahooFinanceClient()
    const quote = await yahoo.quote(normalizedTicker)
    const priceCandidates = [
      quote?.regularMarketPrice,
      quote?.regularMarketPreviousClose,
      quote?.bid,
      quote?.ask,
    ]
      .map((value) => (value == null ? NaN : Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0)
    const price = priceCandidates[0] ?? NaN
    const currency = String(quote?.currency ?? 'USD').toUpperCase()
    const marketTime =
      quote?.regularMarketTime instanceof Date
        ? quote.regularMarketTime.toISOString()
        : typeof quote?.regularMarketTime === 'number'
          ? new Date(quote.regularMarketTime * 1000).toISOString()
          : new Date().toISOString()

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Yahoo quote for ${normalizedTicker} did not include a valid market price`)
    }

    const q = quote as YahooQuoteResponse
    const securityName = (q.longName ?? q.shortName ?? '').trim() || null

    const liveQuote: QuoteResult = {
      ticker: normalizedTicker,
      price,
      currency,
      asOf: marketTime,
      stale: false,
      source: 'live',
      name: securityName ?? undefined,
    }

    quoteMemoryCache.set(memoryKey, {
      value: liveQuote,
      expiresAt: Date.now() + QUOTE_TTL_MS,
    })

    return liveQuote
  } catch (liveError) {
    try {
      const today = localDateString(new Date())
      const history = await getHistorical(normalizedTicker, {
        startDate: addDays(today, -30),
        endDate: addDays(today, 1),
      })
      const latestPoint = pickLatestPointOnOrBeforeDate(history.points, today)
      if (!latestPoint) {
        throw new Error(`No historical point found on or before ${today}`)
      }

      const fallbackQuote: QuoteResult = {
        ticker: normalizedTicker,
        price: latestPoint.close,
        currency: latestPoint.currency,
        asOf: `${latestPoint.date}T00:00:00.000Z`,
        stale: true,
        source: 'historical',
        name: undefined,
      }

      quoteMemoryCache.set(memoryKey, {
        value: fallbackQuote,
        expiresAt: Date.now() + QUOTE_TTL_MS,
      })

      return fallbackQuote
    } catch (historyError) {
      const liveMessage = liveError instanceof Error ? liveError.message : 'Unknown provider error'
      const historyMessage = historyError instanceof Error ? historyError.message : 'Unknown historical error'
      throw new Error(
        `Live quote unavailable for ${normalizedTicker}. ${liveMessage}. Historical fallback also failed: ${historyMessage}`,
      )
    }
  }
}

export async function getHistorical(
  ticker: string,
  input: { startDate: string; endDate: string },
): Promise<HistoricalResult> {
  const normalizedTicker = normalizeTicker(ticker)
  if (!normalizedTicker) throw new Error('Ticker is required')

  const startDate = toDateString(input.startDate)
  const endDate = toDateString(input.endDate)
  if (startDate > endDate) {
    throw new Error('startDate must be before or equal to endDate')
  }

  const memoryKey = historyMemoryKey(normalizedTicker, startDate, endDate)
  const memoryEntry = historyMemoryCache.get(memoryKey)
  if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
    return memoryEntry.value
  }

  try {
    const yahoo = await loadYahooFinanceClient()
    const result = await yahoo.chart(normalizedTicker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    })

    const currency = String(result.meta?.currency ?? 'USD').toUpperCase()
    const quotes = result.quotes ?? []

    const points: HistoricalPoint[] = quotes
      .map((row) => {
        const rawClose = row.close ?? row.adjclose
        const close = rawClose == null ? NaN : Number(rawClose)
        const date = row.date ? toDateString(row.date) : ''
        return {
          date,
          close,
          currency,
        }
      })
      .filter((point) => point.date && Number.isFinite(point.close) && point.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date))

    if (points.length === 0) {
      throw new Error(`Yahoo chart response for ${normalizedTicker} had no valid quotes`)
    }

    const liveHistory: HistoricalResult = {
      ticker: normalizedTicker,
      points,
      stale: false,
      source: 'live',
    }

    historyMemoryCache.set(memoryKey, {
      value: liveHistory,
      expiresAt: Date.now() + HISTORY_TTL_MS,
    })

    return liveHistory
  } catch (error) {
    throw new Error(
      `Live historical data unavailable for ${normalizedTicker}. ${
        error instanceof Error ? error.message : 'Unknown provider error'
      }`,
    )
  }
}
