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
  currency?: string | null
  regularMarketTime?: Date | number | null
}

interface YahooHistoricalRow {
  date?: string | Date
  close?: number | null
  adjClose?: number | null
  currency?: string | null
}

interface YahooFinanceClient {
  quote: (ticker: string, options?: Record<string, unknown>) => Promise<YahooQuoteResponse>
  historical: (
    ticker: string,
    options: { period1: string; period2: string; interval: '1d' },
  ) => Promise<YahooHistoricalRow[]>
}

export interface QuoteResult {
  ticker: string
  price: number
  currency: string
  asOf: string
  stale: boolean
  source: 'live' | 'memory'
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

function quoteMemoryKey(ticker: string) {
  return `quote:${normalizeTicker(ticker)}`
}

function historyMemoryKey(ticker: string, startDate: string, endDate: string) {
  return `hist:${normalizeTicker(ticker)}:${startDate}:${endDate}`
}

async function loadYahooFinanceClient() {
  try {
    const loadDynamicImport = new Function('m', 'return import(m)') as (
      moduleName: string,
    ) => Promise<unknown>
    const mod = await loadDynamicImport('yahoo-finance2')
    const maybeDefault = (mod as { default?: unknown }).default ?? mod
    if (!maybeDefault || (typeof maybeDefault !== 'object' && typeof maybeDefault !== 'function')) {
      throw new Error('Invalid yahoo-finance2 module export')
    }

    const client = maybeDefault as YahooFinanceClient
    if (typeof client.quote !== 'function' || typeof client.historical !== 'function') {
      throw new Error('yahoo-finance2 client missing quote/historical methods')
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
    const price = Number(quote?.regularMarketPrice)
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

    const liveQuote: QuoteResult = {
      ticker: normalizedTicker,
      price,
      currency,
      asOf: marketTime,
      stale: false,
      source: 'live',
    }

    quoteMemoryCache.set(memoryKey, {
      value: liveQuote,
      expiresAt: Date.now() + QUOTE_TTL_MS,
    })

    return liveQuote
  } catch (error) {
    throw new Error(
      `Live quote unavailable for ${normalizedTicker}. ${
        error instanceof Error ? error.message : 'Unknown provider error'
      }`,
    )
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
    const rows = await yahoo.historical(normalizedTicker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    })

    const points: HistoricalPoint[] = (rows ?? [])
      .map((row) => {
        const rawClose = row.close ?? row.adjClose
        const close = rawClose == null ? NaN : Number(rawClose)
        const date = row.date ? toDateString(row.date) : ''
        return {
          date,
          close,
          currency: String(row.currency ?? 'USD').toUpperCase(),
        }
      })
      .filter((point) => point.date && Number.isFinite(point.close) && point.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date))

    if (points.length === 0) {
      throw new Error(`Yahoo historical response for ${normalizedTicker} had no valid rows`)
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

