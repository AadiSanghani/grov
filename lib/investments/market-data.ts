'use server'

import { createServerSupabaseClient } from '@/ssr/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  InvestmentHistoryPoint,
  InvestmentQuoteSnapshot,
  InvestmentSecurity,
} from '@/lib/investments/types'
import { normalizeCurrency, round2, toIsoDate } from '@/lib/investments/utils'

interface YahooQuoteResult {
  regularMarketPrice?: number | null
  regularMarketPreviousClose?: number | null
  bid?: number | null
  ask?: number | null
  currency?: string | null
  regularMarketTime?: Date | number | null
  longName?: string | null
  shortName?: string | null
}

interface YahooChartPoint {
  date?: Date
  close?: number | null
  adjclose?: number | null
}

interface YahooChartResult {
  quotes: YahooChartPoint[]
  meta?: { currency?: string }
}

interface YahooFinanceClient {
  quote: (symbol: string, options?: Record<string, unknown>) => Promise<YahooQuoteResult>
  chart: (
    symbol: string,
    options: { period1: string; period2: string; interval?: '1d' | '1wk' | '1mo' },
  ) => Promise<YahooChartResult>
}

interface QuoteCacheRow {
  security_id: number
  quote_currency: string
  price: string | number
  previous_close: string | number | null
  as_of: string
  source: string
}

interface HistoryCacheRow {
  security_id: number
  price_date: string
  close_price: string | number
  quote_currency: string
}

interface QuoteProviderResult {
  price: number
  previousClose: number | null
  currency: string
  asOf: string
  name: string | null
  payload: Record<string, unknown>
}

type SupabaseClientLike = SupabaseClient

const QUOTE_MAX_AGE_MINUTES = 4 * 60

let yahooClientPromise: Promise<YahooFinanceClient> | null = null

function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000
}

function parseNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

function pickQuotePrice(quote: YahooQuoteResult): number {
  const candidates = [
    quote.regularMarketPrice,
    quote.regularMarketPreviousClose,
    quote.bid,
    quote.ask,
  ]
    .map((value) => (value == null ? Number.NaN : Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0)

  return candidates[0] ?? Number.NaN
}

function isQuoteFresh(asOfIso: string): boolean {
  const asOfMs = Date.parse(asOfIso)
  if (!Number.isFinite(asOfMs)) return false
  return Date.now() - asOfMs <= QUOTE_MAX_AGE_MINUTES * 60 * 1000
}

function localDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function loadYahooClient(): Promise<YahooFinanceClient> {
  if (!yahooClientPromise) {
    yahooClientPromise = (async () => {
      const importDynamic = new Function('m', 'return import(m)') as (moduleName: string) => Promise<unknown>
      const mod = await importDynamic('yahoo-finance2')
      const YahooFinanceClass = (mod as { default?: unknown }).default ?? mod

      if (typeof YahooFinanceClass !== 'function') {
        throw new Error('Invalid yahoo-finance2 export')
      }

      const client = new (YahooFinanceClass as new (opts?: { suppressNotices?: string[] }) => YahooFinanceClient)({
        suppressNotices: ['yahooSurvey'],
      })

      if (typeof client.quote !== 'function' || typeof client.chart !== 'function') {
        throw new Error('yahoo-finance2 client missing quote/chart methods')
      }

      return client
    })()
  }

  return yahooClientPromise
}

async function fetchProviderQuote(yahooSymbol: string): Promise<QuoteProviderResult> {
  const client = await loadYahooClient()
  const quote = await client.quote(yahooSymbol)

  const price = pickQuotePrice(quote)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Yahoo did not return a valid quote for ${yahooSymbol}`)
  }

  const currency = normalizeCurrency(quote.currency ?? 'USD')
  const previousCloseRaw = quote.regularMarketPreviousClose
  const previousClose =
    previousCloseRaw != null && Number(previousCloseRaw) > 0
      ? Number(previousCloseRaw)
      : null

  const asOf =
    quote.regularMarketTime instanceof Date
      ? quote.regularMarketTime.toISOString()
      : typeof quote.regularMarketTime === 'number'
        ? new Date(quote.regularMarketTime * 1000).toISOString()
        : new Date().toISOString()

  return {
    price,
    previousClose,
    currency,
    asOf,
    name: (quote.longName ?? quote.shortName ?? null)?.trim() || null,
    payload: {
      regularMarketPrice: quote.regularMarketPrice,
      regularMarketPreviousClose: quote.regularMarketPreviousClose,
      bid: quote.bid,
      ask: quote.ask,
      currency,
      regularMarketTime: quote.regularMarketTime,
      longName: quote.longName,
      shortName: quote.shortName,
    },
  }
}

async function fetchProviderHistory(
  yahooSymbol: string,
  startDate: string,
  endDate: string,
): Promise<InvestmentHistoryPoint[]> {
  const client = await loadYahooClient()
  const result = await client.chart(yahooSymbol, {
    period1: startDate,
    period2: endDate,
    interval: '1d',
  })

  const currency = normalizeCurrency(result.meta?.currency ?? 'USD')

  const points = (result.quotes ?? [])
    .map((row) => {
      const closeValue = row.close ?? row.adjclose
      const close = closeValue == null ? Number.NaN : Number(closeValue)
      const date = row.date ? toIsoDate(row.date) : ''
      return {
        date,
        close,
      }
    })
    .filter((point) => point.date && Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  return points.map((point) => ({
    date: point.date,
    close: round2(point.close),
    currency,
  }))
}

function mapQuoteRow(row: QuoteCacheRow): InvestmentQuoteSnapshot {
  const asOf = row.as_of
  return {
    security_id: String(row.security_id),
    price: parseNumber(row.price),
    previous_close: row.previous_close == null ? null : parseNumber(row.previous_close),
    quote_currency: normalizeCurrency(row.quote_currency),
    as_of: asOf,
    source: row.source,
    stale: !isQuoteFresh(asOf),
  }
}

export async function getCachedQuoteSnapshots(
  securityIds: string[],
): Promise<Map<string, InvestmentQuoteSnapshot>> {
  if (securityIds.length === 0) return new Map()

  const ids = Array.from(new Set(securityIds.map((id) => Number(id))))
  if (ids.length === 0) return new Map()

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('investment_quotes_cache')
    .select('security_id, quote_currency, price, previous_close, as_of, source')
    .in('security_id', ids)

  if (error) throw error

  const map = new Map<string, InvestmentQuoteSnapshot>()
  for (const row of (data as QuoteCacheRow[] | null) ?? []) {
    map.set(String(row.security_id), mapQuoteRow(row))
  }

  return map
}

export async function refreshQuoteCacheForSecurity(
  security: InvestmentSecurity,
  options?: {
    force?: boolean
    supabaseClient?: SupabaseClientLike
  },
): Promise<InvestmentQuoteSnapshot | null> {
  const supabase = options?.supabaseClient ?? createServerSupabaseClient()

  if (!options?.force) {
    const { data: existing, error: existingError } = await supabase
      .from('investment_quotes_cache')
      .select('security_id, quote_currency, price, previous_close, as_of, source')
      .eq('security_id', Number(security.id))
      .maybeSingle()

    if (existingError) throw existingError

    if (existing && isQuoteFresh((existing as QuoteCacheRow).as_of)) {
      return mapQuoteRow(existing as QuoteCacheRow)
    }
  }

  try {
    const quote = await fetchProviderQuote(security.yahoo_symbol)

    const { error: upsertError } = await supabase
      .from('investment_quotes_cache')
      .upsert(
        {
          security_id: Number(security.id),
          quote_currency: quote.currency,
          price: quote.price,
          previous_close: quote.previousClose,
          as_of: quote.asOf,
          source: 'yahoo',
          payload: quote.payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'security_id' },
      )

    if (upsertError) throw upsertError

    // Keep security metadata fresh with provider output.
    if (quote.name || quote.currency !== security.quote_currency) {
      await supabase
        .from('investment_securities')
        .update({
          name: quote.name ?? security.name,
          quote_currency: quote.currency,
          updated_at: new Date().toISOString(),
        })
        .eq('id', Number(security.id))
    }

    return {
      security_id: security.id,
      price: round2(quote.price),
      previous_close: quote.previousClose != null ? round2(quote.previousClose) : null,
      quote_currency: quote.currency,
      as_of: quote.asOf,
      source: 'yahoo',
      stale: false,
    }
  } catch (error) {
    const { data: fallback, error: fallbackError } = await supabase
      .from('investment_quotes_cache')
      .select('security_id, quote_currency, price, previous_close, as_of, source')
      .eq('security_id', Number(security.id))
      .maybeSingle()

    if (fallbackError) throw fallbackError
    if (fallback) {
      const snapshot = mapQuoteRow(fallback as QuoteCacheRow)
      return {
        ...snapshot,
        stale: true,
      }
    }

    console.error(`Failed to fetch quote for ${security.ticker}:`, error)
    return null
  }
}

export async function getQuoteSnapshotsForSecurities(
  securities: InvestmentSecurity[],
  options?: {
    allowFetch?: boolean
    forceRefresh?: boolean
  },
): Promise<Map<string, InvestmentQuoteSnapshot>> {
  const map = await getCachedQuoteSnapshots(securities.map((security) => security.id))
  const allowFetch = options?.allowFetch ?? true

  if (!allowFetch) {
    return map
  }

  await Promise.all(
    securities.map(async (security) => {
      const existing = map.get(security.id)
      if (existing && !existing.stale && !options?.forceRefresh) {
        return
      }

      const refreshed = await refreshQuoteCacheForSecurity(security, {
        force: Boolean(options?.forceRefresh),
      })

      if (refreshed) {
        map.set(security.id, refreshed)
      }
    }),
  )

  return map
}

export async function getHistoricalSeriesForSecurity(
  security: InvestmentSecurity,
  input: {
    startDate: string
    endDate: string
    allowFetch?: boolean
    supabaseClient?: SupabaseClientLike
  },
): Promise<InvestmentHistoryPoint[]> {
  const supabase = input.supabaseClient ?? createServerSupabaseClient()
  const startDate = toIsoDate(input.startDate)
  const endDate = toIsoDate(input.endDate)
  const allowFetch = input.allowFetch ?? true

  const { data: cachedRows, error: cachedError } = await supabase
    .from('investment_history_cache')
    .select('security_id, price_date, close_price, quote_currency')
    .eq('security_id', Number(security.id))
    .gte('price_date', startDate)
    .lte('price_date', endDate)
    .order('price_date', { ascending: true })

  if (cachedError) throw cachedError

  const cachedPoints = ((cachedRows as HistoryCacheRow[] | null) ?? []).map((row) => ({
    date: row.price_date,
    close: round2(parseNumber(row.close_price)),
    currency: normalizeCurrency(row.quote_currency),
  }))

  const latestCachedDate = cachedPoints[cachedPoints.length - 1]?.date
  const cacheNeedsExtension =
    !latestCachedDate || Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${latestCachedDate}T00:00:00Z`) > daysToMs(3)

  if (!allowFetch || (!cacheNeedsExtension && cachedPoints.length > 0)) {
    return cachedPoints
  }

  try {
    const fetchStart = cachedPoints.length > 0 ? addDays(latestCachedDate!, -3) : startDate
    const providerPoints = await fetchProviderHistory(security.yahoo_symbol, fetchStart, addDays(endDate, 1))

    if (providerPoints.length > 0) {
      const upsertRows = providerPoints.map((point) => ({
        security_id: Number(security.id),
        price_date: point.date,
        close_price: point.close,
        quote_currency: point.currency,
        source: 'yahoo',
        payload: null,
        updated_at: new Date().toISOString(),
      }))

      const { error: upsertError } = await supabase
        .from('investment_history_cache')
        .upsert(upsertRows, { onConflict: 'security_id,price_date' })

      if (upsertError) throw upsertError
    }

    const { data: mergedRows, error: mergedError } = await supabase
      .from('investment_history_cache')
      .select('security_id, price_date, close_price, quote_currency')
      .eq('security_id', Number(security.id))
      .gte('price_date', startDate)
      .lte('price_date', endDate)
      .order('price_date', { ascending: true })

    if (mergedError) throw mergedError

    return ((mergedRows as HistoryCacheRow[] | null) ?? []).map((row) => ({
      date: row.price_date,
      close: round2(parseNumber(row.close_price)),
      currency: normalizeCurrency(row.quote_currency),
    }))
  } catch (error) {
    console.error(`Failed to refresh history cache for ${security.ticker}:`, error)
    return cachedPoints
  }
}

export async function refreshHistoryForSecurity(
  security: InvestmentSecurity,
  input: {
    startDate: string
    endDate: string
    supabaseClient?: SupabaseClientLike
  },
): Promise<number> {
  const points = await getHistoricalSeriesForSecurity(security, {
    startDate: input.startDate,
    endDate: input.endDate,
    allowFetch: true,
    supabaseClient: input.supabaseClient,
  })
  return points.length
}

export async function refreshQuoteAndRecentHistory(
  security: InvestmentSecurity,
  options?: {
    supabaseClient?: SupabaseClientLike
  },
): Promise<{ quoteUpdated: boolean; historyPoints: number }> {
  const quote = await refreshQuoteCacheForSecurity(security, {
    force: true,
    supabaseClient: options?.supabaseClient,
  })
  const today = localDateString(new Date())
  const historyPoints = await refreshHistoryForSecurity(security, {
    startDate: addDays(today, -420),
    endDate: addDays(today, 1),
    supabaseClient: options?.supabaseClient,
  })

  return {
    quoteUpdated: Boolean(quote),
    historyPoints,
  }
}

export async function warmInvestmentMarketCaches(
  securities: InvestmentSecurity[],
  options?: {
    supabaseClient?: SupabaseClientLike
  },
): Promise<void> {
  await Promise.all(
    securities.map(async (security) => {
      await refreshQuoteAndRecentHistory(security, options)
    }),
  )
}
